use serde::{Serialize, Deserialize};
use std::collections::BTreeMap;
use std::time::Instant;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HealthSummary {
    pub status: HealthStatus,
    pub throughput: ThroughputMetrics,
    pub failures: FailureMetrics,
    pub queue: QueueMetrics,
    /// Failures per [`FailureClass::as_str`](crate::taxonomy::FailureClass::as_str)
    /// label, for operators who need to know *what* is failing, not just how often.
    ///
    /// `#[serde(default)]` keeps summaries written before this field existed readable.
    #[serde(default)]
    pub failure_classes: BTreeMap<String, u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ThroughputMetrics {
    pub cases_per_second: f64,
    pub total_cases: u64,
    pub elapsed_secs: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FailureMetrics {
    pub total_failures: u64,
    pub unique_signatures: u64,
    pub failure_rate: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QueueMetrics {
    pub pending: u64,
    pub in_progress: u64,
    pub capacity: u64,
    pub utilization: f64,
}

pub fn export_health_summary_json(summary: &HealthSummary) -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(summary)
}

#[derive(Debug)]
pub struct HealthMonitor {
    start_time: Instant,
    total_cases: u64,
    total_failures: u64,
    unique_signatures: u64,
    queue_pending: u64,
    queue_in_progress: u64,
    queue_capacity: u64,
    degraded_throughput_threshold: f64,
    unhealthy_failure_rate_threshold: f64,
    failure_classes: BTreeMap<String, u64>,
}

impl HealthMonitor {
    pub fn new(queue_capacity: u64) -> Self {
        Self {
            start_time: Instant::now(),
            total_cases: 0,
            total_failures: 0,
            unique_signatures: 0,
            queue_pending: 0,
            queue_in_progress: 0,
            queue_capacity,
            degraded_throughput_threshold: 10.0,
            unhealthy_failure_rate_threshold: 0.5,
            failure_classes: BTreeMap::new(),
        }
    }

    pub fn with_thresholds(
        queue_capacity: u64,
        degraded_throughput_threshold: f64,
        unhealthy_failure_rate_threshold: f64,
    ) -> Self {
        Self {
            start_time: Instant::now(),
            total_cases: 0,
            total_failures: 0,
            unique_signatures: 0,
            queue_pending: 0,
            queue_in_progress: 0,
            queue_capacity,
            degraded_throughput_threshold,
            unhealthy_failure_rate_threshold,
            failure_classes: BTreeMap::new(),
        }
    }

    pub fn record_case(&mut self) {
        self.total_cases += 1;
    }

    pub fn record_failure(&mut self, is_new_signature: bool) {
        self.total_failures += 1;
        if is_new_signature {
            self.unique_signatures += 1;
        }
    }

    /// Records a failure and attributes it to a failure class.
    ///
    /// `class` is a stable label — normally
    /// [`FailureClass::as_str`](crate::taxonomy::FailureClass::as_str) — so the
    /// counts can be reported without knowing the taxonomy's enum here.
    pub fn record_classified_failure(&mut self, class: &str, is_new_signature: bool) {
        self.record_failure(is_new_signature);
        *self.failure_classes.entry(class.to_string()).or_insert(0) += 1;
    }

    /// Failures recorded per failure class so far, keyed by class label.
    pub fn failure_classes(&self) -> &BTreeMap<String, u64> {
        &self.failure_classes
    }

    pub fn update_queue(&mut self, pending: u64, in_progress: u64) {
        self.queue_pending = pending;
        self.queue_in_progress = in_progress;
    }

    pub fn summary(&self) -> HealthSummary {
        let elapsed = self.start_time.elapsed();
        let elapsed_secs = elapsed.as_secs_f64();

        let cases_per_second = if elapsed_secs > 0.0 {
            self.total_cases as f64 / elapsed_secs
        } else {
            0.0
        };

        let failure_rate = if self.total_cases > 0 {
            self.total_failures as f64 / self.total_cases as f64
        } else {
            0.0
        };

        let utilization = if self.queue_capacity > 0 {
            (self.queue_pending + self.queue_in_progress) as f64 / self.queue_capacity as f64
        } else {
            0.0
        };

        let throughput = ThroughputMetrics {
            cases_per_second,
            total_cases: self.total_cases,
            elapsed_secs,
        };

        let failures = FailureMetrics {
            total_failures: self.total_failures,
            unique_signatures: self.unique_signatures,
            failure_rate,
        };

        let queue = QueueMetrics {
            pending: self.queue_pending,
            in_progress: self.queue_in_progress,
            capacity: self.queue_capacity,
            utilization,
        };

        let status = self.compute_status(&throughput, &failures, &queue);

        HealthSummary {
            status,
            throughput,
            failures,
            queue,
            failure_classes: self.failure_classes.clone(),
        }
    }

    pub fn endpoint(&self) -> String {
        serde_json::to_string(&self.summary()).unwrap_or_default()
    }

    pub fn export_json(&self) -> Result<String, serde_json::Error> {
        export_health_summary_json(&self.summary())
    }

    fn compute_status(
        &self,
        throughput: &ThroughputMetrics,
        failures: &FailureMetrics,
        queue: &QueueMetrics,
    ) -> HealthStatus {
        if failures.failure_rate > self.unhealthy_failure_rate_threshold {
            return HealthStatus::Unhealthy;
        }

        if queue.utilization > 0.95 {
            return HealthStatus::Unhealthy;
        }

        if throughput.cases_per_second < self.degraded_throughput_threshold
            && throughput.total_cases > 0
        {
            return HealthStatus::Degraded;
        }

        if queue.utilization > 0.8 {
            return HealthStatus::Degraded;
        }

        HealthStatus::Healthy
    }

    pub fn reset(&mut self) {
        self.start_time = Instant::now();
        self.total_cases = 0;
        self.total_failures = 0;
        self.unique_signatures = 0;
        self.queue_pending = 0;
        self.queue_in_progress = 0;
        self.failure_classes.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn new_monitor_starts_healthy() {
        let monitor = HealthMonitor::new(100);
        let summary = monitor.summary();
        assert_eq!(summary.status, HealthStatus::Healthy);
        assert_eq!(summary.throughput.total_cases, 0);
        assert_eq!(summary.failures.total_failures, 0);
    }

    #[test]
    fn record_case_increments_total() {
        let mut monitor = HealthMonitor::new(100);
        monitor.record_case();
        monitor.record_case();
        monitor.record_case();
        let summary = monitor.summary();
        assert_eq!(summary.throughput.total_cases, 3);
    }

    #[test]
    fn record_failure_updates_metrics() {
        let mut monitor = HealthMonitor::new(100);
        monitor.record_case();
        monitor.record_failure(true);
        monitor.record_case();
        monitor.record_failure(false);

        let summary = monitor.summary();
        assert_eq!(summary.failures.total_failures, 2);
        assert_eq!(summary.failures.unique_signatures, 1);
    }

    #[test]
    fn failure_rate_calculated_correctly() {
        let mut monitor = HealthMonitor::new(100);
        for _ in 0..10 {
            monitor.record_case();
        }
        for _ in 0..3 {
            monitor.record_failure(false);
        }

        let summary = monitor.summary();
        assert!((summary.failures.failure_rate - 0.3).abs() < 0.001);
    }

    #[test]
    fn high_failure_rate_marks_unhealthy() {
        let mut monitor = HealthMonitor::with_thresholds(100, 10.0, 0.5);
        for _ in 0..10 {
            monitor.record_case();
        }
        for _ in 0..6 {
            monitor.record_failure(false);
        }

        let summary = monitor.summary();
        assert_eq!(summary.status, HealthStatus::Unhealthy);
    }

    #[test]
    fn queue_utilization_calculated_correctly() {
        let mut monitor = HealthMonitor::new(100);
        monitor.update_queue(30, 20);

        let summary = monitor.summary();
        assert_eq!(summary.queue.pending, 30);
        assert_eq!(summary.queue.in_progress, 20);
        assert!((summary.queue.utilization - 0.5).abs() < 0.001);
    }

    #[test]
    fn high_queue_utilization_marks_degraded() {
        let mut monitor = HealthMonitor::new(100);
        monitor.update_queue(70, 15);

        let summary = monitor.summary();
        assert_eq!(summary.status, HealthStatus::Degraded);
    }

    #[test]
    fn critical_queue_utilization_marks_unhealthy() {
        let mut monitor = HealthMonitor::new(100);
        monitor.update_queue(80, 18);

        let summary = monitor.summary();
        assert_eq!(summary.status, HealthStatus::Unhealthy);
    }

    #[test]
    fn reset_clears_all_metrics() {
        let mut monitor = HealthMonitor::new(100);
        monitor.record_case();
        monitor.record_failure(true);
        monitor.update_queue(10, 5);
        monitor.reset();

        let summary = monitor.summary();
        assert_eq!(summary.throughput.total_cases, 0);
        assert_eq!(summary.failures.total_failures, 0);
        assert_eq!(summary.failures.unique_signatures, 0);
        assert_eq!(summary.queue.pending, 0);
        assert_eq!(summary.queue.in_progress, 0);
    }

    #[test]
    fn throughput_calculated_over_time() {
        let mut monitor = HealthMonitor::new(100);
        monitor.start_time = Instant::now() - Duration::from_millis(100);
        for _ in 0..100 {
            monitor.record_case();
        }

        let summary = monitor.summary();
        assert!(summary.throughput.cases_per_second > 0.0);
        assert!(summary.throughput.elapsed_secs >= 0.1);
    }

    #[test]
    fn zero_capacity_queue_handles_gracefully() {
        let monitor = HealthMonitor::new(0);
        let summary = monitor.summary();
        assert_eq!(summary.queue.utilization, 0.0);
    }

    #[test]
    fn custom_thresholds_applied() {
        let mut monitor = HealthMonitor::with_thresholds(100, 100.0, 0.1);
        for _ in 0..10 {
            monitor.record_case();
        }
        for _ in 0..2 {
            monitor.record_failure(false);
        }

        let summary = monitor.summary();
        assert_eq!(summary.status, HealthStatus::Unhealthy);
    }

    #[test]
    fn endpoint_returns_json() {
        let monitor = HealthMonitor::new(100);
        let json = monitor.endpoint();
        assert!(json.contains("\"status\":\"Healthy\""));
        assert!(json.contains("\"throughput\""));
        assert!(json.contains("\"failures\""));
        assert!(json.contains("\"queue\""));
    }

    #[test]
    fn exports_health_summary_json() {
        let mut monitor = HealthMonitor::new(100);
        monitor.record_case();
        monitor.update_queue(4, 1);

        let json = monitor.export_json().unwrap();
        let exported: HealthSummary = serde_json::from_str(&json).unwrap();

        assert_eq!(exported.throughput.total_cases, 1);
        assert_eq!(exported.queue.pending, 4);
        assert_eq!(exported.queue.in_progress, 1);
    }

    #[test]
    fn classified_failures_are_counted_per_class() {
        let mut monitor = HealthMonitor::new(100);
        for _ in 0..5 {
            monitor.record_case();
        }
        monitor.record_classified_failure("auth", true);
        monitor.record_classified_failure("auth", false);
        monitor.record_classified_failure("timeout", false);

        let summary = monitor.summary();
        assert_eq!(summary.failures.total_failures, 3);
        assert_eq!(summary.failures.unique_signatures, 1);
        assert_eq!(summary.failure_classes.get("auth"), Some(&2));
        assert_eq!(summary.failure_classes.get("timeout"), Some(&1));
        assert_eq!(summary.failure_classes.get("state"), None);
    }

    #[test]
    fn unclassified_failures_leave_class_map_empty() {
        let mut monitor = HealthMonitor::new(100);
        monitor.record_case();
        monitor.record_failure(false);

        let summary = monitor.summary();
        assert_eq!(summary.failures.total_failures, 1);
        assert!(summary.failure_classes.is_empty());
    }

    #[test]
    fn reset_clears_failure_classes() {
        let mut monitor = HealthMonitor::new(100);
        monitor.record_classified_failure("xdr", false);
        monitor.reset();

        assert!(monitor.failure_classes().is_empty());
        assert!(monitor.summary().failure_classes.is_empty());
    }

    #[test]
    fn summaries_without_failure_classes_still_deserialize() {
        // A payload written before `failure_classes` existed must stay readable.
        let legacy = r#"{
            "status": "Healthy",
            "throughput": { "cases_per_second": 1.0, "total_cases": 1, "elapsed_secs": 1.0 },
            "failures": { "total_failures": 0, "unique_signatures": 0, "failure_rate": 0.0 },
            "queue": { "pending": 0, "in_progress": 0, "capacity": 10, "utilization": 0.0 }
        }"#;

        let parsed: HealthSummary = serde_json::from_str(legacy).unwrap();
        assert_eq!(parsed.status, HealthStatus::Healthy);
        assert!(parsed.failure_classes.is_empty());
    }
}
