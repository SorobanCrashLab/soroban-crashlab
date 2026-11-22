//! Storage backend conformance suite (#1830).
//!
//! One behavioral contract — TTL expiry precision, atomicity, error taxonomy,
//! streaming read equivalence and concurrent access safety — executed against
//! every [`ArtifactStore`] backend compiled into the build. Fault injection is
//! part of the contract: a write killed mid-flight must surface as a retryable
//! error and leave no partial state, and a torn (half-written) artifact must
//! surface as a typed corruption error rather than a silently truncated bundle.
//!
//! Policy: a conformance failure is a bug in the backend (or an explicitly
//! documented waiver tracked by its own issue), never a reason to weaken the
//! suite.
//!
//! Backends register by pointing the [`conformance_tests!`] macro at a factory
//! (see the `memory` and `local_fs` modules below). Remote backends (Redis KV,
//! MinIO) are conformed from the TypeScript side of the same contract in
//! `apps/web/src/lib/storage-conformance.test.ts`, where their clients live;
//! this Rust suite owns the in-process backends and defines the reference
//! semantics both languages assert.

use std::io::Read as _;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use crashlab_core::container_stress::{generate_container_stress_grid, ContainerStressConfig};
use crashlab_core::{
    save_case_bundle_json, to_bundle, ArtifactMetadata, ArtifactStore, CaseBundle, CaseSeed,
    LocalArtifactStore, MemoryArtifactStore, StorageError, StorageErrorKind,
    TTL_EXPIRY_SLACK_SECONDS,
};

/// Capabilities the suite adapts to per backend (#1830).
#[derive(Debug, Clone, Copy)]
struct BackendCaps {
    /// The backend enforces the TTL passed to `store_artifact_with_ttl`.
    ttl: bool,
    /// The backend can present a torn (partially written) artifact at its
    /// final location, e.g. a filesystem written without atomic replacement.
    /// In-memory stores cannot tear by construction and set this to `false`.
    can_tear: bool,
}

/// A ready-to-test backend instance plus its cleanup hook.
///
/// Dropping the harness cleans the backend up, so every scenario can take a
/// fresh instance without leaking temp directories across the test run. The
/// store itself is shared by [`Arc`] so fault wrappers and worker threads can
/// observe the same instance.
struct Harness {
    store: Arc<dyn ArtifactStore>,
    caps: BackendCaps,
    /// Writes `bytes` straight to the artifact's stored location, bypassing
    /// the store's atomic write path — models a write killed after half the
    /// bytes landed.
    tear: Option<Box<dyn Fn(&str, &[u8])>>,
    cleanup: Box<dyn Fn()>,
}

impl Drop for Harness {
    fn drop(&mut self) {
        (self.cleanup)();
    }
}

/// Builds a fresh harness for one scenario.
type Factory = fn() -> Harness;

/// Deterministic bundle builder: `to_bundle` derives the signature from the
/// seed, so equal (id, payload) pairs always produce equal bundles.
fn bundle(id: u64, payload: &[u8]) -> CaseBundle {
    to_bundle(CaseSeed {
        id,
        payload: payload.to_vec(),
    })
}

/// Consumes a reader in fixed-size chunks, asserting the contract's streaming
/// read path never short-reads into a hang.
fn read_chunked(store: &dyn ArtifactStore, artifact_id: &str, chunk: usize) -> Vec<u8> {
    let mut reader = store
        .open_artifact_reader(artifact_id)
        .unwrap_or_else(|e| panic!("open reader for {artifact_id}: {e:?}"));
    let mut out = Vec::new();
    let mut buf = vec![0u8; chunk];
    loop {
        let n = reader
            .read(&mut buf)
            .unwrap_or_else(|e| panic!("read chunk for {artifact_id}: {e}"));
        if n == 0 {
            break;
        }
        out.extend_from_slice(&buf[..n]);
    }
    out
}

/// Asserts `result` is an error of the expected contract class.
fn assert_kind<T>(result: Result<T, StorageError>, expected: StorageErrorKind, context: &str) {
    match result {
        Ok(_) => panic!("{context}: expected {expected:?}, got success"),
        Err(error) => {
            let kind = error.kind();
            assert_eq!(kind, expected, "{context}: wrong error kind ({error:?})");
        }
    }
}

/// Fault wrapper: the connection dies mid-write, so every write on this handle
/// fails with a transient (retryable) error and commits nothing — the contract
/// for a dropped connection (#1830 fault injection). Reads pass through
/// untouched so a scenario can inspect the store afterwards through the same
/// wrapper.
struct InterruptedWriteStore {
    inner: Arc<dyn ArtifactStore>,
    armed: AtomicBool,
}

impl InterruptedWriteStore {
    fn new(inner: Arc<dyn ArtifactStore>) -> Self {
        Self {
            inner,
            armed: AtomicBool::new(true),
        }
    }

    /// Kills the write once and leaves the connection dead afterwards: a
    /// dropped socket does not come back for the next call on the same handle,
    /// so the suite asserts both the killed write and the retry on it fail
    /// with the same retryable class.
    fn check_abort(&self) -> Result<(), StorageError> {
        if self.armed.swap(false, Ordering::SeqCst) {
            return Err(StorageError::Io(std::io::Error::new(
                std::io::ErrorKind::ConnectionReset,
                "injected: connection killed mid-write",
            )));
        }
        Err(StorageError::Io(std::io::Error::new(
            std::io::ErrorKind::ConnectionAborted,
            "injected: connection is still down",
        )))
    }
}

impl ArtifactStore for InterruptedWriteStore {
    fn store_artifact(
        &self,
        artifact_id: &str,
        bundle: &CaseBundle,
    ) -> Result<ArtifactMetadata, StorageError> {
        self.check_abort()?;
        self.inner.store_artifact(artifact_id, bundle)
    }

    fn store_artifact_with_ttl(
        &self,
        artifact_id: &str,
        bundle: &CaseBundle,
        ttl_secs: u64,
    ) -> Result<ArtifactMetadata, StorageError> {
        self.check_abort()?;
        self.inner
            .store_artifact_with_ttl(artifact_id, bundle, ttl_secs)
    }

    fn retrieve_artifact(&self, artifact_id: &str) -> Result<CaseBundle, StorageError> {
        self.inner.retrieve_artifact(artifact_id)
    }

    fn get_artifact_metadata(&self, artifact_id: &str) -> Result<ArtifactMetadata, StorageError> {
        self.inner.get_artifact_metadata(artifact_id)
    }

    fn list_artifacts(&self) -> Result<Vec<ArtifactMetadata>, StorageError> {
        self.inner.list_artifacts()
    }

    fn delete_artifact(&self, artifact_id: &str) -> Result<(), StorageError> {
        self.inner.delete_artifact(artifact_id)
    }

    fn artifact_exists(&self, artifact_id: &str) -> bool {
        self.inner.artifact_exists(artifact_id)
    }

    fn artifact_ttl_remaining(&self, artifact_id: &str) -> Option<u64> {
        self.inner.artifact_ttl_remaining(artifact_id)
    }

    fn retrieve_artifact_bytes(&self, artifact_id: &str) -> Result<Vec<u8>, StorageError> {
        self.inner.retrieve_artifact_bytes(artifact_id)
    }

    fn open_artifact_reader(
        &self,
        artifact_id: &str,
    ) -> Result<Box<dyn std::io::Read + Send>, StorageError> {
        self.inner.open_artifact_reader(artifact_id)
    }
}

/// A backend that keeps every default TTL method: a TTL request against it
/// must fail loudly as [`StorageErrorKind::Unsupported`] rather than being
/// silently ignored (#1830 error taxonomy).
struct NoTtlStore(Arc<dyn ArtifactStore>);

impl ArtifactStore for NoTtlStore {
    fn store_artifact(
        &self,
        artifact_id: &str,
        bundle: &CaseBundle,
    ) -> Result<ArtifactMetadata, StorageError> {
        self.0.store_artifact(artifact_id, bundle)
    }

    fn retrieve_artifact(&self, artifact_id: &str) -> Result<CaseBundle, StorageError> {
        self.0.retrieve_artifact(artifact_id)
    }

    fn get_artifact_metadata(&self, artifact_id: &str) -> Result<ArtifactMetadata, StorageError> {
        self.0.get_artifact_metadata(artifact_id)
    }

    fn list_artifacts(&self) -> Result<Vec<ArtifactMetadata>, StorageError> {
        self.0.list_artifacts()
    }

    fn delete_artifact(&self, artifact_id: &str) -> Result<(), StorageError> {
        self.0.delete_artifact(artifact_id)
    }

    fn artifact_exists(&self, artifact_id: &str) -> bool {
        self.0.artifact_exists(artifact_id)
    }
}

/// Expands into the full conformance suite for one backend.
///
/// Every scenario takes a fresh [`Harness`] from `$factory`, so backends never
/// share state between scenarios and can be cleaned up deterministically.
macro_rules! conformance_tests {
    ($factory:expr) => {
        /// Round trip: a stored bundle comes back byte-for-byte equal, with
        /// metadata that describes exactly what was persisted.
        #[test]
        fn round_trip_preserves_bundle() {
            let h = ($factory)();
            let store = h.store.as_ref();
            let input = bundle(1, b"conformance round trip payload");
            let meta = store
                .store_artifact("rt-1", &input)
                .unwrap_or_else(|e| panic!("store failed: {e:?}"));

            let got = store
                .retrieve_artifact("rt-1")
                .unwrap_or_else(|e| panic!("retrieve failed: {e:?}"));
            assert_eq!(got, input, "round-tripped bundle differs");

            let bytes = store.retrieve_artifact_bytes("rt-1").expect("bytes");
            assert_eq!(meta.size_bytes, bytes.len() as u64, "size metadata");
            assert!(store.artifact_exists("rt-1"), "exists after store");
            let listed = store.list_artifacts().expect("list");
            assert!(
                listed.iter().any(|m| m.id == "rt-1"),
                "stored id must be listed"
            );
        }

        /// Error taxonomy: an id that was never written reads as
        /// [`StorageErrorKind::NotFound`] on every read path, and reports as
        /// absent.
        #[test]
        fn missing_artifact_reads_as_not_found() {
            let h = ($factory)();
            let store = h.store.as_ref();
            let id = "definitely-missing";
            assert_kind(
                store.retrieve_artifact(id),
                StorageErrorKind::NotFound,
                "retrieve missing",
            );
            assert_kind(
                store.get_artifact_metadata(id),
                StorageErrorKind::NotFound,
                "metadata missing",
            );
            assert_kind(
                store.retrieve_artifact_bytes(id),
                StorageErrorKind::NotFound,
                "bytes missing",
            );
            assert!(!store.artifact_exists(id), "missing id must not exist");
            assert!(
                store
                    .list_artifacts()
                    .expect("list")
                    .iter()
                    .all(|m| m.id != id),
                "missing id must not be listed"
            );
        }

        /// Error taxonomy: every backend rejects exactly the same unusable
        /// ids, so a failover can never turn a rejected id into a stored one.
        #[test]
        fn invalid_ids_are_rejected_uniformly() {
            let h = ($factory)();
            let store = h.store.as_ref();
            let input = bundle(2, b"invalid id probe");
            for id in ["", "..", "a/b", "a\\b"] {
                assert_kind(
                    store.store_artifact(id, &input),
                    StorageErrorKind::InvalidId,
                    &format!("store invalid id {id:?}"),
                );
                assert_kind(
                    store.retrieve_artifact(id),
                    StorageErrorKind::InvalidId,
                    &format!("retrieve invalid id {id:?}"),
                );
                assert!(!store.artifact_exists(id), "invalid id {id:?} exists");
            }
        }

        /// Atomicity: overwriting an existing id replaces it wholesale. A
        /// reader never observes a mix of the old and new bundle.
        #[test]
        fn overwrite_replaces_wholesale() {
            let h = ($factory)();
            let store = h.store.as_ref();
            let first = bundle(3, b"first revision");
            let second = bundle(4, b"second revision, longer than the first one");
            store.store_artifact("over-1", &first).expect("store v1");
            store.store_artifact("over-1", &second).expect("store v2");

            let got = store.retrieve_artifact("over-1").expect("retrieve");
            assert_eq!(got, second, "overwrite must fully replace v1");
            let bytes = store.retrieve_artifact_bytes("over-1").expect("bytes");
            assert_eq!(
                bytes,
                save_case_bundle_json(&second).expect("serialize v2"),
                "stored bytes must be exactly v2"
            );
            let listed = store.list_artifacts().expect("list");
            assert_eq!(
                listed.iter().filter(|m| m.id == "over-1").count(),
                1,
                "overwrite must not duplicate the id"
            );
        }

        /// Atomicity + taxonomy: deleting is idempotent, and a deleted id
        /// reads as absent everywhere.
        #[test]
        fn delete_is_idempotent() {
            let h = ($factory)();
            let store = h.store.as_ref();
            store
                .store_artifact("del-1", &bundle(5, b"delete me"))
                .expect("store");
            store.delete_artifact("del-1").expect("first delete");
            store
                .delete_artifact("del-1")
                .expect("second delete must succeed");
            assert!(!store.artifact_exists("del-1"), "deleted id must vanish");
            assert_kind(
                store.retrieve_artifact("del-1"),
                StorageErrorKind::NotFound,
                "retrieve after delete",
            );
        }

        /// Error taxonomy: a backend without TTL support answers
        /// [`StorageErrorKind::Unsupported`] instead of storing forever.
        #[test]
        fn ttl_unsupported_is_typed() {
            let h = ($factory)();
            let no_ttl = NoTtlStore(Arc::clone(&h.store));
            assert_kind(
                no_ttl.store_artifact_with_ttl("ttl-unsupported", &bundle(6, b"ttl probe"), 60),
                StorageErrorKind::Unsupported,
                "ttl on a non-ttl backend",
            );
        }

        /// TTL expiry precision: never expires early, reads as absent once the
        /// deadline plus [`TTL_EXPIRY_SLACK_SECONDS`] has passed, and never
        /// lingers in listings.
        #[test]
        fn ttl_expiry_precision() {
            let h = ($factory)();
            if !h.caps.ttl {
                return;
            }
            let store = h.store.as_ref();

            // Never expires early: with a 3s TTL the artifact must survive the
            // first few hundred milliseconds regardless of clock rounding.
            store
                .store_artifact_with_ttl("ttl-early", &bundle(7, b"ttl early"), 3)
                .expect("store ttl=3");
            thread::sleep(Duration::from_millis(300));
            assert!(
                store.artifact_exists("ttl-early"),
                "artifact expired before its TTL elapsed"
            );
            store
                .retrieve_artifact("ttl-early")
                .expect("retrievable before expiry");

            // Reported remaining never exceeds what was requested.
            let remaining = store
                .artifact_ttl_remaining("ttl-early")
                .expect("ttl remaining must be reported");
            assert!(remaining <= 3, "ttl remaining overshoots: {remaining}");

            // Past the deadline plus slack, the artifact reads as absent
            // everywhere — including the TTL query itself.
            let ttl = 1u64;
            let id = "ttl-expiry";
            store
                .store_artifact_with_ttl(id, &bundle(8, b"ttl expiry"), ttl)
                .expect("store ttl=1");
            thread::sleep(Duration::from_secs(ttl + TTL_EXPIRY_SLACK_SECONDS + 2));
            assert!(
                !store.artifact_exists(id),
                "expired artifact still exists after ttl+slack"
            );
            assert_kind(
                store.retrieve_artifact(id),
                StorageErrorKind::NotFound,
                "retrieve after expiry",
            );
            assert_kind(
                store.get_artifact_metadata(id),
                StorageErrorKind::NotFound,
                "metadata after expiry",
            );
            assert_eq!(
                store.artifact_ttl_remaining(id),
                None,
                "expired artifact must report no TTL remaining"
            );
            assert!(
                store
                    .list_artifacts()
                    .expect("list")
                    .iter()
                    .all(|m| m.id != id),
                "expired artifact must not be listed"
            );
        }

        /// TTL sidecars are an implementation detail: a TTL write lists the
        /// artifact itself and nothing else.
        #[test]
        fn ttl_write_lists_only_the_artifact() {
            let h = ($factory)();
            if !h.caps.ttl {
                return;
            }
            let store = h.store.as_ref();
            store
                .store_artifact_with_ttl("ttl-list", &bundle(9, b"ttl listing"), 120)
                .expect("store ttl");
            let listed = store.list_artifacts().expect("list");
            let ids: Vec<&str> = listed.iter().map(|m| m.id.as_str()).collect();
            assert_eq!(ids, vec!["ttl-list"], "listing leaked non-artifact entries");
        }

        /// Streaming read equivalence: chunked reads over the streaming path
        /// reproduce the whole-read bytes exactly, and the size in metadata
        /// matches both.
        #[test]
        fn streaming_read_matches_whole_read() {
            let h = ($factory)();
            let store = h.store.as_ref();
            let stress = ContainerStressConfig::new(0, 4, 0, 4);
            for (i, seed) in generate_container_stress_grid(500, &stress)
                .into_iter()
                .take(6)
                .enumerate()
            {
                let id = format!("stream-{i}");
                let input = to_bundle(seed);
                store.store_artifact(&id, &input).expect("store");

                let whole = store.retrieve_artifact_bytes(&id).expect("whole bytes");
                let chunked = read_chunked(store, &id, 7);
                assert_eq!(
                    chunked, whole,
                    "streaming read diverges from whole read for {id}"
                );
                let meta = store.get_artifact_metadata(&id).expect("metadata");
                assert_eq!(
                    meta.size_bytes,
                    whole.len() as u64,
                    "metadata size diverges from stored bytes for {id}"
                );
            }
        }

        /// Fault injection — interrupted write: a write killed mid-flight is a
        /// retryable error, and the store is left exactly as it was. No
        /// partial state, ever.
        #[test]
        fn interrupted_write_leaves_no_partial_state() {
            let h = ($factory)();
            let good = bundle(10, b"known good revision");
            h.store
                .store_artifact("fault-1", &good)
                .expect("seed the artifact");

            let faulted = InterruptedWriteStore::new(Arc::clone(&h.store));
            let replacement = bundle(11, b"replacement that never lands");
            assert_kind(
                faulted.store_artifact("fault-1", &replacement),
                StorageErrorKind::Transient,
                "killed overwrite",
            );
            assert_kind(
                faulted.store_artifact("fault-fresh", &replacement),
                StorageErrorKind::Transient,
                "killed first write",
            );
            drop(faulted);

            let store = h.store.as_ref();
            let got = store.retrieve_artifact("fault-1").expect("old value");
            assert_eq!(
                got, good,
                "interrupted overwrite corrupted the previous value"
            );
            assert!(
                !store.artifact_exists("fault-fresh"),
                "interrupted first write left partial state"
            );
        }

        /// Fault injection — torn write: when half-written bytes do land at
        /// the final location, the parsing read surfaces a typed corruption
        /// error. Raw reads surface exactly what is stored; integrity is the
        /// parsing read's job, and it never silently returns a truncated
        /// bundle.
        #[test]
        fn torn_write_surfaces_as_corrupt() {
            let h = ($factory)();
            if !h.caps.can_tear {
                return;
            }
            let tear = h
                .tear
                .as_ref()
                .expect("can_tear backends provide a tear hook");
            let store = h.store.as_ref();
            let good = bundle(12, b"artifact that will be torn");
            store.store_artifact("torn-1", &good).expect("store");

            let complete = save_case_bundle_json(&bundle(13, b"other revision"))
                .expect("serialize other revision");
            let torn = complete[..complete.len() / 2].to_vec();
            tear("torn-1", &torn);

            assert!(
                store.artifact_exists("torn-1"),
                "torn bytes are still present until swept"
            );
            assert_kind(
                store.retrieve_artifact("torn-1"),
                StorageErrorKind::Corrupt,
                "parsing a torn artifact",
            );
            let raw = store
                .retrieve_artifact_bytes("torn-1")
                .expect("raw bytes are returned as stored");
            assert_eq!(raw, torn, "raw read must surface the stored bytes");
        }

        /// Concurrent access safety: parallel writers with private ids all
        /// round-trip intact, and readers of a hot id never observe a
        /// half-written bundle.
        #[test]
        fn concurrent_access_is_safe() {
            let h = ($factory)();
            let threads = 4usize;
            let ops = 24usize;

            let mut handles = Vec::new();
            for t in 0..threads {
                let store = Arc::clone(&h.store);
                handles.push(thread::spawn(move || {
                    for op in 0..ops {
                        let id = format!("cc-{t}-{op}");
                        let payload = format!("t{t}op{op}");
                        let input = bundle(1000 + (t * ops + op) as u64, payload.as_bytes());
                        store
                            .store_artifact(&id, &input)
                            .unwrap_or_else(|e| panic!("store {id}: {e:?}"));
                        let got = store
                            .retrieve_artifact(&id)
                            .unwrap_or_else(|e| panic!("retrieve {id}: {e:?}"));
                        assert_eq!(got, input, "concurrent round trip diverged for {id}");
                    }
                }));
            }

            // Hot id: one writer flips between two revisions while readers
            // stream it. Every complete read is one whole revision.
            let hot_id = "cc-hot".to_string();
            let v1 = bundle(2001, b"hot revision one");
            let v2 = bundle(2002, b"hot revision two, different length");
            let v1_bytes = save_case_bundle_json(&v1).expect("serialize v1");
            let v2_bytes = save_case_bundle_json(&v2).expect("serialize v2");

            {
                let store = Arc::clone(&h.store);
                let hot_id = hot_id.clone();
                handles.push(thread::spawn(move || {
                    for i in 0..48 {
                        let next: &CaseBundle = if i % 2 == 0 { &v1 } else { &v2 };
                        store
                            .store_artifact(&hot_id, next)
                            .unwrap_or_else(|e| panic!("hot store: {e:?}"));
                    }
                }));
            }
            for _ in 0..3 {
                let store = Arc::clone(&h.store);
                let hot_id = hot_id.clone();
                let v1_bytes = v1_bytes.clone();
                let v2_bytes = v2_bytes.clone();
                handles.push(thread::spawn(move || {
                    for _ in 0..64 {
                        if let Ok(bytes) = store.retrieve_artifact_bytes(&hot_id) {
                            assert!(
                                bytes == v1_bytes || bytes == v2_bytes,
                                "hot read returned a mix of revisions ({} bytes)",
                                bytes.len()
                            );
                        }
                    }
                }));
            }

            for handle in handles {
                handle.join().expect("concurrent access thread panicked");
            }
        }

        /// Container-stress payloads round-trip through the backend unchanged:
        /// the chaos generators double as the shared corpus for the contract.
        #[test]
        fn container_stress_payloads_round_trip() {
            let h = ($factory)();
            let store = h.store.as_ref();
            let stress = ContainerStressConfig::new(0, 3, 0, 3);
            for (i, seed) in generate_container_stress_grid(900, &stress)
                .into_iter()
                .enumerate()
            {
                let id = format!("stress-{i}");
                let input = to_bundle(seed);
                store.store_artifact(&id, &input).expect("store stress");
                let got = store.retrieve_artifact(&id).expect("retrieve stress");
                assert_eq!(got, input, "stress payload diverged for {id}");
            }
        }
    };
}

/// Per-backend test modules.
///
/// Remote backends plug into the same macro when they gain an in-process
/// client; the TypeScript suite covers them today (see module docs).
mod memory {
    use super::*;

    fn harness() -> Harness {
        Harness {
            store: Arc::new(MemoryArtifactStore::new()),
            caps: BackendCaps {
                ttl: true,
                // A map insert is atomic by construction: there is no
                // partially-committed representation to tear.
                can_tear: false,
            },
            tear: None,
            cleanup: Box::new(|| {}),
        }
    }

    conformance_tests!(harness);
}

mod local_fs {
    use super::*;

    static NEXT_DIR: AtomicUsize = AtomicUsize::new(0);

    fn harness() -> Harness {
        let dir: PathBuf = std::env::temp_dir().join(format!(
            "crashlab-conformance-fs-{}-{}",
            std::process::id(),
            NEXT_DIR.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let store = LocalArtifactStore::new(&dir).expect("create local store");
        let tear_dir = dir.clone();
        let cleanup_dir = dir.clone();
        Harness {
            store: Arc::new(store),
            caps: BackendCaps {
                ttl: true,
                can_tear: true,
            },
            tear: Some(Box::new(move |artifact_id, bytes| {
                let path = tear_dir.join(format!("{artifact_id}.json"));
                std::fs::write(&path, bytes).expect("tear write");
            })),
            cleanup: Box::new(move || {
                let _ = std::fs::remove_dir_all(&cleanup_dir);
            }),
        }
    }

    conformance_tests!(harness);
}
