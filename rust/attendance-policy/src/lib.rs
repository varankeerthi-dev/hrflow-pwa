//! HRFlow attendance-policy pilot crate.

pub mod domain;

/// Numeric WebAssembly boundary for the chargeable-late-minute domain function.
///
/// JavaScript callers must pass numbers; JS object-to-number coercion is outside
/// this typed ABI. NaN and infinities are preserved with the source helper's
/// `Number(x) || 0`, rounding, and clamping behavior.
#[no_mangle]
pub extern "C" fn calculate_chargeable_late_minutes(
    raw_late_minutes: f64,
    arrival_grace_minutes: f64,
) -> f64 {
    domain::calculate_chargeable_late_minutes(raw_late_minutes, arrival_grace_minutes)
}
