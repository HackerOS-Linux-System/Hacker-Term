use pyo3::prelude::*;

fn main() -> PyResult<()> {
    let code = include_str!("../terminal/main.py");
    Python::with_gil(|py| {
        py.run_bound(code, None, None)
    })
}
