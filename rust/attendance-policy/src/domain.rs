const MAX_EXACT_INTEGER: f64 = 4_503_599_627_370_496.0; // 2^52

fn number_or_zero(value: f64) -> f64 {
    if value.is_nan() || value == 0.0 {
        0.0
    } else {
        value
    }
}

// JavaScript Math.round chooses the integer toward +infinity at exact ties.
fn js_math_round(value: f64) -> f64 {
    let value = number_or_zero(value);
    if !value.is_finite() || value.abs() >= MAX_EXACT_INTEGER {
        return value;
    }
    (value + 0.5).floor()
}

// Match Math.max(0, value), including NaN propagation and positive zero.
fn js_max_zero(value: f64) -> f64 {
    if value.is_nan() {
        f64::NAN
    } else if value <= 0.0 {
        0.0
    } else {
        value
    }
}

/// Calculate the preview's chargeable late minutes using the source JS helper's
/// numeric rounding and clamp/subtract behavior.
pub fn calculate_chargeable_late_minutes(raw_late_minutes: f64, arrival_grace_minutes: f64) -> f64 {
    let raw = js_max_zero(js_math_round(raw_late_minutes));
    let grace = js_max_zero(js_math_round(arrival_grace_minutes));
    js_max_zero(raw - grace)
}
