use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

// ──────────────────────────────────────────────
// Value type
// ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum HkValue {
    Bool(bool),
    Number(f64),
    Str(String),
    Array(Vec<HkValue>),
    Map(HashMap<String, HkValue>),
}

impl HkValue {
    pub fn as_str(&self) -> Option<&str> {
        if let HkValue::Str(s) = self {
            Some(s.as_str())
        } else {
            None
        }
    }
    pub fn as_f64(&self) -> Option<f64> {
        if let HkValue::Number(n) = self {
            Some(*n)
        } else {
            None
        }
    }
    pub fn as_bool(&self) -> Option<bool> {
        if let HkValue::Bool(b) = self {
            Some(*b)
        } else {
            None
        }
    }
}

pub type HkSection = HashMap<String, HkValue>;
pub type HkConfig = HashMap<String, HkSection>;

// ──────────────────────────────────────────────
// Parser
// ──────────────────────────────────────────────

fn parse_value(raw: &str) -> HkValue {
    let raw = raw.trim();

    // Bool
    if raw.eq_ignore_ascii_case("true") {
        return HkValue::Bool(true);
    }
    if raw.eq_ignore_ascii_case("false") {
        return HkValue::Bool(false);
    }

    // Number
    if let Ok(n) = raw.parse::<f64>() {
        return HkValue::Number(n);
    }

    // Array
    if raw.starts_with('[') && raw.ends_with(']') {
        let inner = &raw[1..raw.len() - 1];
        let items: Vec<HkValue> = inner
            .split(',')
            .map(|s| {
                let s = s.trim();
                if s.starts_with('"') && s.ends_with('"') {
                    HkValue::Str(s[1..s.len() - 1].to_string())
                } else {
                    parse_value(s)
                }
            })
            .filter(|v| !matches!(v, HkValue::Str(s) if s.is_empty()))
            .collect();
        return HkValue::Array(items);
    }

    // Quoted string
    if raw.starts_with('"') && raw.ends_with('"') {
        return HkValue::Str(raw[1..raw.len() - 1].replace("\\n", "\n").replace("\\t", "\t"));
    }

    // Unquoted string
    HkValue::Str(raw.to_string())
}

pub fn parse_hk(input: &str) -> HkConfig {
    let mut config: HkConfig = HashMap::new();
    let mut current_section: Option<String> = None;
    // Track current L1 map key for L2 nesting
    let mut current_l1_map: Option<String> = None;

    for line in input.lines() {
        let trimmed = line.trim();

        // Skip empty lines and comments
        if trimmed.is_empty() || trimmed.starts_with('!') {
            continue;
        }

        // Section header [name]
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let name = trimmed[1..trimmed.len() - 1].trim().to_string();
            current_section = Some(name.clone());
            current_l1_map = None;
            config.entry(name).or_insert_with(HashMap::new);
            continue;
        }

        let Some(ref sec) = current_section else {
            continue;
        };

        // L2 key: --> key => value
        if trimmed.starts_with("--> ") {
            let rest = &trimmed[4..];
            if let Some((k, v)) = rest.split_once("=>") {
                let key = k.trim().to_string();
                let val = parse_value(v.trim());
                if let Some(ref l1) = current_l1_map {
                    let section = config.get_mut(sec).unwrap();
                    if let Some(HkValue::Map(map)) = section.get_mut(l1) {
                        map.insert(key, val);
                    } else {
                        let mut m = HashMap::new();
                        m.insert(key, val);
                        section.insert(l1.clone(), HkValue::Map(m));
                    }
                }
            }
            continue;
        }

        // L1 key: -> key => value  OR  -> key  (map declaration)
        if trimmed.starts_with("-> ") {
            let rest = &trimmed[3..];
            if let Some((k, v)) = rest.split_once("=>") {
                let key = k.trim().to_string();
                // Dotted key: -> a.b => val
                if key.contains('.') {
                    let parts: Vec<&str> = key.splitn(2, '.').collect();
                    let parent = parts[0].to_string();
                    let child = parts[1].to_string();
                    let val = parse_value(v.trim());
                    let section = config.get_mut(sec).unwrap();
                    if let Some(HkValue::Map(map)) = section.get_mut(&parent) {
                        map.insert(child, val);
                    } else {
                        let mut m = HashMap::new();
                        m.insert(child, val);
                        section.insert(parent, HkValue::Map(m));
                    }
                } else {
                    let val = parse_value(v.trim());
                    config.get_mut(sec).unwrap().insert(key, val);
                    current_l1_map = None;
                }
            } else {
                // Map declaration without value
                let key = rest.trim().to_string();
                current_l1_map = Some(key.clone());
                let section = config.get_mut(sec).unwrap();
                section.entry(key).or_insert_with(|| HkValue::Map(HashMap::new()));
            }
        }
    }

    config
}

// ──────────────────────────────────────────────
// Serializer
// ──────────────────────────────────────────────

fn serialize_value(val: &HkValue) -> String {
    match val {
        HkValue::Bool(b) => b.to_string(),
        HkValue::Number(n) => {
            if n.fract() == 0.0 {
                format!("{}", *n as i64)
            } else {
                format!("{}", n)
            }
        }
        HkValue::Str(s) => {
            if s.contains(' ') || s.is_empty() {
                format!("\"{}\"", s)
            } else {
                s.clone()
            }
        }
        HkValue::Array(arr) => {
            let items: Vec<String> = arr.iter().map(serialize_value).collect();
            format!("[{}]", items.join(", "))
        }
        HkValue::Map(_) => String::new(), // handled separately
    }
}

pub fn serialize_hk(config: &HkConfig) -> String {
    let mut out = String::new();
    // Deterministic section order
    let mut sections: Vec<&String> = config.keys().collect();
    sections.sort();

    for sec in sections {
        out.push_str(&format!("[{}]\n", sec));
        let section = &config[sec];
        let mut keys: Vec<&String> = section.keys().collect();
        keys.sort();
        for key in keys {
            let val = &section[key];
            match val {
                HkValue::Map(map) => {
                    out.push_str(&format!("-> {}\n", key));
                    let mut mk: Vec<&String> = map.keys().collect();
                    mk.sort();
                    for mk in mk {
                        out.push_str(&format!("--> {} => {}\n", mk, serialize_value(&map[mk])));
                    }
                }
                _ => {
                    out.push_str(&format!("-> {} => {}\n", key, serialize_value(val)));
                }
            }
        }
        out.push('\n');
    }
    out
}

// ──────────────────────────────────────────────
// File I/O
// ──────────────────────────────────────────────

pub fn config_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    home.join(".config/HackerOS/Hacker-Term/config.hk")
}

pub fn load_config_file() -> HkConfig {
    let path = config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        parse_hk(&content)
    } else {
        default_config()
    }
}

pub fn save_config_file(config: &HkConfig) -> std::io::Result<()> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let content = serialize_hk(config);
    fs::write(&path, content)
}

// ──────────────────────────────────────────────
// Default config (written as .hk on first run)
// ──────────────────────────────────────────────

pub fn default_config() -> HkConfig {
    let mut config: HkConfig = HashMap::new();

    // [appearance]
    let mut appearance: HkSection = HashMap::new();
    appearance.insert("theme".to_string(),      HkValue::Str("Hacker (Default)".to_string()));
    appearance.insert("opacity".to_string(),    HkValue::Number(0.97));
    appearance.insert("blur".to_string(),       HkValue::Number(16.0));
    appearance.insert("language".to_string(),   HkValue::Str("en".to_string()));
    config.insert("appearance".to_string(), appearance);

    // [terminal]
    let mut terminal: HkSection = HashMap::new();
    terminal.insert("font_size".to_string(),    HkValue::Number(14.0));
    terminal.insert("font_family".to_string(),  HkValue::Str("Fira Code".to_string()));
    terminal.insert("padding".to_string(),      HkValue::Number(20.0));
    terminal.insert("cursor_style".to_string(), HkValue::Str("block".to_string()));
    terminal.insert("cursor_blink".to_string(), HkValue::Bool(true));
    terminal.insert("shell".to_string(),        HkValue::Str("zsh".to_string()));
    config.insert("terminal".to_string(), terminal);

    config
}

/// Ensure config file exists on disk; write defaults if not.
pub fn ensure_config_exists() {
    let path = config_path();
    if !path.exists() {
        let _ = save_config_file(&default_config());
    }
}
