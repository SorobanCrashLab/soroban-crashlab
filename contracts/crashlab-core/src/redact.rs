//! Shared redaction helpers for values that may contain runtime secrets.

use serde_json::Value;
use std::sync::OnceLock;

const SENSITIVE_FIELDS: &[&str] = &[
    "authorization",
    "auth",
    "token",
    "api_key",
    "apikey",
    "webhook",
    "secret",
    "password",
    "cookie",
    "private",
    "credential",
    "seed",
    "mnemonic",
    "signature",
    "key",
];

fn inline_secret_regex() -> &'static regex::Regex {
    static REGEX: OnceLock<regex::Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        regex::Regex::new(
            r#"(?i)((?:authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|webhook[_-]?key|password|secret|cookie)\s*["']?\s*[:=]\s*["']?(?:Bearer\s+)?)[^\s"'`,;}&]+"#,
        )
        .expect("valid redaction expression")
    })
}

fn bearer_regex() -> &'static regex::Regex {
    static REGEX: OnceLock<regex::Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        regex::Regex::new(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{8,}")
            .expect("valid bearer token expression")
    })
}

fn token_prefix_regex() -> &'static regex::Regex {
    static REGEX: OnceLock<regex::Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        regex::Regex::new(
            r"\b(?:sk_(?:live|test)_|rk_(?:live|test)_|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b",
        )
        .expect("valid token prefix expression")
    })
}

/// Redacts common key/value credentials and recognizable token formats.
pub fn redact_text(value: &str) -> String {
    let keyed = inline_secret_regex().replace_all(value, |captures: &regex::Captures<'_>| {
        format!(
            "{}[REDACTED]",
            captures.get(1).map_or("", |prefix| prefix.as_str())
        )
    });
    let bearer = bearer_regex().replace_all(&keyed, "Bearer [REDACTED]");
    token_prefix_regex()
        .replace_all(&bearer, "[REDACTED]")
        .into_owned()
}

pub fn is_sensitive_field(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SENSITIVE_FIELDS
        .iter()
        .any(|pattern| lower.contains(pattern))
}

fn redact_value(value: &Value, path: &str, fields: &mut Vec<String>) -> Value {
    match value {
        Value::Object(map) => {
            let mut result = serde_json::Map::new();
            for (key, value) in map {
                let current_path = if path.is_empty() {
                    key.clone()
                } else {
                    format!("{path}.{key}")
                };
                if is_sensitive_field(key) && value.is_string() {
                    fields.push(current_path);
                    result.insert(key.clone(), Value::String("[REDACTED]".to_string()));
                } else {
                    result.insert(key.clone(), redact_value(value, &current_path, fields));
                }
            }
            Value::Object(result)
        }
        Value::Array(items) => Value::Array(
            items
                .iter()
                .enumerate()
                .map(|(index, item)| redact_value(item, &format!("{path}[{index}]"), fields))
                .collect(),
        ),
        Value::String(text) => Value::String(redact_text(text)),
        _ => value.clone(),
    }
}

/// Returns a secret-scrubbed JSON value and the paths hidden by field name.
pub fn redact_json_value(value: &Value) -> (Value, Vec<String>) {
    let mut fields = Vec::new();
    (redact_value(value, "", &mut fields), fields)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_credentials_in_json_keys_and_string_values() {
        let input = serde_json::json!({
            "config": {
                "apiKey": "do-not-retain",
                "endpoint": "Authorization: Bearer abcdefghijklmnop"
            }
        });
        let (redacted, fields) = redact_json_value(&input);
        assert_eq!(redacted["config"]["apiKey"], "[REDACTED]");
        assert_eq!(
            redacted["config"]["endpoint"],
            "Authorization: Bearer [REDACTED]"
        );
        assert_eq!(fields, vec!["config.apiKey"]);
    }

    #[test]
    fn redacts_inline_provider_tokens() {
        assert_eq!(
            redact_text("key=sk_live_abcdefghijklmnop"),
            "key=[REDACTED]"
        );
    }
}
