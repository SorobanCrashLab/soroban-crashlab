//! CORS configuration validation and dynamic origin allowlist management.
//!
//! Provides origin validation, wildcard and pattern matching, preflight evaluation,
//! and thread-safe dynamic allowlist mutation for HTTP and RPC endpoints.

use std::collections::HashSet;
use std::sync::{Arc, RwLock};

/// Supported HTTP methods for CORS validation.
#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Head,
    Options,
    Custom(String),
}

impl HttpMethod {
    pub fn as_str(&self) -> &str {
        match self {
            HttpMethod::Get => "GET",
            HttpMethod::Post => "POST",
            HttpMethod::Put => "PUT",
            HttpMethod::Delete => "DELETE",
            HttpMethod::Patch => "PATCH",
            HttpMethod::Head => "HEAD",
            HttpMethod::Options => "OPTIONS",
            HttpMethod::Custom(s) => s.as_str(),
        }
    }

    pub fn from_str_case_insensitive(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "GET" => HttpMethod::Get,
            "POST" => HttpMethod::Post,
            "PUT" => HttpMethod::Put,
            "DELETE" => HttpMethod::Delete,
            "PATCH" => HttpMethod::Patch,
            "HEAD" => HttpMethod::Head,
            "OPTIONS" => HttpMethod::Options,
            _ => HttpMethod::Custom(s.to_string()),
        }
    }
}

/// Pattern representation for matching request origins.
#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum OriginPattern {
    /// Matches all origins (`*`).
    Any,
    /// Exact match against a specific origin URL (e.g., `https://app.crashlab.dev` or `http://localhost:3000`).
    Exact(String),
    /// Subdomain wildcard pattern (e.g. `https://*.example.com` or `*.domain.org`).
    Subdomain {
        scheme: Option<String>,
        base_domain: String,
        port: Option<u16>,
    },
}

impl OriginPattern {
    /// Parses an origin pattern string into an [`OriginPattern`].
    pub fn parse(pattern: &str) -> Result<Self, CorsError> {
        let trimmed = pattern.trim();
        if trimmed.is_empty() {
            return Err(CorsError::InvalidOriginPattern("Pattern cannot be empty".to_string()));
        }

        if trimmed == "*" {
            return Ok(OriginPattern::Any);
        }

        // Check for wildcard subdomain patterns
        if trimmed.contains('*') {
            return Self::parse_subdomain_pattern(trimmed);
        }

        // Validate exact origin format
        Self::validate_origin_format(trimmed)?;
        Ok(OriginPattern::Exact(trimmed.to_lowercase()))
    }

    fn parse_subdomain_pattern(pattern: &str) -> Result<Self, CorsError> {
        let (scheme, rest) = if let Some(idx) = pattern.find("://") {
            let scheme_str = &pattern[..idx];
            if scheme_str != "http" && scheme_str != "https" {
                return Err(CorsError::InvalidOriginPattern(format!(
                    "Unsupported scheme in pattern: {}",
                    scheme_str
                )));
            }
            (Some(scheme_str.to_lowercase()), &pattern[idx + 3..])
        } else {
            (None, pattern)
        };

        let (host_part, port) = if let Some(colon_idx) = rest.rfind(':') {
            let p_str = &rest[colon_idx + 1..];
            let p: u16 = p_str.parse().map_err(|_| {
                CorsError::InvalidOriginPattern(format!("Invalid port in pattern: {}", p_str))
            })?;
            (&rest[..colon_idx], Some(p))
        } else {
            (rest, None)
        };

        if !host_part.starts_with("*.") {
            return Err(CorsError::InvalidOriginPattern(
                "Wildcard origin must start with '*.' in domain portion".to_string(),
            ));
        }

        let base = &host_part[2..];
        if base.is_empty() || base.contains('*') {
            return Err(CorsError::InvalidOriginPattern(format!(
                "Invalid base domain in wildcard pattern: {}",
                base
            )));
        }

        Ok(OriginPattern::Subdomain {
            scheme,
            base_domain: base.to_lowercase(),
            port,
        })
    }

    fn validate_origin_format(origin: &str) -> Result<(), CorsError> {
        if !origin.starts_with("http://") && !origin.starts_with("https://") {
            return Err(CorsError::InvalidOriginFormat(
                "Origin must start with http:// or https://".to_string(),
            ));
        }
        if origin.ends_with('/') {
            return Err(CorsError::InvalidOriginFormat(
                "Origin must not contain a trailing slash".to_string(),
            ));
        }
        if origin.contains('?') || origin.contains('#') {
            return Err(CorsError::InvalidOriginFormat(
                "Origin must not contain query or fragment components".to_string(),
            ));
        }
        Ok(())
    }

    /// Tests if a given request origin matches this pattern.
    pub fn matches(&self, request_origin: &str) -> bool {
        let req_clean = request_origin.trim().to_lowercase();

        match self {
            OriginPattern::Any => true,
            OriginPattern::Exact(exact) => exact.eq_ignore_ascii_case(&req_clean),
            OriginPattern::Subdomain {
                scheme,
                base_domain,
                port,
            } => {
                let (req_scheme, rest) = if let Some(idx) = req_clean.find("://") {
                    (&req_clean[..idx], &req_clean[idx + 3..])
                } else {
                    return false;
                };

                if let Some(expected_scheme) = scheme {
                    if req_scheme != expected_scheme {
                        return false;
                    }
                }

                let (req_host, req_port) = if let Some(colon_idx) = rest.rfind(':') {
                    let p: Option<u16> = rest[colon_idx + 1..].parse().ok();
                    (&rest[..colon_idx], p)
                } else {
                    (rest, None)
                };

                if *port != req_port {
                    return false;
                }

                if req_host == base_domain {
                    return true;
                }

                if req_host.ends_with(&format!(".{}", base_domain)) {
                    return true;
                }

                false
            }
        }
    }
}

/// Dynamic, thread-safe allowlist of permitted origins.
#[derive(Debug, Clone)]
pub struct OriginAllowlist {
    patterns: Arc<RwLock<Vec<OriginPattern>>>,
}

impl Default for OriginAllowlist {
    fn default() -> Self {
        Self::new()
    }
}

impl OriginAllowlist {
    /// Creates an empty allowlist.
    pub fn new() -> Self {
        Self {
            patterns: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Creates an allowlist pre-populated with parsed origin patterns.
    pub fn from_origins<I, S>(origins: I) -> Result<Self, CorsError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let allowlist = Self::new();
        for origin in origins {
            allowlist.add_origin(origin.as_ref())?;
        }
        Ok(allowlist)
    }

    /// Dynamically adds a new origin pattern to the allowlist.
    pub fn add_origin(&self, pattern_str: &str) -> Result<(), CorsError> {
        let pattern = OriginPattern::parse(pattern_str)?;
        let mut lock = self.patterns.write().unwrap();
        if !lock.contains(&pattern) {
            lock.push(pattern);
        }
        Ok(())
    }

    /// Dynamically removes an origin pattern from the allowlist.
    pub fn remove_origin(&self, pattern_str: &str) -> Result<bool, CorsError> {
        let pattern = OriginPattern::parse(pattern_str)?;
        let mut lock = self.patterns.write().unwrap();
        let initial_len = lock.len();
        lock.retain(|p| p != &pattern);
        Ok(lock.len() < initial_len)
    }

    /// Clears all origins in the allowlist.
    pub fn clear(&self) {
        let mut lock = self.patterns.write().unwrap();
        lock.clear();
    }

    /// Returns the number of active origin patterns.
    pub fn len(&self) -> usize {
        let lock = self.patterns.read().unwrap();
        lock.len()
    }

    /// Checks if the allowlist is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Checks if a request origin is allowed by any pattern in the list.
    pub fn is_allowed(&self, origin: &str) -> bool {
        let lock = self.patterns.read().unwrap();
        lock.iter().any(|pattern| pattern.matches(origin))
    }
}

/// Comprehensive CORS configuration.
#[derive(Debug, Clone)]
pub struct CorsConfig {
    pub allowlist: OriginAllowlist,
    pub allowed_methods: HashSet<HttpMethod>,
    pub allowed_headers: HashSet<String>,
    pub exposed_headers: Vec<String>,
    pub max_age_secs: Option<u32>,
    pub allow_credentials: bool,
}

impl Default for CorsConfig {
    fn default() -> Self {
        let mut methods = HashSet::new();
        methods.insert(HttpMethod::Get);
        methods.insert(HttpMethod::Post);
        methods.insert(HttpMethod::Put);
        methods.insert(HttpMethod::Delete);
        methods.insert(HttpMethod::Patch);
        methods.insert(HttpMethod::Options);
        methods.insert(HttpMethod::Head);

        let mut headers = HashSet::new();
        headers.insert("content-type".to_string());
        headers.insert("authorization".to_string());
        headers.insert("x-requested-with".to_string());

        Self {
            allowlist: OriginAllowlist::new(),
            allowed_methods: methods,
            allowed_headers: headers,
            exposed_headers: vec!["x-request-id".to_string(), "content-length".to_string()],
            max_age_secs: Some(86400),
            allow_credentials: true,
        }
    }
}

impl CorsConfig {
    /// Validates the configuration consistency.
    pub fn validate(&self) -> Result<(), CorsError> {
        if self.allow_credentials {
            let lock = self.allowlist.patterns.read().unwrap();
            if lock.iter().any(|p| matches!(p, OriginPattern::Any)) {
                return Err(CorsError::InvalidConfiguration(
                    "Wildcard origin '*' cannot be combined with allow_credentials=true".to_string(),
                ));
            }
        }
        if self.allowed_methods.is_empty() {
            return Err(CorsError::InvalidConfiguration(
                "allowed_methods cannot be empty".to_string(),
            ));
        }
        Ok(())
    }
}

/// Evaluation result of a CORS request check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CorsEvaluation {
    /// Request meets CORS criteria. Contains response headers to return.
    Allowed {
        allow_origin: String,
        allow_methods: Option<String>,
        allow_headers: Option<String>,
        expose_headers: Option<String>,
        allow_credentials: bool,
        max_age: Option<u32>,
        vary_origin: bool,
    },
    /// Request violated CORS policy.
    Forbidden {
        reason: String,
    },
}

/// Evaluates an incoming HTTP request against the CORS configuration.
pub fn evaluate_cors(
    config: &CorsConfig,
    origin_header: Option<&str>,
    method: &HttpMethod,
    request_headers: &[&str],
    is_preflight: bool,
) -> CorsEvaluation {
    let origin = match origin_header {
        Some(o) if !o.is_empty() => o,
        _ => {
            return CorsEvaluation::Forbidden {
                reason: "Missing Origin header".to_string(),
            };
        }
    };

    if !config.allowlist.is_allowed(origin) {
        return CorsEvaluation::Forbidden {
            reason: format!("Origin '{}' is not in allowlist", origin),
        };
    }

    if !config.allowed_methods.contains(method) {
        return CorsEvaluation::Forbidden {
            reason: format!("Method '{}' is not allowed", method.as_str()),
        };
    }

    // For preflight, validate requested headers
    if is_preflight {
        for header in request_headers {
            let normalized = header.trim().to_lowercase();
            if !config
                .allowed_headers
                .iter()
                .any(|h| h.to_lowercase() == normalized || h == "*")
            {
                return CorsEvaluation::Forbidden {
                    reason: format!("Header '{}' is not in allowed_headers", header),
                };
            }
        }
    }

    let allow_origin_header = if config.allow_credentials {
        origin.to_string()
    } else {
        let lock = config.allowlist.patterns.read().unwrap();
        if lock.iter().any(|p| matches!(p, OriginPattern::Any)) {
            "*".to_string()
        } else {
            origin.to_string()
        }
    };

    let allow_methods_header = if is_preflight {
        let methods: Vec<&str> = config.allowed_methods.iter().map(|m| m.as_str()).collect();
        Some(methods.join(", "))
    } else {
        None
    };

    let allow_headers_header = if is_preflight && !config.allowed_headers.is_empty() {
        let headers: Vec<&str> = config.allowed_headers.iter().map(|h| h.as_str()).collect();
        Some(headers.join(", "))
    } else {
        None
    };

    let expose_headers_header = if !config.exposed_headers.is_empty() {
        Some(config.exposed_headers.join(", "))
    } else {
        None
    };

    CorsEvaluation::Allowed {
        allow_origin: allow_origin_header,
        allow_methods: allow_methods_header,
        allow_headers: allow_headers_header,
        expose_headers: expose_headers_header,
        allow_credentials: config.allow_credentials,
        max_age: if is_preflight { config.max_age_secs } else { None },
        vary_origin: true,
    }
}

/// Errors occurring during CORS validation and configuration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CorsError {
    InvalidOriginPattern(String),
    InvalidOriginFormat(String),
    InvalidConfiguration(String),
}

impl std::fmt::Display for CorsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CorsError::InvalidOriginPattern(msg) => write!(f, "Invalid origin pattern: {}", msg),
            CorsError::InvalidOriginFormat(msg) => write!(f, "Invalid origin format: {}", msg),
            CorsError::InvalidConfiguration(msg) => write!(f, "Invalid CORS configuration: {}", msg),
        }
    }
}

impl std::error::Error for CorsError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_origin_match() {
        let pattern = OriginPattern::parse("https://app.crashlab.dev").unwrap();
        assert!(pattern.matches("https://app.crashlab.dev"));
        assert!(!pattern.matches("http://app.crashlab.dev"));
        assert!(!pattern.matches("https://other.crashlab.dev"));
    }

    #[test]
    fn wildcard_origin_match() {
        let pattern = OriginPattern::parse("*").unwrap();
        assert!(pattern.matches("https://foo.bar"));
        assert!(pattern.matches("http://localhost:8080"));
    }

    #[test]
    fn subdomain_wildcard_matching() {
        let pattern = OriginPattern::parse("https://*.crashlab.dev").unwrap();
        assert!(pattern.matches("https://staging.crashlab.dev"));
        assert!(pattern.matches("https://api.v2.crashlab.dev"));
        assert!(pattern.matches("https://crashlab.dev"));
        assert!(!pattern.matches("http://staging.crashlab.dev"));
        assert!(!pattern.matches("https://staging.other.com"));
    }

    #[test]
    fn subdomain_with_port_matching() {
        let pattern = OriginPattern::parse("http://*.local:3000").unwrap();
        assert!(pattern.matches("http://app.local:3000"));
        assert!(pattern.matches("http://local:3000"));
        assert!(!pattern.matches("http://app.local:4000"));
        assert!(!pattern.matches("https://app.local:3000"));
    }

    #[test]
    fn invalid_origin_formats_rejected() {
        assert!(OriginPattern::parse("").is_err());
        assert!(OriginPattern::parse("not-a-url").is_err());
        assert!(OriginPattern::parse("https://example.com/").is_err()); // trailing slash
        assert!(OriginPattern::parse("https://example.com?query=1").is_err());
    }

    #[test]
    fn dynamic_allowlist_operations() {
        let allowlist = OriginAllowlist::new();
        assert_eq!(allowlist.len(), 0);

        allowlist.add_origin("https://app.crashlab.dev").unwrap();
        assert_eq!(allowlist.len(), 1);
        assert!(allowlist.is_allowed("https://app.crashlab.dev"));
        assert!(!allowlist.is_allowed("https://evil.com"));

        allowlist.add_origin("https://*.partner.io").unwrap();
        assert_eq!(allowlist.len(), 2);
        assert!(allowlist.is_allowed("https://eu.partner.io"));

        let removed = allowlist.remove_origin("https://app.crashlab.dev").unwrap();
        assert!(removed);
        assert_eq!(allowlist.len(), 1);
        assert!(!allowlist.is_allowed("https://app.crashlab.dev"));
        assert!(allowlist.is_allowed("https://eu.partner.io"));
    }

    #[test]
    fn credentials_with_wildcard_fails_validation() {
        let mut config = CorsConfig::default();
        config.allow_credentials = true;
        config.allowlist.add_origin("*").unwrap();

        assert!(config.validate().is_err());
    }

    #[test]
    fn preflight_evaluation_success() {
        let config = CorsConfig::default();
        config.allowlist.add_origin("https://dashboard.crashlab.dev").unwrap();
        config.validate().unwrap();

        let eval = evaluate_cors(
            &config,
            Some("https://dashboard.crashlab.dev"),
            &HttpMethod::Options,
            &["authorization", "content-type"],
            true,
        );

        match eval {
            CorsEvaluation::Allowed {
                allow_origin,
                allow_methods,
                allow_headers,
                allow_credentials,
                max_age,
                ..
            } => {
                assert_eq!(allow_origin, "https://dashboard.crashlab.dev");
                assert!(allow_methods.is_some());
                assert!(allow_headers.is_some());
                assert!(allow_credentials);
                assert_eq!(max_age, Some(86400));
            }
            _ => panic!("Expected Allowed evaluation"),
        }
    }

    #[test]
    fn preflight_evaluation_disallowed_header() {
        let config = CorsConfig::default();
        config.allowlist.add_origin("https://dashboard.crashlab.dev").unwrap();

        let eval = evaluate_cors(
            &config,
            Some("https://dashboard.crashlab.dev"),
            &HttpMethod::Options,
            &["x-unapproved-custom-header"],
            true,
        );

        assert!(matches!(eval, CorsEvaluation::Forbidden { .. }));
    }

    #[test]
    fn simple_request_forbidden_origin() {
        let config = CorsConfig::default();
        let eval = evaluate_cors(
            &config,
            Some("https://malicious.site"),
            &HttpMethod::Get,
            &[],
            false,
        );

        assert!(matches!(eval, CorsEvaluation::Forbidden { .. }));
    }
}
