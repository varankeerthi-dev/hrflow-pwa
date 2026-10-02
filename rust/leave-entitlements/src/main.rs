use serde_json::Value;
use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut input) {
        eprintln!("failed to read fixture input: {error}");
        std::process::exit(2);
    }
    let cases: Vec<Value> = match serde_json::from_str(&input) {
        Ok(cases) => cases,
        Err(error) => {
            eprintln!("invalid fixture JSON: {error}");
            std::process::exit(2);
        }
    };
    let mut results = Vec::with_capacity(cases.len());
    for (index, case) in cases.iter().enumerate() {
        match hrflow_leave_entitlements::evaluate_case(case) {
            Ok(value) => results.push(value),
            Err(error) => {
                eprintln!("fixture case {} failed: {error}", index + 1);
                std::process::exit(1);
            }
        }
    }
    match serde_json::to_string(&results) {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("failed to serialize Rust results: {error}");
            std::process::exit(2);
        }
    }
}
