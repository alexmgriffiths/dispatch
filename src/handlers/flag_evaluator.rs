use serde::Serialize;
use serde_json::Value;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Result of evaluating a single flag against a device context.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalResult {
    pub value: Value,
    pub variant: Option<String>,
    pub reason: String,
    /// Database ID of the matched variation (not serialized to client).
    #[serde(skip)]
    pub variation_id: Option<i64>,
}

/// Device context supplied by the client for flag evaluation.
#[derive(Debug, Clone)]
pub struct EvalContext {
    pub targeting_key: Option<String>,
    pub attributes: serde_json::Map<String, Value>,
}

/// A flag with its rules and variations, pre-loaded from the database.
/// This is the evaluator's view of a flag -- no database ids, no timestamps.
#[derive(Debug, Clone)]
pub struct FlagWithRules {
    pub key: String,
    pub flag_type: String,
    pub default_value: Value,
    pub enabled: bool,
    pub rules: Vec<RuleWithConfig>,
    pub variations: Vec<Variation>,
}

/// A single targeting rule.
#[derive(Debug, Clone)]
pub struct RuleWithConfig {
    pub priority: i32,
    pub rule_type: String,
    pub variant_value: Value,
    pub rule_config: Value,
}

/// A flag variation (value + optional display name).
#[derive(Debug, Clone)]
pub struct Variation {
    pub id: i64,
    pub value: Value,
    pub name: Option<String>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Evaluate a flag against a device context. Pure function -- no I/O.
///
/// Rules are evaluated in priority order (lowest number first).
/// First matching rule wins. If no rule matches, the flag's default
/// value is returned with reason "DEFAULT". Disabled flags always
/// return the default value with reason "DISABLED".
pub fn evaluate_flag(flag: &FlagWithRules, context: &EvalContext) -> EvalResult {
    if !flag.enabled {
        return EvalResult {
            value: flag.default_value.clone(),
            variant: None,
            reason: "DISABLED".to_string(),
            variation_id: None,
        };
    }

    let mut rules = flag.rules.clone();
    rules.sort_by_key(|r| r.priority);

    for rule in &rules {
        if let Some(result) = evaluate_rule(rule, flag, context) {
            return result;
        }
    }

    let default_variant = find_variant(&flag.variations, &flag.default_value);
    EvalResult {
        value: flag.default_value.clone(),
        variant: default_variant.as_ref().and_then(|(name, _)| name.clone()),
        reason: "DEFAULT".to_string(),
        variation_id: default_variant.map(|(_, id)| id),
    }
}

/// FNV-1a hash -> 0-99 bucket. Public for cross-language testing.
///
/// MUST produce identical results to the TypeScript implementation:
/// ```js
/// function hashToBucket(input) {
///   let hash = 2166136261;
///   for (let i = 0; i < input.length; i++) {
///     hash ^= input.charCodeAt(i);
///     hash = (hash * 16777619) >>> 0;
///   }
///   return hash % 100;
/// }
/// ```
pub fn hash_to_bucket(input: &str) -> u32 {
    let mut hash: u32 = 2166136261;
    for byte in input.bytes() {
        hash ^= byte as u32;
        // Replicate JavaScript semantics exactly:
        // JS XOR (^) returns a signed 32-bit integer.
        // The multiplication happens in f64 (IEEE 754 double-precision float).
        // Then >>> 0 converts the result to an unsigned 32-bit integer.
        // Using wrapping_mul would give different results because f64
        // multiplication loses precision differently than u32 wrapping.
        let as_i32 = hash as i32;
        let product = (as_i32 as f64) * 16777619.0;
        hash = js_to_uint32(product);
    }
    hash % 100
}

/// Replicate JavaScript's `>>> 0` (ToUint32) on a f64 value.
fn js_to_uint32(val: f64) -> u32 {
    let val = val % 4294967296.0; // 2^32
    if val < 0.0 {
        (val + 4294967296.0) as u32
    } else {
        val as u32
    }
}

// ---------------------------------------------------------------------------
// Private: rule dispatch
// ---------------------------------------------------------------------------

fn evaluate_rule(
    rule: &RuleWithConfig,
    flag: &FlagWithRules,
    context: &EvalContext,
) -> Option<EvalResult> {
    match rule.rule_type.as_str() {
        "user_list" => evaluate_user_list(rule, flag, context),
        "percentage_rollout" => evaluate_percentage_rollout(rule, flag, context),
        "attribute" => evaluate_attribute_rule(rule, flag, context),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Private: user_list
// ---------------------------------------------------------------------------

fn evaluate_user_list(
    rule: &RuleWithConfig,
    flag: &FlagWithRules,
    context: &EvalContext,
) -> Option<EvalResult> {
    let user_ids_str = rule
        .rule_config
        .get("userIds")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let ids: Vec<&str> = user_ids_str
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    let targeting_key = context.targeting_key.as_deref()?;
    if !ids.contains(&targeting_key) {
        return None;
    }

    let matched = find_variant(&flag.variations, &rule.variant_value);

    Some(EvalResult {
        value: rule.variant_value.clone(),
        variant: matched.as_ref().and_then(|(name, _)| name.clone()),
        reason: "TARGETING_MATCH".to_string(),
        variation_id: matched.map(|(_, id)| id),
    })
}

// ---------------------------------------------------------------------------
// Private: percentage_rollout
// ---------------------------------------------------------------------------

fn evaluate_percentage_rollout(
    rule: &RuleWithConfig,
    flag: &FlagWithRules,
    context: &EvalContext,
) -> Option<EvalResult> {
    let rollout = rule.rule_config.get("rollout").and_then(|v| v.as_array())?;
    if rollout.is_empty() {
        return None;
    }

    let targeting_key = context.targeting_key.as_deref().unwrap_or("");
    let hash_input = format!("{}{}", flag.key, targeting_key);
    let bucket = hash_to_bucket(&hash_input);

    let mut cumulative: u32 = 0;
    for entry in rollout {
        let weight = entry.get("weight").and_then(|w| w.as_u64()).unwrap_or(0) as u32;
        let variation_id = entry.get("variationId").and_then(|v| v.as_i64()).unwrap_or(-1);

        cumulative += weight;
        if bucket < cumulative {
            let variation = flag.variations.iter().find(|v| v.id == variation_id);
            return Some(EvalResult {
                value: variation
                    .map(|v| v.value.clone())
                    .unwrap_or_else(|| flag.default_value.clone()),
                variant: variation.and_then(|v| v.name.clone()),
                reason: "SPLIT".to_string(),
                variation_id: variation.map(|v| v.id),
            });
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Private: attribute rules
// ---------------------------------------------------------------------------

fn evaluate_attribute_rule(
    rule: &RuleWithConfig,
    flag: &FlagWithRules,
    context: &EvalContext,
) -> Option<EvalResult> {
    let conditions = rule.rule_config.get("conditions").and_then(|v| v.as_array())?;
    if conditions.is_empty() {
        return None;
    }

    for condition in conditions {
        let attribute = condition.get("attribute").and_then(|v| v.as_str()).unwrap_or("");
        let operator = condition.get("operator").and_then(|v| v.as_str()).unwrap_or("");
        let values: Vec<String> = condition
            .get("values")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let attr_value = context.attributes.get(attribute);

        // exists / not_exists
        if operator == "exists" {
            if attr_value.is_none() || attr_value == Some(&Value::Null) {
                return None;
            }
            continue;
        }
        if operator == "not_exists" {
            if attr_value.is_some() && attr_value != Some(&Value::Null) {
                return None;
            }
            continue;
        }

        // All other operators require a non-null attribute value
        let raw = match attr_value {
            Some(v) if !v.is_null() => v,
            _ => return None,
        };
        let str_value = value_to_string(raw);

        match operator {
            "eq" => {
                if str_value != values.first().map(|s| s.as_str()).unwrap_or("") {
                    return None;
                }
            }
            "neq" => {
                if str_value == values.first().map(|s| s.as_str()).unwrap_or("") {
                    return None;
                }
            }
            "in" => {
                if !values.iter().any(|v| v == &str_value) {
                    return None;
                }
            }
            "not_in" => {
                if values.iter().any(|v| v == &str_value) {
                    return None;
                }
            }
            "contains" => {
                let needle = values.first().map(|s| s.as_str()).unwrap_or("");
                if !str_value.contains(needle) {
                    return None;
                }
            }
            "starts_with" => {
                let prefix = values.first().map(|s| s.as_str()).unwrap_or("");
                if !str_value.starts_with(prefix) {
                    return None;
                }
            }
            "ends_with" => {
                let suffix = values.first().map(|s| s.as_str()).unwrap_or("");
                if !str_value.ends_with(suffix) {
                    return None;
                }
            }
            "gt" | "gte" | "lt" | "lte" => {
                let num_a: f64 = match str_value.parse() {
                    Ok(n) => n,
                    Err(_) => return None,
                };
                let num_b: f64 = match values.first().map(|s| s.parse::<f64>()) {
                    Some(Ok(n)) => n,
                    _ => return None,
                };
                let pass = match operator {
                    "gt" => num_a > num_b,
                    "gte" => num_a >= num_b,
                    "lt" => num_a < num_b,
                    "lte" => num_a <= num_b,
                    _ => unreachable!(),
                };
                if !pass {
                    return None;
                }
            }
            "semver_gt" | "semver_gte" | "semver_lt" | "semver_lte" => {
                let cmp_val = values.first().map(|s| s.as_str()).unwrap_or("");
                let cmp = compare_semver(&str_value, cmp_val);
                let pass = match operator {
                    "semver_gt" => cmp > 0,
                    "semver_gte" => cmp >= 0,
                    "semver_lt" => cmp < 0,
                    "semver_lte" => cmp <= 0,
                    _ => unreachable!(),
                };
                if !pass {
                    return None;
                }
            }
            // Unknown operator -> rule does not match
            _ => return None,
        }
    }

    let matched = find_variant(&flag.variations, &rule.variant_value);
    Some(EvalResult {
        value: rule.variant_value.clone(),
        variant: matched.as_ref().and_then(|(name, _)| name.clone()),
        reason: "TARGETING_MATCH".to_string(),
        variation_id: matched.map(|(_, id)| id),
    })
}

// ---------------------------------------------------------------------------
// Private: semver comparison
// ---------------------------------------------------------------------------

/// Compare two semver-like strings segment by segment.
/// Missing segments are treated as 0 (e.g. "1.2" == "1.2.0").
/// Returns -1, 0, or 1.
fn compare_semver(a: &str, b: &str) -> i32 {
    let parts_a: Vec<i64> = a.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    let parts_b: Vec<i64> = b.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    let len = parts_a.len().max(parts_b.len());

    for i in 0..len {
        let seg_a = parts_a.get(i).copied().unwrap_or(0);
        let seg_b = parts_b.get(i).copied().unwrap_or(0);
        if seg_a > seg_b {
            return 1;
        }
        if seg_a < seg_b {
            return -1;
        }
    }
    0
}

// ---------------------------------------------------------------------------
// Private: helpers
// ---------------------------------------------------------------------------

/// Find the variation whose value matches, return its name.
/// Uses JSON string comparison (same as TypeScript JSON.stringify comparison).
fn find_variant(variations: &[Variation], value: &Value) -> Option<(Option<String>, i64)> {
    let target = serde_json::to_string(value).ok()?;
    variations
        .iter()
        .find(|v| serde_json::to_string(&v.value).ok().as_deref() == Some(target.as_str()))
        .map(|v| (v.name.clone(), v.id))
}

/// Convert a serde_json::Value to its string representation,
/// matching JavaScript's `String(value)` behavior.
fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_string(),
        // Arrays/objects: use JSON serialization (matches JS String() for objects)
        _ => serde_json::to_string(v).unwrap_or_default(),
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -----------------------------------------------------------------------
    // Test helpers
    // -----------------------------------------------------------------------

    fn make_flag(key: &str, default: Value, enabled: bool) -> FlagWithRules {
        FlagWithRules {
            key: key.to_string(),
            flag_type: "boolean".to_string(),
            default_value: default,
            enabled,
            rules: vec![],
            variations: vec![],
        }
    }

    fn make_context(targeting_key: Option<&str>) -> EvalContext {
        EvalContext {
            targeting_key: targeting_key.map(String::from),
            attributes: serde_json::Map::new(),
        }
    }

    fn make_context_with_attrs(
        targeting_key: Option<&str>,
        attrs: Vec<(&str, Value)>,
    ) -> EvalContext {
        let mut attributes = serde_json::Map::new();
        for (k, v) in attrs {
            attributes.insert(k.to_string(), v);
        }
        EvalContext {
            targeting_key: targeting_key.map(String::from),
            attributes,
        }
    }

    // -----------------------------------------------------------------------
    // FNV-1a hash consistency (cross-language parity with TypeScript)
    // -----------------------------------------------------------------------

    #[test]
    fn test_fnv_hash_empty_string() {
        assert_eq!(hash_to_bucket(""), 61);
    }

    #[test]
    fn test_fnv_hash_known_values() {
        // These values are computed from the TypeScript hashToBucket() function
        assert_eq!(hash_to_bucket("test"), 16);
        assert_eq!(hash_to_bucket("test-flag-keyuser-123"), 32);
        assert_eq!(hash_to_bucket("my-flagdevice-abc"), 96);
        assert_eq!(hash_to_bucket("feature-xuser-456"), 16);
        assert_eq!(hash_to_bucket("flag-a"), 48);
        assert_eq!(hash_to_bucket("flag-b"), 64);
        assert_eq!(hash_to_bucket("hello-world"), 16);
        assert_eq!(hash_to_bucket("a"), 20);
        assert_eq!(hash_to_bucket("ab"), 46);
        assert_eq!(hash_to_bucket("abc"), 32);
        assert_eq!(hash_to_bucket("0123456789"), 24);
        assert_eq!(
            hash_to_bucket("the quick brown fox jumps over the lazy dog"),
            26
        );
    }

    #[test]
    fn test_fnv_hash_deterministic() {
        // Same input always produces the same bucket
        let input = "test-flag-keyuser-123";
        let bucket = hash_to_bucket(input);
        for _ in 0..100 {
            assert_eq!(hash_to_bucket(input), bucket);
        }
    }

    #[test]
    fn test_fnv_hash_range() {
        // All results should be in [0, 100)
        for i in 0..1000 {
            let input = format!("flag-key-{}", i);
            let bucket = hash_to_bucket(&input);
            assert!(bucket < 100, "bucket {} out of range for input {}", bucket, input);
        }
    }

    // -----------------------------------------------------------------------
    // Disabled flags
    // -----------------------------------------------------------------------

    #[test]
    fn test_disabled_flag_returns_default_with_disabled_reason() {
        let flag = make_flag("my-flag", json!(false), false);
        let ctx = make_context(Some("user-1"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.value, json!(false));
        assert!(result.variant.is_none());
        assert_eq!(result.reason, "DISABLED");
    }

    #[test]
    fn test_disabled_flag_ignores_rules() {
        let mut flag = make_flag("my-flag", json!(false), false);
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "user_list".to_string(),
            variant_value: json!(true),
            rule_config: json!({"userIds": "user-1"}),
        });
        let ctx = make_context(Some("user-1"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.reason, "DISABLED");
        assert_eq!(result.value, json!(false));
    }

    // -----------------------------------------------------------------------
    // Default fallback (no rules match)
    // -----------------------------------------------------------------------

    #[test]
    fn test_enabled_flag_no_rules_returns_default() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.variations.push(Variation {
            id: 1,
            value: json!(false),
            name: Some("off".to_string()),
        });
        flag.variations.push(Variation {
            id: 2,
            value: json!(true),
            name: Some("on".to_string()),
        });
        let ctx = make_context(Some("user-1"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.value, json!(false));
        assert_eq!(result.variant, Some("off".to_string()));
        assert_eq!(result.reason, "DEFAULT");
    }

    #[test]
    fn test_default_fallback_no_matching_variation_name() {
        let flag = make_flag("my-flag", json!("custom-value"), true);
        let ctx = make_context(Some("user-1"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.value, json!("custom-value"));
        assert!(result.variant.is_none());
        assert_eq!(result.reason, "DEFAULT");
    }

    // -----------------------------------------------------------------------
    // User list rules
    // -----------------------------------------------------------------------

    #[test]
    fn test_user_list_match() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.variations.push(Variation {
            id: 1,
            value: json!(true),
            name: Some("on".to_string()),
        });
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "user_list".to_string(),
            variant_value: json!(true),
            rule_config: json!({"userIds": "user-1,user-2,user-3"}),
        });
        let ctx = make_context(Some("user-2"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.value, json!(true));
        assert_eq!(result.variant, Some("on".to_string()));
        assert_eq!(result.reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_user_list_no_match() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "user_list".to_string(),
            variant_value: json!(true),
            rule_config: json!({"userIds": "user-1,user-2"}),
        });
        let ctx = make_context(Some("user-99"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.reason, "DEFAULT");
    }

    #[test]
    fn test_user_list_no_targeting_key() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "user_list".to_string(),
            variant_value: json!(true),
            rule_config: json!({"userIds": "user-1"}),
        });
        let ctx = make_context(None);
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.reason, "DEFAULT");
    }

    #[test]
    fn test_user_list_whitespace_trimming() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "user_list".to_string(),
            variant_value: json!(true),
            rule_config: json!({"userIds": "id1, id2 , id3 "}),
        });
        let ctx = make_context(Some("id2"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_user_list_empty_user_ids() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "user_list".to_string(),
            variant_value: json!(true),
            rule_config: json!({"userIds": ""}),
        });
        let ctx = make_context(Some("user-1"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.reason, "DEFAULT");
    }

    // -----------------------------------------------------------------------
    // Percentage rollout rules
    // -----------------------------------------------------------------------

    #[test]
    fn test_percentage_rollout_basic() {
        let mut flag = make_flag("test-flag-key", json!(false), true);
        flag.variations.push(Variation {
            id: 1,
            value: json!(true),
            name: Some("on".to_string()),
        });
        flag.variations.push(Variation {
            id: 2,
            value: json!(false),
            name: Some("off".to_string()),
        });
        // 50/50 split
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "percentage_rollout".to_string(),
            variant_value: json!(null),
            rule_config: json!({
                "rollout": [
                    {"variationId": 1, "weight": 50},
                    {"variationId": 2, "weight": 50}
                ]
            }),
        });

        let ctx = make_context(Some("user-123"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.reason, "SPLIT");
        // hash("test-flag-keyuser-123") = 32, which is < 50, so variation 1
        assert_eq!(result.value, json!(true));
        assert_eq!(result.variant, Some("on".to_string()));
    }

    #[test]
    fn test_percentage_rollout_deterministic() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.variations.push(Variation {
            id: 1,
            value: json!(true),
            name: Some("on".to_string()),
        });
        flag.variations.push(Variation {
            id: 2,
            value: json!(false),
            name: Some("off".to_string()),
        });
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "percentage_rollout".to_string(),
            variant_value: json!(null),
            rule_config: json!({
                "rollout": [
                    {"variationId": 1, "weight": 50},
                    {"variationId": 2, "weight": 50}
                ]
            }),
        });

        // Same user always gets the same result
        let ctx = make_context(Some("user-abc"));
        let first = evaluate_flag(&flag, &ctx);
        for _ in 0..50 {
            let result = evaluate_flag(&flag, &ctx);
            assert_eq!(result.value, first.value);
            assert_eq!(result.reason, first.reason);
        }
    }

    #[test]
    fn test_percentage_rollout_empty_targeting_key() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.variations.push(Variation {
            id: 1,
            value: json!(true),
            name: Some("on".to_string()),
        });
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "percentage_rollout".to_string(),
            variant_value: json!(null),
            rule_config: json!({
                "rollout": [
                    {"variationId": 1, "weight": 100}
                ]
            }),
        });

        // Even with no targeting key, hash still works (flag.key + "")
        let ctx = make_context(None);
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.reason, "SPLIT");
    }

    #[test]
    fn test_percentage_rollout_empty_rollout_array() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "percentage_rollout".to_string(),
            variant_value: json!(null),
            rule_config: json!({"rollout": []}),
        });
        let ctx = make_context(Some("user-1"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.reason, "DEFAULT");
    }

    #[test]
    fn test_percentage_rollout_bucket_boundary() {
        // hash("flag-a") = 48
        // With weight 48, bucket 48 is NOT < 48, so should spill to second variation
        let mut flag = make_flag("flag-a", json!("default"), true);
        flag.variations.push(Variation {
            id: 1,
            value: json!("first"),
            name: Some("first".to_string()),
        });
        flag.variations.push(Variation {
            id: 2,
            value: json!("second"),
            name: Some("second".to_string()),
        });
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "percentage_rollout".to_string(),
            variant_value: json!(null),
            rule_config: json!({
                "rollout": [
                    {"variationId": 1, "weight": 48},
                    {"variationId": 2, "weight": 52}
                ]
            }),
        });

        // hash("flag-a" + "") = hash("flag-a") = 48
        let ctx = make_context(None);
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.reason, "SPLIT");
        // bucket 48 is NOT < 48, so falls to second variation (cumulative becomes 100)
        assert_eq!(result.value, json!("second"));
        assert_eq!(result.variant, Some("second".to_string()));
    }

    // -----------------------------------------------------------------------
    // Priority ordering
    // -----------------------------------------------------------------------

    #[test]
    fn test_rules_evaluated_in_priority_order() {
        let mut flag = make_flag("my-flag", json!(false), true);
        // Lower priority number -> evaluated first
        // Rule with priority 10: matches user-1
        flag.rules.push(RuleWithConfig {
            priority: 10,
            rule_type: "user_list".to_string(),
            variant_value: json!("from-rule-10"),
            rule_config: json!({"userIds": "user-1"}),
        });
        // Rule with priority 1: also matches user-1 (should win)
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "user_list".to_string(),
            variant_value: json!("from-rule-1"),
            rule_config: json!({"userIds": "user-1"}),
        });
        let ctx = make_context(Some("user-1"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.value, json!("from-rule-1"));
        assert_eq!(result.reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_first_matching_rule_wins() {
        let mut flag = make_flag("my-flag", json!(false), true);
        // Rule priority 1: matches user-1
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "user_list".to_string(),
            variant_value: json!("value-a"),
            rule_config: json!({"userIds": "user-1"}),
        });
        // Rule priority 2: would also match user-1
        flag.rules.push(RuleWithConfig {
            priority: 2,
            rule_type: "user_list".to_string(),
            variant_value: json!("value-b"),
            rule_config: json!({"userIds": "user-1"}),
        });
        let ctx = make_context(Some("user-1"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.value, json!("value-a"));
    }

    // -----------------------------------------------------------------------
    // Attribute rules -- all 16 operators
    // -----------------------------------------------------------------------

    fn make_attribute_flag(conditions: Value) -> FlagWithRules {
        let mut flag = make_flag("attr-flag", json!(false), true);
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "attribute".to_string(),
            variant_value: json!(true),
            rule_config: json!({"conditions": conditions}),
        });
        flag
    }

    // eq
    #[test]
    fn test_attribute_eq_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "eq", "values": ["US"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("country", json!("US"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_eq_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "eq", "values": ["US"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("country", json!("UK"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // neq
    #[test]
    fn test_attribute_neq_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "neq", "values": ["US"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("country", json!("UK"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_neq_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "neq", "values": ["US"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("country", json!("US"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // in
    #[test]
    fn test_attribute_in_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "in", "values": ["US", "UK", "CA"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("country", json!("UK"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_in_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "in", "values": ["US", "UK", "CA"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("country", json!("DE"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // not_in
    #[test]
    fn test_attribute_not_in_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "not_in", "values": ["US", "UK"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("country", json!("DE"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_not_in_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "not_in", "values": ["US", "UK"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("country", json!("US"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // contains
    #[test]
    fn test_attribute_contains_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "email", "operator": "contains", "values": ["@example.com"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("email", json!("user@example.com"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_contains_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "email", "operator": "contains", "values": ["@example.com"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("email", json!("user@other.com"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // starts_with
    #[test]
    fn test_attribute_starts_with_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "name", "operator": "starts_with", "values": ["admin"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("name", json!("admin-user"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_starts_with_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "name", "operator": "starts_with", "values": ["admin"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("name", json!("regular-user"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // ends_with
    #[test]
    fn test_attribute_ends_with_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "email", "operator": "ends_with", "values": [".gov"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("email", json!("user@agency.gov"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_ends_with_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "email", "operator": "ends_with", "values": [".gov"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("email", json!("user@example.com"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // gt
    #[test]
    fn test_attribute_gt_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "age", "operator": "gt", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("age", json!(21))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_gt_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "age", "operator": "gt", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("age", json!(18))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // gte
    #[test]
    fn test_attribute_gte_match_equal() {
        let flag = make_attribute_flag(json!([
            {"attribute": "age", "operator": "gte", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("age", json!(18))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_gte_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "age", "operator": "gte", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("age", json!(17))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // lt
    #[test]
    fn test_attribute_lt_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "age", "operator": "lt", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("age", json!(16))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_lt_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "age", "operator": "lt", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("age", json!(18))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // lte
    #[test]
    fn test_attribute_lte_match_equal() {
        let flag = make_attribute_flag(json!([
            {"attribute": "age", "operator": "lte", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("age", json!(18))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_lte_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "age", "operator": "lte", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("age", json!(19))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // numeric comparison with NaN
    #[test]
    fn test_attribute_numeric_nan_returns_default() {
        let flag = make_attribute_flag(json!([
            {"attribute": "age", "operator": "gt", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("age", json!("not-a-number"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    #[test]
    fn test_attribute_numeric_nan_in_values() {
        let flag = make_attribute_flag(json!([
            {"attribute": "age", "operator": "gt", "values": ["not-a-number"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("age", json!(21))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // semver_gt
    #[test]
    fn test_attribute_semver_gt_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "version", "operator": "semver_gt", "values": ["1.0.0"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("version", json!("2.0.0"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_semver_gt_no_match_equal() {
        let flag = make_attribute_flag(json!([
            {"attribute": "version", "operator": "semver_gt", "values": ["1.0.0"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("version", json!("1.0.0"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // semver_gte
    #[test]
    fn test_attribute_semver_gte_match_equal() {
        let flag = make_attribute_flag(json!([
            {"attribute": "version", "operator": "semver_gte", "values": ["1.0.0"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("version", json!("1.0.0"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_semver_gte_match_greater() {
        let flag = make_attribute_flag(json!([
            {"attribute": "version", "operator": "semver_gte", "values": ["1.0.0"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("version", json!("1.0.1"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    // semver_lt
    #[test]
    fn test_attribute_semver_lt_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "version", "operator": "semver_lt", "values": ["2.0.0"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("version", json!("1.0.0"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_semver_lt_no_match_equal() {
        let flag = make_attribute_flag(json!([
            {"attribute": "version", "operator": "semver_lt", "values": ["1.0.0"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("version", json!("1.0.0"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // semver_lte
    #[test]
    fn test_attribute_semver_lte_match_equal() {
        let flag = make_attribute_flag(json!([
            {"attribute": "version", "operator": "semver_lte", "values": ["1.0.0"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("version", json!("1.0.0"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_semver_lte_match_less() {
        let flag = make_attribute_flag(json!([
            {"attribute": "version", "operator": "semver_lte", "values": ["2.0.0"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("version", json!("1.5.0"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_semver_lte_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "version", "operator": "semver_lte", "values": ["1.0.0"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("version", json!("1.0.1"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // exists
    #[test]
    fn test_attribute_exists_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "premium", "operator": "exists", "values": []}
        ]));
        let ctx = make_context_with_attrs(None, vec![("premium", json!(true))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_exists_no_match_missing() {
        let flag = make_attribute_flag(json!([
            {"attribute": "premium", "operator": "exists", "values": []}
        ]));
        let ctx = make_context(None);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    #[test]
    fn test_attribute_exists_no_match_null() {
        let flag = make_attribute_flag(json!([
            {"attribute": "premium", "operator": "exists", "values": []}
        ]));
        let ctx = make_context_with_attrs(None, vec![("premium", Value::Null)]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // not_exists
    #[test]
    fn test_attribute_not_exists_match_missing() {
        let flag = make_attribute_flag(json!([
            {"attribute": "premium", "operator": "not_exists", "values": []}
        ]));
        let ctx = make_context(None);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_not_exists_match_null() {
        let flag = make_attribute_flag(json!([
            {"attribute": "premium", "operator": "not_exists", "values": []}
        ]));
        let ctx = make_context_with_attrs(None, vec![("premium", Value::Null)]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_not_exists_no_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "premium", "operator": "not_exists", "values": []}
        ]));
        let ctx = make_context_with_attrs(None, vec![("premium", json!(true))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // -----------------------------------------------------------------------
    // Attribute rules -- AND logic (multiple conditions)
    // -----------------------------------------------------------------------

    #[test]
    fn test_attribute_and_logic_all_match() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "eq", "values": ["US"]},
            {"attribute": "age", "operator": "gte", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(
            None,
            vec![("country", json!("US")), ("age", json!(21))],
        );
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_and_logic_one_fails() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "eq", "values": ["US"]},
            {"attribute": "age", "operator": "gte", "values": ["18"]}
        ]));
        let ctx = make_context_with_attrs(
            None,
            vec![("country", json!("US")), ("age", json!(16))],
        );
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // -----------------------------------------------------------------------
    // Attribute rules -- missing attribute
    // -----------------------------------------------------------------------

    #[test]
    fn test_attribute_missing_returns_default() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "eq", "values": ["US"]}
        ]));
        let ctx = make_context(None); // no attributes at all
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    #[test]
    fn test_attribute_null_value_returns_default() {
        let flag = make_attribute_flag(json!([
            {"attribute": "country", "operator": "eq", "values": ["US"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("country", Value::Null)]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // -----------------------------------------------------------------------
    // Attribute rules -- number coercion
    // -----------------------------------------------------------------------

    #[test]
    fn test_attribute_eq_number_as_string() {
        // JavaScript String(42) === "42"
        let flag = make_attribute_flag(json!([
            {"attribute": "level", "operator": "eq", "values": ["42"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("level", json!(42))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    #[test]
    fn test_attribute_in_with_number_value() {
        let flag = make_attribute_flag(json!([
            {"attribute": "tier", "operator": "in", "values": ["1", "2", "3"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("tier", json!(2))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }

    // -----------------------------------------------------------------------
    // Semver comparison helper
    // -----------------------------------------------------------------------

    #[test]
    fn test_compare_semver_equal() {
        assert_eq!(compare_semver("1.0.0", "1.0.0"), 0);
    }

    #[test]
    fn test_compare_semver_greater() {
        assert_eq!(compare_semver("2.0.0", "1.0.0"), 1);
    }

    #[test]
    fn test_compare_semver_less() {
        assert_eq!(compare_semver("1.0.0", "2.0.0"), -1);
    }

    #[test]
    fn test_compare_semver_missing_segment_treated_as_zero() {
        assert_eq!(compare_semver("1.2.3", "1.2"), 1); // 1.2.3 > 1.2.0
        assert_eq!(compare_semver("1.2", "1.2.0"), 0); // 1.2 == 1.2.0
    }

    #[test]
    fn test_compare_semver_minor_difference() {
        assert_eq!(compare_semver("1.3.0", "1.2.0"), 1);
        assert_eq!(compare_semver("1.2.0", "1.3.0"), -1);
    }

    #[test]
    fn test_compare_semver_patch_difference() {
        assert_eq!(compare_semver("1.0.2", "1.0.1"), 1);
        assert_eq!(compare_semver("1.0.1", "1.0.2"), -1);
    }

    // -----------------------------------------------------------------------
    // Unknown rule type
    // -----------------------------------------------------------------------

    #[test]
    fn test_unknown_rule_type_skipped() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "unknown_rule".to_string(),
            variant_value: json!(true),
            rule_config: json!({}),
        });
        let ctx = make_context(Some("user-1"));
        let result = evaluate_flag(&flag, &ctx);
        assert_eq!(result.reason, "DEFAULT");
    }

    // -----------------------------------------------------------------------
    // Unknown attribute operator
    // -----------------------------------------------------------------------

    #[test]
    fn test_unknown_attribute_operator_skipped() {
        let flag = make_attribute_flag(json!([
            {"attribute": "x", "operator": "regex_match", "values": [".*"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("x", json!("hello"))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // -----------------------------------------------------------------------
    // Empty conditions
    // -----------------------------------------------------------------------

    #[test]
    fn test_attribute_empty_conditions_returns_default() {
        let mut flag = make_flag("my-flag", json!(false), true);
        flag.rules.push(RuleWithConfig {
            priority: 1,
            rule_type: "attribute".to_string(),
            variant_value: json!(true),
            rule_config: json!({"conditions": []}),
        });
        let ctx = make_context(None);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "DEFAULT");
    }

    // -----------------------------------------------------------------------
    // find_variant
    // -----------------------------------------------------------------------

    #[test]
    fn test_find_variant_match() {
        let variations = vec![
            Variation { id: 1, value: json!(true), name: Some("on".to_string()) },
            Variation { id: 2, value: json!(false), name: Some("off".to_string()) },
        ];
        assert_eq!(find_variant(&variations, &json!(true)), Some((Some("on".to_string()), 1)));
        assert_eq!(find_variant(&variations, &json!(false)), Some((Some("off".to_string()), 2)));
    }

    #[test]
    fn test_find_variant_no_match() {
        let variations = vec![
            Variation { id: 1, value: json!(true), name: Some("on".to_string()) },
        ];
        assert_eq!(find_variant(&variations, &json!("unknown")), None);
    }

    #[test]
    fn test_find_variant_none_name() {
        let variations = vec![
            Variation { id: 1, value: json!(true), name: None },
        ];
        assert_eq!(find_variant(&variations, &json!(true)), Some((None, 1)));
    }

    // -----------------------------------------------------------------------
    // value_to_string helper
    // -----------------------------------------------------------------------

    #[test]
    fn test_value_to_string_types() {
        assert_eq!(value_to_string(&json!("hello")), "hello");
        assert_eq!(value_to_string(&json!(42)), "42");
        assert_eq!(value_to_string(&json!(3.14)), "3.14");
        assert_eq!(value_to_string(&json!(true)), "true");
        assert_eq!(value_to_string(&json!(false)), "false");
        assert_eq!(value_to_string(&Value::Null), "null");
    }

    // -----------------------------------------------------------------------
    // Boolean attribute coercion
    // -----------------------------------------------------------------------

    #[test]
    fn test_attribute_eq_boolean_as_string() {
        let flag = make_attribute_flag(json!([
            {"attribute": "active", "operator": "eq", "values": ["true"]}
        ]));
        let ctx = make_context_with_attrs(None, vec![("active", json!(true))]);
        assert_eq!(evaluate_flag(&flag, &ctx).reason, "TARGETING_MATCH");
    }
}
