//! Prometheus metrics exposition format generator and registry.
//!
//! Exposes fuzzing engine metrics (seed counts, crashes, queue depth, throughput,
//! latency histograms) formatted per the Prometheus Text Exposition specification (v0.0.4).

use std::collections::BTreeMap;
use std::fmt::Write as FmtWrite;
use std::sync::{Arc, RwLock};

/// Type of Prometheus metric.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MetricType {
    Counter,
    Gauge,
    Histogram,
}

impl MetricType {
    pub fn as_str(&self) -> &'static str {
        match self {
            MetricType::Counter => "counter",
            MetricType::Gauge => "gauge",
            MetricType::Histogram => "histogram",
        }
    }
}

/// A collection of sorted key-value label pairs.
pub type Labels = BTreeMap<String, String>;

/// Formats labels into Prometheus syntax `{k="v",...}`.
pub fn format_labels(labels: &Labels) -> String {
    if labels.is_empty() {
        return String::new();
    }
    let pairs: Vec<String> = labels
        .iter()
        .map(|(k, v)| {
            let escaped = v.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n");
            format!("{}=\"{}\"", k, escaped)
        })
        .collect();
    format!("{{{}}}", pairs.join(","))
}

/// Represents an individual Prometheus metric descriptor and its values.
#[derive(Debug, Clone)]
pub struct MetricFamily {
    pub name: String,
    pub help: String,
    pub metric_type: MetricType,
    pub samples: Vec<(Labels, f64)>,
    pub histograms: Vec<HistogramSample>,
}

#[derive(Debug, Clone)]
pub struct HistogramSample {
    pub labels: Labels,
    pub buckets: Vec<(f64, u64)>,
    pub count: u64,
    pub sum: f64,
}

/// Thread-safe metric registry for Prometheus exposition.
#[derive(Debug, Clone, Default)]
pub struct MetricRegistry {
    counters: Arc<RwLock<BTreeMap<String, (String, BTreeMap<Labels, f64>)>>>,
    gauges: Arc<RwLock<BTreeMap<String, (String, BTreeMap<Labels, f64>)>>>,
    histograms: Arc<RwLock<BTreeMap<String, (String, Vec<f64>, BTreeMap<Labels, (Vec<u64>, u64, f64)>)>>>,
}

impl MetricRegistry {
    pub fn new() -> Self {
        Self {
            counters: Arc::new(RwLock::new(BTreeMap::new())),
            gauges: Arc::new(RwLock::new(BTreeMap::new())),
            histograms: Arc::new(RwLock::new(BTreeMap::new())),
        }
    }

    /// Registers or updates a counter metric with a description.
    pub fn register_counter(&self, name: impl Into<String>, help: impl Into<String>) {
        let mut lock = self.counters.write().unwrap();
        let name_str = name.into();
        lock.entry(name_str).or_insert_with(|| (help.into(), BTreeMap::new()));
    }

    /// Increments a counter by 1.0 for given labels.
    pub fn inc_counter(&self, name: &str, labels: Labels) {
        self.add_counter(name, labels, 1.0);
    }

    /// Adds a non-negative amount to a counter.
    pub fn add_counter(&self, name: &str, labels: Labels, value: f64) {
        if value < 0.0 {
            return;
        }
        let mut lock = self.counters.write().unwrap();
        if let Some((_, samples)) = lock.get_mut(name) {
            *samples.entry(labels).or_insert(0.0) += value;
        }
    }

    /// Registers or updates a gauge metric.
    pub fn register_gauge(&self, name: impl Into<String>, help: impl Into<String>) {
        let mut lock = self.gauges.write().unwrap();
        let name_str = name.into();
        lock.entry(name_str).or_insert_with(|| (help.into(), BTreeMap::new()));
    }

    /// Sets the value of a gauge.
    pub fn set_gauge(&self, name: &str, labels: Labels, value: f64) {
        let mut lock = self.gauges.write().unwrap();
        if let Some((_, samples)) = lock.get_mut(name) {
            samples.insert(labels, value);
        }
    }

    /// Registers a histogram metric with upper bound bucket boundaries.
    pub fn register_histogram(
        &self,
        name: impl Into<String>,
        help: impl Into<String>,
        buckets: Vec<f64>,
    ) {
        let mut sorted_buckets = buckets;
        sorted_buckets.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        if sorted_buckets.last().copied() != Some(f64::INFINITY) {
            sorted_buckets.push(f64::INFINITY);
        }

        let mut lock = self.histograms.write().unwrap();
        lock.entry(name.into())
            .or_insert_with(|| (help.into(), sorted_buckets, BTreeMap::new()));
    }

    /// Observes a value in a histogram.
    pub fn observe_histogram(&self, name: &str, labels: Labels, value: f64) {
        let mut lock = self.histograms.write().unwrap();
        if let Some((_, bucket_bounds, series)) = lock.get_mut(name) {
            let entry = series.entry(labels).or_insert_with(|| {
                let counts = vec![0u64; bucket_bounds.len()];
                (counts, 0u64, 0.0)
            });

            for (i, bound) in bucket_bounds.iter().enumerate() {
                if value <= *bound {
                    entry.0[i] += 1;
                }
            }
            entry.1 += 1; // count
            entry.2 += value; // sum
        }
    }

    /// Generates Prometheus Text Exposition output (version 0.0.4).
    pub fn render_prometheus_text(&self) -> String {
        let mut out = String::new();

        // 1. Render Counters
        {
            let lock = self.counters.read().unwrap();
            for (name, (help, samples)) in lock.iter() {
                let _ = writeln!(out, "# HELP {} {}", name, help);
                let _ = writeln!(out, "# TYPE {} counter", name);
                for (labels, val) in samples {
                    let label_str = format_labels(labels);
                    let _ = writeln!(out, "{}{} {}", name, label_str, val);
                }
            }
        }

        // 2. Render Gauges
        {
            let lock = self.gauges.read().unwrap();
            for (name, (help, samples)) in lock.iter() {
                let _ = writeln!(out, "# HELP {} {}", name, help);
                let _ = writeln!(out, "# TYPE {} gauge", name);
                for (labels, val) in samples {
                    let label_str = format_labels(labels);
                    let _ = writeln!(out, "{}{} {}", name, label_str, val);
                }
            }
        }

        // 3. Render Histograms
        {
            let lock = self.histograms.read().unwrap();
            for (name, (help, bounds, series)) in lock.iter() {
                let _ = writeln!(out, "# HELP {} {}", name, help);
                let _ = writeln!(out, "# TYPE {} histogram", name);

                for (labels, (counts, count, sum)) in series {
                    let mut cumulative = 0u64;
                    for (i, bound) in bounds.iter().enumerate() {
                        let mut bucket_labels = labels.clone();
                        let le_val = if bound.is_infinite() {
                            "+Inf".to_string()
                        } else {
                            bound.to_string()
                        };
                        bucket_labels.insert("le".to_string(), le_val);
                        cumulative += counts[i];
                        let _ = writeln!(
                            out,
                            "{}_bucket{} {}",
                            name,
                            format_labels(&bucket_labels),
                            cumulative
                        );
                    }
                    let label_str = format_labels(labels);
                    let _ = writeln!(out, "{}_sum{} {}", name, label_str, sum);
                    let _ = writeln!(out, "{}_count{} {}", name, label_str, count);
                }
            }
        }

        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counter_increments_and_renders() {
        let registry = MetricRegistry::new();
        registry.register_counter("fuzz_seeds_total", "Total seeds processed");

        let mut labels = BTreeMap::new();
        labels.insert("contract".to_string(), "token".to_string());
        labels.insert("mode".to_string(), "enforce".to_string());

        registry.inc_counter("fuzz_seeds_total", labels.clone());
        registry.add_counter("fuzz_seeds_total", labels.clone(), 4.0);

        let output = registry.render_prometheus_text();
        assert!(output.contains("# HELP fuzz_seeds_total Total seeds processed"));
        assert!(output.contains("# TYPE fuzz_seeds_total counter"));
        assert!(output.contains("fuzz_seeds_total{contract=\"token\",mode=\"enforce\"} 5"));
    }

    #[test]
    fn gauge_updates_and_renders() {
        let registry = MetricRegistry::new();
        registry.register_gauge("fuzz_queue_depth", "Current seeds in queue");

        let mut labels = BTreeMap::new();
        labels.insert("worker_id".to_string(), "0".to_string());

        registry.set_gauge("fuzz_queue_depth", labels.clone(), 42.0);
        let output = registry.render_prometheus_text();

        assert!(output.contains("# HELP fuzz_queue_depth Current seeds in queue"));
        assert!(output.contains("# TYPE fuzz_queue_depth gauge"));
        assert!(output.contains("fuzz_queue_depth{worker_id=\"0\"} 42"));

        registry.set_gauge("fuzz_queue_depth", labels, 10.0);
        let output_updated = registry.render_prometheus_text();
        assert!(output_updated.contains("fuzz_queue_depth{worker_id=\"0\"} 10"));
    }

    #[test]
    fn histogram_buckets_and_summary_metrics() {
        let registry = MetricRegistry::new();
        registry.register_histogram(
            "fuzz_execution_seconds",
            "Execution duration in seconds",
            vec![0.005, 0.01, 0.05],
        );

        let labels = BTreeMap::new();
        registry.observe_histogram("fuzz_execution_seconds", labels.clone(), 0.004);
        registry.observe_histogram("fuzz_execution_seconds", labels, 0.02);

        let output = registry.render_prometheus_text();
        assert!(output.contains("# HELP fuzz_execution_seconds Execution duration in seconds"));
        assert!(output.contains("# TYPE fuzz_execution_seconds histogram"));
        assert!(output.contains("fuzz_execution_seconds_bucket{le=\"0.005\"} 1"));
        assert!(output.contains("fuzz_execution_seconds_bucket{le=\"+Inf\"}"));
        assert!(output.contains("fuzz_execution_seconds_count 2"));
        assert!(output.contains("fuzz_execution_seconds_sum 0.024"));
    }

    #[test]
    fn label_escaping_quotes_and_backslashes() {
        let mut labels = BTreeMap::new();
        labels.insert("reason".to_string(), "bad \"input\" \\ path\nnewline".to_string());

        let formatted = format_labels(&labels);
        assert!(formatted.contains("bad \\\"input\\\" \\\\ path\\nnewline"));
    }

    #[test]
    fn empty_registry_renders_empty_string() {
        let registry = MetricRegistry::new();
        assert_eq!(registry.render_prometheus_text(), "");
    }
}
