# ADR-0004: Failure Classification Taxonomy

**Status:** Accepted
**Date:** 2026-07-20

## Context
Fuzzing campaigns can generate millions of permutations of input data, frequently resulting in thousands of individual crashes. When a contract has a single underlying vulnerability (e.g., an unhandled integer overflow on a specific function argument), a fuzzer might discover hundreds of variations of inputs that trigger that exact same panic line.
Without an intelligent classification and deduplication mechanism, developers are presented with an overwhelming wall of identical failures, obscuring other, distinct vulnerabilities.

## Decision
We introduced a deterministic Failure Classification Taxonomy (`taxonomy.rs`) combined with a cryptographic Signature Hashing strategy (`signature_hash.rs`).

1. **Categorization:** Every failure is parsed and bucketed into one of the following root categories based on payload properties and error semantics:
   - `EmptyInput`: The mutated payload was truncated to 0 bytes.
   - `OversizedInput`: The payload exceeded the maximum allowable limits (e.g., > 64 bytes).
   - `Xdr`: The input failed Soroban XDR deserialization bounds (typically indicated by specific byte prefixes 0x00-0x1F).
   - `State`: The contract panicked due to ledger state access violations or missing entries (0x20-0x5F).
   - `Budget`: The contract exceeded CPU or Mem bounds, terminating early (0x60-0x9F).
   - `Auth`: Authorization violations or matrix mismatches (0xA0-0xFF).
   - `Unknown`: Fallback for untyped panics.
2. **Signature Hashing:** A `CrashSignature` (SHA-256) is derived from the category, the contract stack trace (if available), and the error code.

## Rationale
- Grouping failures by a deterministic `signature_hash` allows the web dashboard to collapse 10,000 duplicate crashes into a single "Cluster" on the Failure Triage board.
- The categorization provides immediate semantic meaning to developers, answering "What kind of bug is this?" before they even inspect the payload.

## Consequences
- **Positive:** Massively reduces cognitive load during triage. Focuses engineering effort on distinct root causes rather than volume of crashes.
- **Negative:** If the taxonomy rules are too broad, distinct bugs might be incorrectly grouped under the same signature hash (a hash collision at the semantic level).
- **Mitigations:** The signature hashing algorithm incorporates fine-grained error codes and host trap metadata to ensure sufficient uniqueness.

## Compliance & Verification
The `classify()` module is comprehensively covered by unit tests that inject known failure traces and assert they are binned into the correct `taxonomy` bucket and yield expected signature hashes.
