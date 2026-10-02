//! Pure Rust port of `src/lib/leaveEntitlements.js`.
//!
//! JSON is accepted only at the fixture/CLI boundary. Internally, catalog rows,
//! policy versions, ledger entries, requests, grants, balances, and allocation
//! outcomes are represented as domain values. No Firebase or application code
//! is linked into this crate.

use serde_json::{Map, Number, Value};
use std::collections::BTreeMap;

const LEGACY_TYPES: &[(&str, &str, &[&str])] = &[
    ("casual", "Casual", &["CL"]),
    ("privilege", "Privilege", &["EL", "Annual"]),
    ("sick", "Sick", &["SL"]),
    ("maternity", "Maternity", &[]),
    ("paternity", "Paternity", &[]),
    ("unpaid", "Unpaid", &[]),
    ("lop", "LOP", &["Loss of Pay"]),
];

#[derive(Clone, Debug)]
struct LeaveTypeDefinition {
    code: String,
    name: String,
    aliases: Vec<Value>,
    enabled: bool,
    built_in: bool,
    extra: Map<String, Value>,
}

impl LeaveTypeDefinition {
    fn to_value(&self) -> Value {
        let mut fields = self.extra.clone();
        fields.insert("code".into(), Value::String(self.code.clone()));
        fields.insert("name".into(), Value::String(self.name.clone()));
        fields.insert("aliases".into(), Value::Array(self.aliases.clone()));
        fields.insert("enabled".into(), Value::Bool(self.enabled));
        fields.insert("builtIn".into(), Value::Bool(self.built_in));
        Value::Object(fields)
    }
}

#[derive(Clone, Debug, Default)]
struct Organization {
    configured_types: Vec<Map<String, Value>>,
    policies: Map<String, Value>,
    policy_versions: Vec<Value>,
}

impl Organization {
    fn from_value(value: &Value) -> Self {
        let root = object(value);
        let configured_types = root
            .get("leaveTypes")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(object)
            .collect();

        let direct_policies = root.get("leavePolicies");
        let nested_policies = root
            .get("leavePolicy")
            .and_then(Value::as_object)
            .and_then(|policy| policy.get("types"));
        let selected_policies = if truthy(direct_policies) {
            direct_policies
        } else {
            nested_policies
        };
        let policies = selected_policies
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let policy_versions = root
            .get("leavePolicyVersions")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        Self {
            configured_types,
            policies,
            policy_versions,
        }
    }
}

#[derive(Clone, Debug)]
struct Policy {
    fields: Map<String, Value>,
}

impl Policy {
    fn from_value(value: &Value) -> Self {
        Self {
            fields: object(value),
        }
    }

    fn cadence(&self) -> Option<&str> {
        self.fields
            .get("entitlementCadence")
            .and_then(Value::as_str)
    }

    fn amount(&self) -> f64 {
        js_number(self.fields.get("entitlementAmount"))
    }

    fn effective_from(&self) -> Option<&str> {
        self.fields.get("effectiveFrom").and_then(Value::as_str)
    }

    fn value(&self) -> Value {
        Value::Object(self.fields.clone())
    }
}

#[derive(Clone, Debug)]
struct PolicyVersion {
    effective_from: String,
    version: f64,
    policy: Policy,
}

#[derive(Clone, Debug)]
struct AccrualGrant {
    id: String,
    leave_type_code: String,
    effective_date: String,
    quantity: f64,
    cadence: Option<String>,
    policy_version: Value,
}

impl AccrualGrant {
    fn to_value(&self) -> Value {
        let mut value = Map::new();
        value.insert("id".into(), Value::String(self.id.clone()));
        value.insert(
            "leaveTypeCode".into(),
            Value::String(self.leave_type_code.clone()),
        );
        value.insert(
            "effectiveDate".into(),
            Value::String(self.effective_date.clone()),
        );
        value.insert("quantity".into(), number_value(self.quantity));
        if let Some(cadence) = &self.cadence {
            value.insert("cadence".into(), Value::String(cadence.clone()));
        }
        value.insert("policyVersion".into(), self.policy_version.clone());
        Value::Object(value)
    }
}

#[derive(Clone, Debug)]
struct AccruedEntitlement {
    units: f64,
    grants: Vec<AccrualGrant>,
}

impl AccruedEntitlement {
    fn to_value(&self) -> Value {
        json_object([
            ("units", number_value(self.units)),
            (
                "grants",
                Value::Array(self.grants.iter().map(AccrualGrant::to_value).collect()),
            ),
        ])
    }
}

#[derive(Clone, Debug)]
struct LedgerEntry {
    leave_type: String,
    source: String,
    id: String,
    is_balance_state: bool,
    effective_date: String,
    quantity: f64,
}

impl LedgerEntry {
    fn from_value(value: &Value) -> Self {
        let fields = object(value);
        let type_value = first_truthy(&fields, &["leaveTypeCode", "leaveType", "typeCode"]);
        let source_value = first_truthy(&fields, &["source", "eventType"]);
        let date_value = first_truthy(&fields, &["effectiveDate", "date"]);
        Self {
            leave_type: js_string_or_empty(type_value),
            source: js_string_or_empty(source_value).trim().to_lowercase(),
            id: js_string_or_empty(fields.get("id").filter(|value| truthy(Some(value)))),
            is_balance_state: fields
                .get("isBalanceState")
                .is_some_and(|value| truthy(Some(value))),
            effective_date: js_string_or_empty(date_value),
            quantity: js_number_or_zero(fields.get("quantity")),
        }
    }
}

#[derive(Clone, Debug)]
struct LeaveRequest {
    leave_type: String,
    status: String,
    requested_units: f64,
}

impl LeaveRequest {
    fn from_value(value: &Value) -> Self {
        let fields = object(value);
        let type_value = first_truthy(&fields, &["leaveTypeCode", "leaveType"]);
        let status = js_string_or_empty(fields.get("status").filter(|value| truthy(Some(value))))
            .trim()
            .to_lowercase();
        let coverage = fields.get("coveragePreview").and_then(Value::as_array);
        let requested_units = if let Some(items) = coverage.filter(|items| !items.is_empty()) {
            items
                .iter()
                .map(|item| js_number_or_zero(object_ref(item).get("leaveUnits")))
                .sum()
        } else {
            let requested = fields
                .get("requestedUnits")
                .filter(|value| truthy(Some(value)))
                .or_else(|| fields.get("duration").filter(|value| truthy(Some(value))));
            js_number_or_zero(requested)
        };
        Self {
            leave_type: js_string_or_empty(type_value),
            status,
            requested_units,
        }
    }
}

#[derive(Clone, Debug)]
struct LeaveBalance {
    leave_type_code: String,
    leave_type: String,
    configured: bool,
    cadence: Value,
    policy_version: Value,
    accrued: f64,
    accruals: Vec<AccrualGrant>,
    opening: f64,
    granted: f64,
    used: f64,
    pending: f64,
    expired: f64,
    entitlement: f64,
    available: Option<f64>,
    over_entitlement: f64,
    as_of: String,
}

impl LeaveBalance {
    fn to_value(&self) -> Value {
        json_object([
            ("leaveTypeCode", Value::String(self.leave_type_code.clone())),
            ("leaveType", Value::String(self.leave_type.clone())),
            ("configured", Value::Bool(self.configured)),
            ("cadence", self.cadence.clone()),
            ("policyVersion", self.policy_version.clone()),
            ("accrued", number_value(self.accrued)),
            (
                "accruals",
                Value::Array(self.accruals.iter().map(AccrualGrant::to_value).collect()),
            ),
            ("opening", number_value(self.opening)),
            ("granted", number_value(self.granted)),
            ("used", number_value(self.used)),
            ("pending", number_value(self.pending)),
            ("expired", number_value(self.expired)),
            ("entitlement", number_value(self.entitlement)),
            (
                "available",
                self.available.map(number_value).unwrap_or(Value::Null),
            ),
            ("overEntitlement", number_value(self.over_entitlement)),
            (
                "projectedAfterPending",
                self.available.map(number_value).unwrap_or(Value::Null),
            ),
            ("asOf", Value::String(self.as_of.clone())),
        ])
    }
}

#[derive(Clone, Debug)]
struct Candidate {
    fields: Map<String, Value>,
}

impl Candidate {
    fn from_value(value: &Value) -> Self {
        Self {
            fields: object(value),
        }
    }

    fn classification(&self) -> String {
        js_string(
            self.fields
                .get("classification")
                .filter(|value| truthy(Some(value))),
        )
    }

    fn leave_units(&self) -> f64 {
        js_number_or_zero(self.fields.get("leaveUnits"))
    }

    fn paid_behavior(&self) -> String {
        self.fields
            .get("policySnapshot")
            .and_then(Value::as_object)
            .and_then(|snapshot| snapshot.get("paidBehavior"))
            .map(|value| js_string(Some(value)))
            .unwrap_or_default()
    }

    fn set_classification(&mut self, classification: &str) {
        self.fields.insert(
            "classification".into(),
            Value::String(classification.to_owned()),
        );
    }

    fn set_segments(&mut self, segments: Vec<Value>) {
        self.fields
            .insert("segments".into(), Value::Array(segments));
    }

    fn value(self) -> Value {
        Value::Object(self.fields)
    }
}

#[derive(Clone, Debug)]
struct Allocation {
    candidates: Vec<Candidate>,
    requested_paid_units: f64,
    paid_units: f64,
    unpaid_shortfall_units: f64,
    over_entitlement_units: f64,
}

impl Allocation {
    fn to_value(self) -> Value {
        json_object([
            (
                "candidates",
                Value::Array(self.candidates.into_iter().map(Candidate::value).collect()),
            ),
            (
                "requestedPaidUnits",
                number_value(self.requested_paid_units),
            ),
            ("paidUnits", number_value(self.paid_units)),
            (
                "unpaidShortfallUnits",
                number_value(self.unpaid_shortfall_units),
            ),
            (
                "overEntitlementUnits",
                number_value(self.over_entitlement_units),
            ),
        ])
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct IsoDate {
    year: u32,
    month: u32,
    day: u32,
}

impl IsoDate {
    fn parse(value: &str) -> Option<Self> {
        let bytes = value.as_bytes();
        if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
            return None;
        }
        if !bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
        {
            return None;
        }
        let date = Self {
            year: value[0..4].parse().ok()?,
            month: value[5..7].parse().ok()?,
            day: value[8..10].parse().ok()?,
        };
        if date.month == 0
            || date.month > 12
            || date.day == 0
            || date.day > days_in_month(date.year, date.month)
        {
            return None;
        }
        Some(date)
    }

    fn add_months_clamped(self, months: u32) -> Self {
        let month_index = self.month - 1 + months;
        let year = self.year + month_index / 12;
        let month = month_index % 12 + 1;
        Self {
            year,
            month,
            day: self.day.min(days_in_month(year, month)),
        }
    }

    fn format(self) -> String {
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}

fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
        2 => 28,
        _ => 0,
    }
}

fn object(value: &Value) -> Map<String, Value> {
    value.as_object().cloned().unwrap_or_default()
}

fn object_ref(value: &Value) -> &Map<String, Value> {
    static EMPTY: std::sync::OnceLock<Map<String, Value>> = std::sync::OnceLock::new();
    value
        .as_object()
        .unwrap_or_else(|| EMPTY.get_or_init(Map::new))
}

fn json_object<const N: usize>(items: [(&str, Value); N]) -> Value {
    let mut fields = Map::new();
    for (key, value) in items {
        fields.insert(key.to_owned(), value);
    }
    Value::Object(fields)
}

fn number_value(value: f64) -> Value {
    if value.is_finite()
        && value.fract() == 0.0
        && value >= i64::MIN as f64
        && value < i64::MAX as f64
    {
        return Value::Number(Number::from(value as i64));
    }
    Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(value)) => value
            .as_f64()
            .is_some_and(|number| number != 0.0 && !number.is_nan()),
        Some(Value::String(value)) => !value.is_empty(),
        Some(Value::Array(_) | Value::Object(_)) => true,
    }
}

fn js_string(value: Option<&Value>) -> String {
    match value {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::String(value)) => value.clone(),
        Some(Value::Bool(value)) => value.to_string(),
        Some(Value::Number(value)) => value.to_string(),
        Some(Value::Array(values)) => values
            .iter()
            .map(|item| match item {
                Value::Null => String::new(),
                _ => js_string(Some(item)),
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

fn js_string_or_empty(value: Option<&Value>) -> String {
    if truthy(value) {
        js_string(value)
    } else {
        String::new()
    }
}

fn js_number(value: Option<&Value>) -> f64 {
    match value {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(value)) => u8::from(*value) as f64,
        Some(Value::Number(value)) => value.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                0.0
            } else if trimmed == "Infinity" || trimmed == "+Infinity" {
                f64::INFINITY
            } else if trimmed == "-Infinity" {
                f64::NEG_INFINITY
            } else if let Some((digits, radix)) = non_decimal_prefix(trimmed) {
                parse_radix(digits, radix)
            } else {
                trimmed.parse().unwrap_or(f64::NAN)
            }
        }
        Some(Value::Array(values)) => {
            let text = values
                .iter()
                .map(|item| {
                    if item.is_null() {
                        String::new()
                    } else {
                        js_string(Some(item))
                    }
                })
                .collect::<Vec<_>>()
                .join(",");
            js_number(Some(&Value::String(text)))
        }
        Some(Value::Object(_)) => f64::NAN,
    }
}

fn non_decimal_prefix(value: &str) -> Option<(&str, u32)> {
    if let Some(digits) = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
    {
        Some((digits, 16))
    } else if let Some(digits) = value
        .strip_prefix("0b")
        .or_else(|| value.strip_prefix("0B"))
    {
        Some((digits, 2))
    } else if let Some(digits) = value
        .strip_prefix("0o")
        .or_else(|| value.strip_prefix("0O"))
    {
        Some((digits, 8))
    } else {
        None
    }
}

fn parse_radix(digits: &str, radix: u32) -> f64 {
    if digits.is_empty() {
        return f64::NAN;
    }
    let mut number = 0.0;
    for digit in digits.chars() {
        let Some(value) = digit.to_digit(radix) else {
            return f64::NAN;
        };
        number = number * f64::from(radix) + f64::from(value);
    }
    number
}

fn js_number_or_zero(value: Option<&Value>) -> f64 {
    if truthy(value) {
        js_number(value)
    } else {
        0.0
    }
}

fn first_truthy<'a>(fields: &'a Map<String, Value>, keys: &[&str]) -> Option<&'a Value> {
    keys.iter()
        .filter_map(|key| fields.get(*key))
        .find(|value| truthy(Some(value)))
}

fn normalize_label(value: Option<&Value>) -> String {
    let text = if truthy(value) {
        js_string(value)
    } else {
        String::new()
    };
    let mut normalized = String::new();
    for character in text.trim().to_lowercase().chars() {
        if matches!(character, '.' | '_' | '-') {
            normalized.push(' ');
        } else {
            normalized.push(character);
        }
    }
    normalized.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn slugify(value: Option<&Value>) -> String {
    let label = normalize_label(value);
    let mut slug = String::new();
    for character in label.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
        } else if !slug.is_empty() && !slug.ends_with('_') {
            slug.push('_');
        }
    }
    slug.trim_matches('_').to_owned()
}

fn built_in_types() -> Vec<LeaveTypeDefinition> {
    LEGACY_TYPES
        .iter()
        .map(|(code, name, aliases)| LeaveTypeDefinition {
            code: (*code).to_owned(),
            name: (*name).to_owned(),
            aliases: aliases
                .iter()
                .map(|alias| Value::String((*alias).to_owned()))
                .collect(),
            enabled: true,
            built_in: true,
            extra: Map::new(),
        })
        .collect()
}

fn append_unique(target: &mut Vec<Value>, values: impl IntoIterator<Item = Value>) {
    for value in values {
        if !target.contains(&value) {
            target.push(value);
        }
    }
}

fn configured_types(org: &Organization) -> Vec<LeaveTypeDefinition> {
    let mut merged = built_in_types()
        .into_iter()
        .map(|base| {
            let override_fields = org.configured_types.iter().find(|definition| {
                slugify(first_truthy(definition, &["code", "name"])) == base.code
                    || normalize_label(definition.get("name"))
                        == normalize_label(Some(&Value::String(base.name.clone())))
            });
            let mut aliases = base.aliases.clone();
            if let Some(fields) = override_fields {
                if let Some(custom_aliases) = fields.get("aliases").and_then(Value::as_array) {
                    append_unique(&mut aliases, custom_aliases.iter().cloned());
                }
            }
            let name = override_fields
                .and_then(|fields| fields.get("name"))
                .filter(|value| truthy(Some(value)))
                .map(|value| js_string(Some(value)))
                .unwrap_or_else(|| base.name.clone());
            LeaveTypeDefinition {
                code: base.code,
                name: name.trim().to_owned(),
                aliases,
                enabled: override_fields.and_then(|fields| fields.get("enabled"))
                    != Some(&Value::Bool(false)),
                built_in: true,
                extra: override_fields.cloned().unwrap_or_default(),
            }
        })
        .collect::<Vec<_>>();

    for definition in &org.configured_types {
        let name_value = definition
            .get("name")
            .filter(|value| truthy(Some(value)))
            .cloned()
            .unwrap_or_else(|| Value::String(String::new()));
        let name = js_string(Some(&name_value)).trim().to_owned();
        let code_value = first_truthy(definition, &["code"])
            .cloned()
            .unwrap_or_else(|| Value::String(name.clone()));
        let code = slugify(Some(&code_value));
        if name.is_empty() || code.is_empty() || merged.iter().any(|item| item.code == code) {
            continue;
        }
        let aliases = definition
            .get("aliases")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(|alias| js_string(Some(alias)).trim().to_owned())
            .filter(|alias| !alias.is_empty())
            .map(Value::String)
            .collect();
        merged.push(LeaveTypeDefinition {
            code,
            name,
            aliases,
            enabled: definition.get("enabled") != Some(&Value::Bool(false)),
            built_in: false,
            extra: definition.clone(),
        });
    }
    merged.into_iter().filter(|item| item.enabled).collect()
}

fn normalize_type_code(value: Option<&Value>, definitions: &[LeaveTypeDefinition]) -> String {
    let label = normalize_label(value);
    if label.is_empty() {
        return String::new();
    }
    definitions
        .iter()
        .find(|definition| {
            normalize_label(Some(&Value::String(definition.code.clone()))) == label
                || normalize_label(Some(&Value::String(definition.name.clone()))) == label
                || definition
                    .aliases
                    .iter()
                    .any(|alias| normalize_label(Some(alias)) == label)
        })
        .map(|definition| definition.code.clone())
        .unwrap_or_else(|| slugify(value))
}

fn leave_type_definition(org: &Organization, value: Option<&Value>) -> Option<LeaveTypeDefinition> {
    let types = configured_types(org);
    let code = normalize_type_code(value, &types);
    types
        .iter()
        .find(|definition| definition.code == code)
        .cloned()
        .or_else(|| {
            let label = normalize_label(value);
            types.into_iter().find(|definition| {
                normalize_label(Some(&Value::String(definition.name.clone()))) == label
            })
        })
}

fn policy_versions(org: &Organization, code: &str) -> Vec<PolicyVersion> {
    let definitions = configured_types(org);
    let mut versions = org
        .policy_versions
        .iter()
        .filter_map(|version_value| {
            let fields = object(version_value);
            let type_value = first_truthy(&fields, &["leaveTypeCode", "leaveType", "code"]);
            if normalize_type_code(type_value, &definitions) != code {
                return None;
            }
            let policy_value = fields.get("policy").filter(|value| truthy(Some(value)));
            let policy_fields = object(policy_value.unwrap_or(version_value));
            let date_value = fields
                .get("effectiveFrom")
                .filter(|value| truthy(Some(value)))
                .or_else(|| policy_fields.get("effectiveFrom"))
                .and_then(Value::as_str)?;
            IsoDate::parse(date_value)?;
            let version = js_number_or_zero(fields.get("version"));
            Some(PolicyVersion {
                effective_from: date_value.to_owned(),
                version,
                policy: Policy {
                    fields: policy_fields,
                },
            })
        })
        .collect::<Vec<_>>();
    versions.sort_by(|left, right| {
        left.effective_from
            .cmp(&right.effective_from)
            .then_with(|| left.version.total_cmp(&right.version))
    });
    versions
}

fn policy_for_type(org: &Organization, type_value: Option<&Value>, date: Option<&str>) -> Policy {
    let definitions = configured_types(org);
    let code = normalize_type_code(type_value, &definitions);
    let definition = leave_type_definition(org, type_value);
    let type_key = js_string(type_value);
    let definition_name = definition.as_ref().map(|item| item.name.as_str());

    let direct = org
        .policies
        .get(&type_key)
        .filter(|value| truthy(Some(value)))
        .or_else(|| {
            definition_name
                .and_then(|name| org.policies.get(name))
                .filter(|value| truthy(Some(value)))
        })
        .or_else(|| org.policies.get(&code).filter(|value| truthy(Some(value))))
        .or_else(|| {
            let first_matching = org
                .policies
                .iter()
                .find(|(key, _)| {
                    normalize_type_code(Some(&Value::String((*key).clone())), &definitions) == code
                })
                .map(|(_, value)| value);
            first_matching.filter(|value| truthy(Some(value)))
        });
    let direct = direct
        .map(Policy::from_value)
        .unwrap_or_else(|| Policy { fields: Map::new() });

    let all_versions = policy_versions(org, &code);
    let selected = all_versions
        .iter()
        .filter(|version| date.is_none_or(|date| version.effective_from.as_str() <= date))
        .last();
    if let Some(selected) = selected {
        let mut fields = direct.fields;
        fields.extend(selected.policy.fields.clone());
        let selected_policy_version = if selected.version != 0.0 && !selected.version.is_nan() {
            number_value(selected.version)
        } else {
            selected
                .policy
                .fields
                .get("policyVersion")
                .filter(|value| truthy(Some(value)))
                .cloned()
                .unwrap_or_else(|| Value::String("v1".into()))
        };
        fields.insert("policyVersion".into(), selected_policy_version);
        return Policy { fields };
    }
    if !all_versions.is_empty() {
        Policy { fields: Map::new() }
    } else {
        direct
    }
}

fn entitlement_configured(policy: &Policy) -> bool {
    matches!(policy.cadence(), Some("monthly" | "annual"))
        && policy.amount().is_finite()
        && policy.amount() > 0.0
        && policy.effective_from().and_then(IsoDate::parse).is_some()
}

fn accrual_dates(policy: &Policy, as_of: &str, next_effective_from: Option<&str>) -> Vec<String> {
    if !entitlement_configured(policy) || IsoDate::parse(as_of).is_none() {
        return Vec::new();
    }
    let Some(start) = policy.effective_from().and_then(IsoDate::parse) else {
        return Vec::new();
    };
    if start.format().as_str() > as_of {
        return Vec::new();
    }
    let step_months = if policy.cadence() == Some("annual") {
        12
    } else {
        1
    };
    let mut dates = Vec::new();
    for period in 1..=600 {
        let grant_date = start.add_months_clamped(step_months * period).format();
        if grant_date.as_str() > as_of
            || next_effective_from.is_some_and(|next| grant_date.as_str() >= next)
        {
            break;
        }
        dates.push(grant_date);
    }
    dates
}

fn round_to_four_decimals(value: f64) -> f64 {
    format!("{value:.4}").parse().unwrap_or(value)
}

fn policy_version_for_grant(version: &PolicyVersion) -> Value {
    if version.version != 0.0 && !version.version.is_nan() {
        number_value(version.version)
    } else {
        version
            .policy
            .fields
            .get("policyVersion")
            .filter(|value| truthy(Some(value)))
            .cloned()
            .unwrap_or_else(|| Value::String("v1".into()))
    }
}

fn version_text(version: &PolicyVersion) -> String {
    if version.version != 0.0 && !version.version.is_nan() {
        return js_number_to_string(version.version);
    }
    match version
        .policy
        .fields
        .get("policyVersion")
        .filter(|value| truthy(Some(value)))
    {
        Some(Value::Number(number)) => number
            .as_f64()
            .map(js_number_to_string)
            .unwrap_or_else(|| number.to_string()),
        Some(value) => js_string(Some(value)),
        None => "1".into(),
    }
}

fn js_number_to_string(value: f64) -> String {
    if value == 0.0 {
        "0".into()
    } else if value.is_finite() && value.fract() == 0.0 {
        format!("{value:.0}")
    } else {
        value.to_string()
    }
}

fn calculate_accrued(
    org: &Organization,
    leave_type: Option<&Value>,
    as_of: &str,
) -> AccruedEntitlement {
    let definitions = configured_types(org);
    let code = normalize_type_code(leave_type, &definitions);
    let stored_versions = policy_versions(org, &code);
    let current = policy_for_type(org, leave_type, Some(as_of));
    let mut versions = if !stored_versions.is_empty() {
        stored_versions
    } else if let Some(effective_from) = current
        .effective_from()
        .filter(|date| IsoDate::parse(date).is_some())
    {
        let version_value = current
            .fields
            .get("policyVersion")
            .filter(|value| truthy(Some(value)))
            .cloned()
            .unwrap_or_else(|| Value::Number(Number::from(1)));
        vec![PolicyVersion {
            effective_from: effective_from.to_owned(),
            version: js_number(Some(&version_value)),
            policy: current,
        }]
    } else {
        Vec::new()
    };
    versions.sort_by(|left, right| {
        left.effective_from
            .cmp(&right.effective_from)
            .then_with(|| left.version.total_cmp(&right.version))
    });
    let mut by_effective_date = BTreeMap::new();
    for version in versions {
        by_effective_date.insert(version.effective_from.clone(), version);
    }
    let ordered = by_effective_date.into_values().collect::<Vec<_>>();
    let mut units = 0.0;
    let mut grants = Vec::new();
    for (index, version) in ordered.iter().enumerate() {
        let next_effective_from = ordered
            .get(index + 1)
            .map(|next| next.effective_from.as_str());
        for effective_date in accrual_dates(&version.policy, as_of, next_effective_from) {
            let quantity = version.policy.amount();
            units += quantity;
            let policy_version = policy_version_for_grant(version);
            grants.push(AccrualGrant {
                id: format!(
                    "{}_{}_v{}",
                    code,
                    effective_date.replace('-', ""),
                    version_text(version)
                ),
                leave_type_code: code.clone(),
                effective_date,
                quantity,
                cadence: version.policy.cadence().map(str::to_owned),
                policy_version,
            });
        }
    }
    AccruedEntitlement {
        units: round_to_four_decimals(units),
        grants,
    }
}

fn calculate_balance(
    org: &Organization,
    leave_type: Option<&Value>,
    ledger_values: &[Value],
    request_values: &[Value],
    as_of: &str,
) -> LeaveBalance {
    let definitions = configured_types(org);
    let code = normalize_type_code(leave_type, &definitions);
    let definition = leave_type_definition(org, leave_type);
    let policy = policy_for_type(org, leave_type, Some(as_of));
    let accrued = calculate_accrued(org, leave_type, as_of);
    let configured = entitlement_configured(&policy) || accrued.units > 0.0;

    let entries = ledger_values
        .iter()
        .map(LedgerEntry::from_value)
        .filter(|entry| {
            let date_prefix = entry.effective_date.chars().take(10).collect::<String>();
            !entry.is_balance_state
                && !entry.id.starts_with("__balance__")
                && normalize_type_code(Some(&Value::String(entry.leave_type.clone())), &definitions)
                    == code
                && (date_prefix.is_empty() || date_prefix.as_str() <= as_of)
        })
        .collect::<Vec<_>>();

    let sum_sources = |sources: &[&str]| -> f64 {
        entries
            .iter()
            .filter(|entry| sources.contains(&entry.source.as_str()))
            .map(|entry| entry.quantity)
            .sum()
    };
    let opening = sum_sources(&["opening_balance", "opening", "manual_grant"]);
    let granted = sum_sources(&["grant", "accrual", "carryover", "adjustment_credit"]);
    let used_events = sum_sources(&["approved_leave", "leave_debit", "approved_leave_debit"]);
    let reversal_events = sum_sources(&[
        "leave_cancelled",
        "worked_override_credit",
        "approved_leave_reversal",
    ]);
    let used = (-(used_events) - reversal_events).max(0.0);
    let expired = (-sum_sources(&["expired", "expiry"])).max(0.0);
    let adjustments = sum_sources(&["balance_adjustment", "adjustment_credit"]);
    let granted_total = granted + adjustments;
    let pending = request_values
        .iter()
        .map(LeaveRequest::from_value)
        .filter(|request| {
            matches!(
                request.status.as_str(),
                "pending" | "in review" | "in_review"
            ) && normalize_type_code(
                Some(&Value::String(request.leave_type.clone())),
                &definitions,
            ) == code
        })
        .map(|request| request.requested_units)
        .sum::<f64>();
    let entitlement = accrued.units + opening + granted_total;
    let available = configured.then_some(entitlement - used - expired - pending);
    let over_entitlement = available.map(|amount| (-amount).max(0.0)).unwrap_or(0.0);
    let cadence = policy
        .fields
        .get("entitlementCadence")
        .filter(|value| truthy(Some(value)))
        .cloned()
        .unwrap_or_else(|| Value::String("unconfigured".into()));
    let policy_version = policy
        .fields
        .get("policyVersion")
        .filter(|value| truthy(Some(value)))
        .cloned()
        .unwrap_or_else(|| Value::String("v1".into()));
    let leave_type_name = definition
        .map(|definition| definition.name)
        .unwrap_or_else(|| {
            let value = leave_type.filter(|value| truthy(Some(value)));
            if value.is_none() {
                String::new()
            } else {
                js_string(value)
            }
        });

    LeaveBalance {
        leave_type_code: code,
        leave_type: leave_type_name,
        configured,
        cadence,
        policy_version,
        accrued: accrued.units,
        accruals: accrued.grants,
        opening,
        granted: granted_total,
        used,
        pending,
        expired,
        entitlement,
        available,
        over_entitlement,
        as_of: as_of.to_owned(),
    }
}

fn apply_entitlement_limit(
    candidate_values: &[Value],
    available_value: Option<&Value>,
    overuse_mode: &str,
) -> Allocation {
    let candidates = candidate_values
        .iter()
        .map(Candidate::from_value)
        .collect::<Vec<_>>();
    let requested_paid_units = candidates
        .iter()
        .filter(|candidate| candidate.classification().contains("paid"))
        .map(Candidate::leave_units)
        .sum::<f64>();
    let available_input = js_number(available_value);
    if !available_input.is_finite() || requested_paid_units <= available_input {
        return Allocation {
            candidates,
            requested_paid_units,
            paid_units: requested_paid_units,
            unpaid_shortfall_units: 0.0,
            over_entitlement_units: 0.0,
        };
    }
    let available = available_input.max(0.0);
    if overuse_mode == "allow_negative" || overuse_mode != "unpaid_shortfall" {
        return Allocation {
            candidates,
            requested_paid_units,
            paid_units: requested_paid_units,
            unpaid_shortfall_units: 0.0,
            over_entitlement_units: requested_paid_units - available,
        };
    }

    let mut remaining = ((available + 1e-8) * 2.0).floor() / 2.0;
    let mut paid_units = 0.0;
    let mut unpaid_shortfall_units = 0.0;
    let adjusted = candidates
        .into_iter()
        .map(|mut candidate| {
            if !candidate.classification().contains("paid") {
                return candidate;
            }
            let units = candidate.leave_units();
            let paid = units.min(remaining);
            let unpaid = (units - paid).max(0.0);
            remaining = (remaining - paid).max(0.0);
            paid_units += paid;
            unpaid_shortfall_units += unpaid;
            if unpaid == 0.0 {
                return candidate;
            }
            let unpaid_classification = if candidate.paid_behavior() == "lop" {
                "lop_leave"
            } else {
                "unpaid_leave"
            };
            if paid == 0.0 {
                candidate.set_classification(unpaid_classification);
                candidate.set_segments(Vec::new());
                return candidate;
            }
            candidate.set_classification("mixed_leave");
            candidate.set_segments(vec![
                json_object([
                    ("part", Value::String("entitled".into())),
                    ("classification", Value::String("half_paid_leave".into())),
                    ("units", number_value(paid)),
                ]),
                json_object([
                    ("part", Value::String("shortfall".into())),
                    (
                        "classification",
                        Value::String(unpaid_classification.into()),
                    ),
                    ("units", number_value(unpaid)),
                ]),
            ]);
            candidate
        })
        .collect();
    Allocation {
        candidates: adjusted,
        requested_paid_units,
        paid_units,
        unpaid_shortfall_units,
        over_entitlement_units: 0.0,
    }
}

fn unpaid_salary_impact(input: &Value) -> Option<f64> {
    let fields = object(input);
    let salary_value = fields.get("monthlySalary");
    if salary_value.is_none()
        || salary_value == Some(&Value::Null)
        || matches!(salary_value, Some(Value::String(value)) if value.is_empty())
    {
        return None;
    }
    let salary = js_number(salary_value);
    let days: f64 = fields
        .get("monthDays")
        .map(|value| js_number(Some(value)))
        .unwrap_or(30.0);
    if !salary.is_finite() || salary < 0.0 || !days.is_finite() || days <= 0.0 {
        return None;
    }
    let units = js_number_or_zero(fields.get("units"));
    let basic = fields
        .get("basicPercent")
        .map(|value| js_number_or_zero(Some(value)))
        .unwrap_or(40.0);
    let hra = fields
        .get("hraPercent")
        .map(|value| js_number_or_zero(Some(value)))
        .unwrap_or(20.0);
    let amount = units * salary * (basic + hra) / 100.0 / days;
    format!("{amount:.2}").parse().ok()
}

fn case_string<'a>(case: &'a Map<String, Value>, key: &str) -> Result<&'a str, String> {
    case.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("fixture case requires string `{key}`"))
}

fn case_date(case: &Map<String, Value>, key: &str) -> Result<String, String> {
    match case.get(key) {
        None => Ok(current_utc_date()),
        Some(Value::String(value)) => Ok(value.clone()),
        Some(_) => Err(format!(
            "fixture field `{key}` must be a string when supplied"
        )),
    }
}

fn current_utc_date() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let days_since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
        / 86_400;
    let shifted_days = days_since_epoch + 719_468;
    let era = shifted_days / 146_097;
    let day_of_era = shifted_days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_part = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_part + 2) / 5 + 1;
    let month = month_part + if month_part < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

/// Evaluate one JSON fixture through the typed leave-domain functions.
pub fn evaluate_case(case: &Value) -> Result<Value, String> {
    let fields = case
        .as_object()
        .ok_or_else(|| "fixture case must be an object".to_owned())?;
    let operation = case_string(fields, "op")?;
    let org = Organization::from_value(fields.get("orgData").unwrap_or(&Value::Null));
    let leave_type = fields.get("leaveType");
    match operation {
        "normalize" => {
            let definitions = configured_types(&org);
            let value = fields.get("value");
            Ok(Value::String(normalize_type_code(value, &definitions)))
        }
        "configuredTypes" => Ok(Value::Array(
            configured_types(&org)
                .iter()
                .map(LeaveTypeDefinition::to_value)
                .collect(),
        )),
        "definition" => Ok(leave_type_definition(&org, leave_type)
            .map(|definition| definition.to_value())
            .unwrap_or(Value::Null)),
        "isConfigured" => Ok(Value::Bool(entitlement_configured(&Policy::from_value(
            fields.get("policy").unwrap_or(&Value::Null),
        )))),
        "policy" => {
            let date = case_date(fields, "date")?;
            Ok(policy_for_type(&org, leave_type, Some(&date)).value())
        }
        "accrual" => {
            let as_of = case_date(fields, "asOf")?;
            Ok(calculate_accrued(&org, leave_type, &as_of).to_value())
        }
        "balance" => {
            let ledger = fields
                .get("ledgerEntries")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or_default();
            let requests = fields
                .get("requests")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or_default();
            Ok(calculate_balance(
                &org,
                leave_type,
                ledger,
                requests,
                &case_date(fields, "asOf")?,
            )
            .to_value())
        }
        "limit" => {
            let candidates = fields
                .get("candidates")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or_default();
            let mode = fields
                .get("overuseMode")
                .and_then(Value::as_str)
                .unwrap_or("block");
            Ok(apply_entitlement_limit(candidates, fields.get("availableUnits"), mode).to_value())
        }
        "salaryImpact" => Ok(
            unpaid_salary_impact(fields.get("input").unwrap_or(&Value::Null))
                .map(number_value)
                .unwrap_or(Value::Null),
        ),
        _ => Err(format!("unsupported fixture operation `{operation}`")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_dates_validate_and_month_end_clamps_from_the_original_day() {
        let jan_31 = IsoDate::parse("2024-01-31").unwrap();
        assert_eq!(jan_31.add_months_clamped(1).format(), "2024-02-29");
        assert_eq!(jan_31.add_months_clamped(2).format(), "2024-03-31");
        assert!(IsoDate::parse("2023-02-29").is_none());
        assert!(IsoDate::parse("2024-02-29").is_some());
    }

    #[test]
    fn numeric_conversion_matches_the_fixture_boundary_cases() {
        assert_eq!(
            js_number_or_zero(Some(&Value::String("-1.25".into()))),
            -1.25
        );
        assert_eq!(js_number_or_zero(Some(&Value::Null)), 0.0);
        assert!(js_number(None).is_nan());
        assert_eq!(js_number(Some(&Value::String("0x10".into()))), 16.0);
        assert_eq!(js_number(Some(&Value::String("0b10".into()))), 2.0);
        assert_eq!(js_number(Some(&Value::String("0o10".into()))), 8.0);
        assert!(js_number(Some(&Value::String("0x".into()))).is_nan());
    }
}
