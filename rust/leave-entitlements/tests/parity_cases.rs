use hrflow_leave_entitlements::evaluate_case;
use serde_json::Value;

const FIXTURES: &str = include_str!("../fixtures/parity-cases.json");

#[test]
fn shared_javascript_reference_fixtures_match_typed_rust_domain_results() {
    let cases: Vec<Value> = serde_json::from_str(FIXTURES).expect("valid shared fixtures");
    assert_eq!(
        cases.len(),
        27,
        "fixture set should cover the scoped domain contract"
    );

    for case in cases {
        let name = case["name"].as_str().expect("fixture has a case name");
        let expected = &case["expected"];
        let actual = evaluate_case(&case).unwrap_or_else(|error| panic!("{name}: {error}"));
        assert_eq!(&actual, expected, "{name}");
    }
}
