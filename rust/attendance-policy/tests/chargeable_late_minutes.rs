use hrflow_attendance_policy::domain::calculate_chargeable_late_minutes;

const FIXTURES: &str = include_str!("../fixtures/chargeable-late-minutes.csv");

fn parse_number(value: &str) -> f64 {
    match value {
        "NaN" => f64::NAN,
        "Infinity" => f64::INFINITY,
        "-Infinity" => f64::NEG_INFINITY,
        _ => value.parse().expect("fixture numeric field"),
    }
}

#[test]
fn shared_vectors_match_chargeable_late_minute_behavior() {
    let mut case_count = 0;

    for (line_number, line) in FIXTURES.lines().enumerate().skip(1) {
        if line.trim().is_empty() {
            continue;
        }

        let columns: Vec<_> = line.split(',').collect();
        assert_eq!(columns.len(), 4, "malformed fixture line {line_number}");

        let case_name = columns[0];
        let raw_late_minutes = parse_number(columns[1]);
        let arrival_grace_minutes = parse_number(columns[2]);
        let expected = parse_number(columns[3]);
        let actual = calculate_chargeable_late_minutes(raw_late_minutes, arrival_grace_minutes);

        if expected.is_nan() {
            assert!(actual.is_nan(), "{case_name}: expected NaN, got {actual}");
        } else {
            assert_eq!(actual, expected, "{case_name}");
        }
        case_count += 1;
    }

    assert!(
        case_count > 0,
        "the shared parity fixture must not be empty"
    );
}
