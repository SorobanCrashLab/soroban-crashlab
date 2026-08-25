//! Scheduled job observability and manual trigger support.
//!
//! Tracks scheduled fuzzing campaigns with structured metadata, provides
//! execution history, last-run/next-run times, and a manual trigger API
//! with idempotent scheduling semantics.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

/// Unique identifier for a scheduled job.
pub type JobId = String;

/// Status of a scheduled job execution.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum JobStatus {
    /// Job has never run.
    Pending,
    /// Job is currently executing.
    Running,
    /// Last execution completed successfully.
    Succeeded,
    /// Last execution failed.
    Failed,
    /// Job was manually triggered and is queued.
    ManuallyTriggered,
}

impl std::fmt::Display for JobStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JobStatus::Pending => write!(f, "pending"),
            JobStatus::Running => write!(f, "running"),
            JobStatus::Succeeded => write!(f, "succeeded"),
            JobStatus::Failed => write!(f, "failed"),
            JobStatus::ManuallyTriggered => write!(f, "manually_triggered"),
        }
    }
}

/// A single execution record in the job's history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobExecution {
    pub run_id: String,
    pub triggered_at_ms: u64,
    pub completed_at_ms: Option<u64>,
    pub status: JobStatus,
    pub error_message: Option<String>,
    pub duration_ms: Option<u64>,
    pub manual: bool,
}

impl JobExecution {
    pub fn new_manual(run_id: impl Into<String>, triggered_at_ms: u64) -> Self {
        Self {
            run_id: run_id.into(),
            triggered_at_ms,
            completed_at_ms: None,
            status: JobStatus::ManuallyTriggered,
            error_message: None,
            duration_ms: None,
            manual: true,
        }
    }

    pub fn new_scheduled(run_id: impl Into<String>, triggered_at_ms: u64) -> Self {
        Self {
            run_id: run_id.into(),
            triggered_at_ms,
            completed_at_ms: None,
            status: JobStatus::Running,
            error_message: None,
            duration_ms: None,
            manual: false,
        }
    }

    /// Marks this execution as completed successfully.
    pub fn complete_success(&mut self, completed_at_ms: u64) {
        self.completed_at_ms = Some(completed_at_ms);
        self.duration_ms = Some(completed_at_ms.saturating_sub(self.triggered_at_ms));
        self.status = JobStatus::Succeeded;
    }

    /// Marks this execution as failed with an error.
    pub fn complete_failure(&mut self, completed_at_ms: u64, error: impl Into<String>) {
        self.completed_at_ms = Some(completed_at_ms);
        self.duration_ms = Some(completed_at_ms.saturating_sub(self.triggered_at_ms));
        self.status = JobStatus::Failed;
        self.error_message = Some(error.into());
    }
}

/// Cron-like schedule definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobSchedule {
    /// Cron expression (e.g. "0 */6 * * *") or interval label.
    pub cron_expression: String,
    /// Human-readable description (e.g. "Every 6 hours").
    pub description: String,
    /// Next scheduled execution timestamp (milliseconds since epoch).
    pub next_run_at_ms: Option<u64>,
    /// Whether the job is enabled.
    pub enabled: bool,
}

impl JobSchedule {
    pub fn new(cron_expression: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            cron_expression: cron_expression.into(),
            description: description.into(),
            next_run_at_ms: None,
            enabled: true,
        }
    }

    pub fn disabled(cron_expression: impl Into<String>, description: impl Into<String>) -> Self {
        let mut s = Self::new(cron_expression, description);
        s.enabled = false;
        s
    }
}

/// Observability snapshot for a scheduled job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobObservability {
    pub job_id: JobId,
    pub name: String,
    pub description: String,
    pub schedule: JobSchedule,
    pub current_status: JobStatus,
    pub last_run: Option<JobExecution>,
    pub next_run_at_ms: Option<u64>,
    pub total_runs: u64,
    pub total_successes: u64,
    pub total_failures: u64,
    pub manual_trigger_count: u64,
    /// Chronological execution history, newest last. Capped at `history_limit`.
    pub history: Vec<JobExecution>,
}

impl JobObservability {
    pub fn success_rate(&self) -> f64 {
        if self.total_runs == 0 {
            return 0.0;
        }
        self.total_successes as f64 / self.total_runs as f64
    }
}

/// Errors produced by the job registry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JobRegistryError {
    JobNotFound(JobId),
    JobAlreadyExists(JobId),
    JobAlreadyRunning(JobId),
}

impl std::fmt::Display for JobRegistryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JobRegistryError::JobNotFound(id) => write!(f, "Job not found: {}", id),
            JobRegistryError::JobAlreadyExists(id) => write!(f, "Job already exists: {}", id),
            JobRegistryError::JobAlreadyRunning(id) => write!(f, "Job already running: {}", id),
        }
    }
}

impl std::error::Error for JobRegistryError {}

/// Internal mutable state for a job.
#[derive(Debug)]
struct JobState {
    name: String,
    description: String,
    schedule: JobSchedule,
    current_status: JobStatus,
    history: VecDeque<JobExecution>,
    history_limit: usize,
    total_runs: u64,
    total_successes: u64,
    total_failures: u64,
    manual_trigger_count: u64,
}

impl JobState {
    fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        schedule: JobSchedule,
        history_limit: usize,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            schedule,
            current_status: JobStatus::Pending,
            history: VecDeque::new(),
            history_limit,
            total_runs: 0,
            total_successes: 0,
            total_failures: 0,
            manual_trigger_count: 0,
        }
    }

    fn record_execution(&mut self, exec: JobExecution) {
        if exec.manual {
            self.manual_trigger_count += 1;
        }
        self.total_runs += 1;
        self.history.push_back(exec);
        if self.history.len() > self.history_limit {
            self.history.pop_front();
        }
    }

    fn complete_execution(&mut self, run_id: &str, success: bool, error: Option<String>, completed_at_ms: u64) {
        if let Some(exec) = self.history.iter_mut().rev().find(|e| e.run_id == run_id) {
            if success {
                exec.complete_success(completed_at_ms);
                self.total_successes += 1;
            } else {
                exec.complete_failure(completed_at_ms, error.unwrap_or_default());
                self.total_failures += 1;
            }
        }
        self.current_status = if success { JobStatus::Succeeded } else { JobStatus::Failed };
    }

    fn to_observability(&self, job_id: &str) -> JobObservability {
        let history_vec: Vec<JobExecution> = self.history.iter().cloned().collect();
        let last_run = history_vec.last().cloned();
        JobObservability {
            job_id: job_id.to_string(),
            name: self.name.clone(),
            description: self.description.clone(),
            schedule: self.schedule.clone(),
            current_status: self.current_status.clone(),
            last_run,
            next_run_at_ms: self.schedule.next_run_at_ms,
            total_runs: self.total_runs,
            total_successes: self.total_successes,
            total_failures: self.total_failures,
            manual_trigger_count: self.manual_trigger_count,
            history: history_vec,
        }
    }
}

/// Thread-safe registry of observable scheduled jobs with manual trigger support.
#[derive(Debug, Clone, Default)]
pub struct JobRegistry {
    jobs: Arc<Mutex<std::collections::HashMap<JobId, JobState>>>,
    history_limit: usize,
}

impl JobRegistry {
    /// Creates a new registry. `history_limit` caps executions stored per job.
    pub fn new(history_limit: usize) -> Self {
        Self {
            jobs: Arc::new(Mutex::new(std::collections::HashMap::new())),
            history_limit,
        }
    }

    /// Registers a new job.
    pub fn register(
        &self,
        job_id: impl Into<JobId>,
        name: impl Into<String>,
        description: impl Into<String>,
        schedule: JobSchedule,
    ) -> Result<(), JobRegistryError> {
        let id: JobId = job_id.into();
        let mut lock = self.jobs.lock().unwrap();
        if lock.contains_key(&id) {
            return Err(JobRegistryError::JobAlreadyExists(id));
        }
        lock.insert(id, JobState::new(name, description, schedule, self.history_limit));
        Ok(())
    }

    /// Removes a job from the registry.
    pub fn deregister(&self, job_id: &str) -> Result<(), JobRegistryError> {
        let mut lock = self.jobs.lock().unwrap();
        lock.remove(job_id)
            .map(|_| ())
            .ok_or_else(|| JobRegistryError::JobNotFound(job_id.to_string()))
    }

    /// Returns observability data for a specific job.
    pub fn observe(&self, job_id: &str) -> Result<JobObservability, JobRegistryError> {
        let lock = self.jobs.lock().unwrap();
        lock.get(job_id)
            .map(|s| s.to_observability(job_id))
            .ok_or_else(|| JobRegistryError::JobNotFound(job_id.to_string()))
    }

    /// Returns observability snapshots for all registered jobs.
    pub fn observe_all(&self) -> Vec<JobObservability> {
        let lock = self.jobs.lock().unwrap();
        lock.iter().map(|(id, s)| s.to_observability(id)).collect()
    }

    /// Manually triggers a job by enqueuing a `ManuallyTriggered` execution record.
    /// Returns the generated run_id. Fails if job is already running.
    pub fn manual_trigger(
        &self,
        job_id: &str,
        run_id: impl Into<String>,
        triggered_at_ms: u64,
    ) -> Result<String, JobRegistryError> {
        let mut lock = self.jobs.lock().unwrap();
        let state = lock.get_mut(job_id)
            .ok_or_else(|| JobRegistryError::JobNotFound(job_id.to_string()))?;

        if state.current_status == JobStatus::Running {
            return Err(JobRegistryError::JobAlreadyRunning(job_id.to_string()));
        }

        let run_id_str: String = run_id.into();
        let exec = JobExecution::new_manual(run_id_str.clone(), triggered_at_ms);
        state.record_execution(exec);
        state.current_status = JobStatus::ManuallyTriggered;
        Ok(run_id_str)
    }

    /// Records a scheduled execution starting.
    pub fn record_scheduled_start(
        &self,
        job_id: &str,
        run_id: impl Into<String>,
        triggered_at_ms: u64,
    ) -> Result<String, JobRegistryError> {
        let mut lock = self.jobs.lock().unwrap();
        let state = lock.get_mut(job_id)
            .ok_or_else(|| JobRegistryError::JobNotFound(job_id.to_string()))?;

        if state.current_status == JobStatus::Running {
            return Err(JobRegistryError::JobAlreadyRunning(job_id.to_string()));
        }

        let run_id_str: String = run_id.into();
        let exec = JobExecution::new_scheduled(run_id_str.clone(), triggered_at_ms);
        state.record_execution(exec);
        state.current_status = JobStatus::Running;
        Ok(run_id_str)
    }

    /// Marks a running execution as complete.
    pub fn record_completion(
        &self,
        job_id: &str,
        run_id: &str,
        success: bool,
        error: Option<String>,
        completed_at_ms: u64,
    ) -> Result<(), JobRegistryError> {
        let mut lock = self.jobs.lock().unwrap();
        let state = lock.get_mut(job_id)
            .ok_or_else(|| JobRegistryError::JobNotFound(job_id.to_string()))?;
        state.complete_execution(run_id, success, error, completed_at_ms);
        Ok(())
    }

    /// Updates the next scheduled run time for a job.
    pub fn set_next_run_at(&self, job_id: &str, next_run_at_ms: u64) -> Result<(), JobRegistryError> {
        let mut lock = self.jobs.lock().unwrap();
        lock.get_mut(job_id)
            .ok_or_else(|| JobRegistryError::JobNotFound(job_id.to_string()))
            .map(|s| s.schedule.next_run_at_ms = Some(next_run_at_ms))
    }

    /// Enables or disables a job's schedule.
    pub fn set_enabled(&self, job_id: &str, enabled: bool) -> Result<(), JobRegistryError> {
        let mut lock = self.jobs.lock().unwrap();
        lock.get_mut(job_id)
            .ok_or_else(|| JobRegistryError::JobNotFound(job_id.to_string()))
            .map(|s| s.schedule.enabled = enabled)
    }

    /// Returns how many jobs are registered.
    pub fn len(&self) -> usize {
        self.jobs.lock().unwrap().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_registry() -> JobRegistry {
        JobRegistry::new(10)
    }

    fn make_schedule() -> JobSchedule {
        JobSchedule::new("0 */6 * * *", "Every 6 hours")
    }

    #[test]
    fn register_and_observe_job() {
        let reg = make_registry();
        reg.register("job-1", "Nightly Campaign", "Runs nightly", make_schedule()).unwrap();
        let obs = reg.observe("job-1").unwrap();
        assert_eq!(obs.job_id, "job-1");
        assert_eq!(obs.name, "Nightly Campaign");
        assert_eq!(obs.current_status, JobStatus::Pending);
        assert_eq!(obs.total_runs, 0);
    }

    #[test]
    fn duplicate_registration_fails() {
        let reg = make_registry();
        reg.register("job-1", "A", "B", make_schedule()).unwrap();
        assert!(matches!(
            reg.register("job-1", "A", "B", make_schedule()),
            Err(JobRegistryError::JobAlreadyExists(_))
        ));
    }

    #[test]
    fn observe_unknown_job_fails() {
        let reg = make_registry();
        assert!(matches!(
            reg.observe("nonexistent"),
            Err(JobRegistryError::JobNotFound(_))
        ));
    }

    #[test]
    fn manual_trigger_records_execution() {
        let reg = make_registry();
        reg.register("job-1", "X", "Y", make_schedule()).unwrap();
        let run_id = reg.manual_trigger("job-1", "run-001", 1000).unwrap();
        assert_eq!(run_id, "run-001");

        let obs = reg.observe("job-1").unwrap();
        assert_eq!(obs.current_status, JobStatus::ManuallyTriggered);
        assert_eq!(obs.manual_trigger_count, 1);
        assert_eq!(obs.total_runs, 1);
        assert!(obs.last_run.unwrap().manual);
    }

    #[test]
    fn manual_trigger_blocked_when_running() {
        let reg = make_registry();
        reg.register("job-1", "X", "Y", make_schedule()).unwrap();
        reg.record_scheduled_start("job-1", "run-001", 1000).unwrap();
        assert!(matches!(
            reg.manual_trigger("job-1", "run-002", 2000),
            Err(JobRegistryError::JobAlreadyRunning(_))
        ));
    }

    #[test]
    fn scheduled_start_and_success_completion() {
        let reg = make_registry();
        reg.register("job-1", "X", "Y", make_schedule()).unwrap();
        reg.record_scheduled_start("job-1", "run-001", 1000).unwrap();
        assert_eq!(reg.observe("job-1").unwrap().current_status, JobStatus::Running);

        reg.record_completion("job-1", "run-001", true, None, 5000).unwrap();
        let obs = reg.observe("job-1").unwrap();
        assert_eq!(obs.current_status, JobStatus::Succeeded);
        assert_eq!(obs.total_successes, 1);
        assert_eq!(obs.total_failures, 0);
        let exec = obs.last_run.unwrap();
        assert_eq!(exec.duration_ms, Some(4000));
    }

    #[test]
    fn scheduled_start_and_failure_completion() {
        let reg = make_registry();
        reg.register("job-1", "X", "Y", make_schedule()).unwrap();
        reg.record_scheduled_start("job-1", "run-001", 1000).unwrap();
        reg.record_completion("job-1", "run-001", false, Some("OOM".into()), 2000).unwrap();
        let obs = reg.observe("job-1").unwrap();
        assert_eq!(obs.current_status, JobStatus::Failed);
        assert_eq!(obs.total_failures, 1);
        assert_eq!(obs.last_run.unwrap().error_message.as_deref(), Some("OOM"));
    }

    #[test]
    fn history_capped_at_limit() {
        let reg = JobRegistry::new(3);
        reg.register("job-1", "X", "Y", make_schedule()).unwrap();
        for i in 0..5u64 {
            let run_id = format!("run-{}", i);
            reg.record_scheduled_start("job-1", &run_id, i * 1000).unwrap();
            reg.record_completion("job-1", &run_id, true, None, i * 1000 + 100).unwrap();
        }
        let obs = reg.observe("job-1").unwrap();
        assert_eq!(obs.history.len(), 3);
        assert_eq!(obs.total_runs, 5);
    }

    #[test]
    fn success_rate_calculation() {
        let reg = make_registry();
        reg.register("job-1", "X", "Y", make_schedule()).unwrap();
        reg.record_scheduled_start("job-1", "run-1", 0).unwrap();
        reg.record_completion("job-1", "run-1", true, None, 100).unwrap();
        reg.record_scheduled_start("job-1", "run-2", 200).unwrap();
        reg.record_completion("job-1", "run-2", false, None, 300).unwrap();

        let obs = reg.observe("job-1").unwrap();
        assert!((obs.success_rate() - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn next_run_at_update() {
        let reg = make_registry();
        reg.register("job-1", "X", "Y", make_schedule()).unwrap();
        reg.set_next_run_at("job-1", 99999).unwrap();
        let obs = reg.observe("job-1").unwrap();
        assert_eq!(obs.next_run_at_ms, Some(99999));
    }

    #[test]
    fn set_enabled_toggle() {
        let reg = make_registry();
        reg.register("job-1", "X", "Y", make_schedule()).unwrap();
        reg.set_enabled("job-1", false).unwrap();
        assert!(!reg.observe("job-1").unwrap().schedule.enabled);
        reg.set_enabled("job-1", true).unwrap();
        assert!(reg.observe("job-1").unwrap().schedule.enabled);
    }

    #[test]
    fn observe_all_returns_all_jobs() {
        let reg = make_registry();
        reg.register("job-1", "A", "B", make_schedule()).unwrap();
        reg.register("job-2", "C", "D", make_schedule()).unwrap();
        let all = reg.observe_all();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn deregister_removes_job() {
        let reg = make_registry();
        reg.register("job-1", "X", "Y", make_schedule()).unwrap();
        reg.deregister("job-1").unwrap();
        assert!(matches!(reg.observe("job-1"), Err(JobRegistryError::JobNotFound(_))));
    }
}
