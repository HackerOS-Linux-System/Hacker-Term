use pyo3::prelude::*;
use std::fs::read_to_string;
use std::path::Path;

fn main() -> PyResult<()> {
    let script_path = Path::new("terminal/main.py");
    let code = read_to_string(script_path).expect("Failed to read main.py");

    Python::with_gil(|py| {
        py.run_bound(&code, None, None)
    })
}
