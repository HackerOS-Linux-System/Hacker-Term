use hk_parser::{HkConfig, HkValue, load_hk_file, resolve_interpolations};
use indexmap::IndexMap;
use std::env;
use anyhow::{Result, Context};

#[derive(Debug, Clone)]
pub struct Config {
    pub general: GeneralConfig,
    pub colors: ColorsConfig,
    pub keybindings: KeybindingsConfig,
    pub sixel: SixelConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            general: GeneralConfig::default(),
            colors: ColorsConfig::default(),
            keybindings: KeybindingsConfig::default(),
            sixel: SixelConfig::default(),
        }
    }
}

impl Config {
    pub fn load() -> Result<Self> {
        let config_path = dirs::home_dir()
        .expect("Could not find home directory")
        .join(".config/hacker-term/config.hk");

        let mut raw = if config_path.exists() {
            load_hk_file(&config_path)
            .context("Failed to parse config.hk")?
        } else {
            Self::default_hk_config()
        };

        resolve_interpolations(&mut raw)
        .context("Failed to resolve interpolations")?;

        Self::from_hk(&raw)
    }

    fn default_hk_config() -> HkConfig {
        let mut config = HkConfig::new();

        // Sekcja general
        let mut general = IndexMap::new();
        general.insert("font_size".into(), HkValue::Number(14.5));
        general.insert("shell".into(), HkValue::String(env::var("SHELL").unwrap_or("/bin/zsh".into())));
        general.insert("padding".into(), HkValue::Number(10.0));
        general.insert("window_transparency".into(), HkValue::Number(255.0));
        general.insert("motion_blur_strength".into(), HkValue::Number(0.7));
        general.insert("throttle_keyboard_ms".into(), HkValue::Number(10.0));
        config.insert("general".into(), HkValue::Map(general));

        // Sekcja colors
        let mut colors = IndexMap::new();
        colors.insert("bg".into(), HkValue::String("#0F0F1A".into()));
        colors.insert("fg".into(), HkValue::String("#E2E8FF".into()));
        colors.insert("cursor".into(), HkValue::String("#00FFD9".into()));

        let ansi = vec![
            "#0F0F1A", "#FF3D5C", "#00FF88", "#FFD700",
            "#3399FF", "#D94FFF", "#00E5FF", "#CCD6FF",
            "#3D3D5C", "#FF6680", "#33FFAA", "#FFE033",
            "#66BBFF", "#E580FF", "#33EEFF", "#FFFFFF",
        ].into_iter().map(|s| HkValue::String(s.to_string())).collect();
        colors.insert("ansi".into(), HkValue::Array(ansi));
        config.insert("colors".into(), HkValue::Map(colors));

        // Sekcja keybindings
        let mut keybindings = IndexMap::new();
        keybindings.insert("scroll_up".into(), HkValue::Array(vec![
            HkValue::String("Ctrl+Up".into()),
                                                              HkValue::String("Shift+Up".into()),
        ]));
        keybindings.insert("scroll_down".into(), HkValue::Array(vec![
            HkValue::String("Ctrl+Down".into()),
                                                                HkValue::String("Shift+Down".into()),
        ]));
        keybindings.insert("new_tab".into(), HkValue::Array(vec![HkValue::String("Ctrl+t".into())]));
        keybindings.insert("close_tab".into(), HkValue::Array(vec![HkValue::String("Ctrl+w".into())]));
        keybindings.insert("copy".into(), HkValue::Array(vec![HkValue::String("Ctrl+Shift+c".into())]));
        keybindings.insert("paste".into(), HkValue::Array(vec![HkValue::String("Ctrl+Shift+v".into())]));
        config.insert("keybindings".into(), HkValue::Map(keybindings));

        // Sekcja sixel
        let mut sixel = IndexMap::new();
        sixel.insert("enabled".into(), HkValue::Bool(true));
        sixel.insert("max_width".into(), HkValue::Number(800.0));
        sixel.insert("max_height".into(), HkValue::Number(600.0));
        config.insert("sixel".into(), HkValue::Map(sixel));

        config
    }

    fn from_hk(raw: &HkConfig) -> Result<Self> {
        let general = raw.get("general")
        .and_then(|v| v.as_map().ok())
        .map(|m| GeneralConfig::from_hk(m))
        .unwrap_or_else(GeneralConfig::default);

        let colors = raw.get("colors")
        .and_then(|v| v.as_map().ok())
        .map(|m| ColorsConfig::from_hk(m))
        .unwrap_or_else(ColorsConfig::default);

        let keybindings = raw.get("keybindings")
        .and_then(|v| v.as_map().ok())
        .map(|m| KeybindingsConfig::from_hk(m))
        .unwrap_or_else(KeybindingsConfig::default);

        let sixel = raw.get("sixel")
        .and_then(|v| v.as_map().ok())
        .map(|m| SixelConfig::from_hk(m))
        .unwrap_or_else(SixelConfig::default);

        Ok(Config { general, colors, keybindings, sixel })
    }
}

#[derive(Debug, Clone)]
pub struct GeneralConfig {
    pub font_size: f32,
    pub shell: String,
    pub padding: u32,
    pub window_transparency: u8,
    pub motion_blur_strength: f32,
    pub throttle_keyboard_ms: u64,
}

impl GeneralConfig {
    fn from_hk(map: &IndexMap<String, HkValue>) -> Self {
        let font_size = map.get("font_size")
        .and_then(|v| v.as_number().ok())
        .map(|n| n as f32)
        .unwrap_or(14.5);
        let shell = map.get("shell")
        .and_then(|v| v.as_string().ok())
        .unwrap_or_else(|| std::env::var("SHELL").unwrap_or("/bin/zsh".into()));
        let padding = map.get("padding")
        .and_then(|v| v.as_number().ok())
        .map(|n| n as u32)
        .unwrap_or(10);
        let window_transparency = map.get("window_transparency")
        .and_then(|v| v.as_number().ok())
        .map(|n| n as u8)
        .unwrap_or(255);
        let motion_blur_strength = map.get("motion_blur_strength")
        .and_then(|v| v.as_number().ok())
        .map(|n| n as f32)
        .unwrap_or(0.7);
        let throttle_keyboard_ms = map.get("throttle_keyboard_ms")
        .and_then(|v| v.as_number().ok())
        .map(|n| n as u64)
        .unwrap_or(10);

        Self { font_size, shell, padding, window_transparency, motion_blur_strength, throttle_keyboard_ms }
    }
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            font_size: 14.5,
            shell: std::env::var("SHELL").unwrap_or("/bin/zsh".into()),
            padding: 10,
            window_transparency: 255,
            motion_blur_strength: 0.7,
            throttle_keyboard_ms: 10,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ColorsConfig {
    pub bg: Rgb,
    pub fg: Rgb,
    pub cursor: Rgb,
    pub ansi: [Rgb; 16],
}

impl ColorsConfig {
    fn from_hk(map: &IndexMap<String, HkValue>) -> Self {
        let bg = map.get("bg")
        .and_then(|v| v.as_string().ok())
        .and_then(|s| parse_color(&s))
        .unwrap_or(Rgb::hex(0x0F0F1A));
        let fg = map.get("fg")
        .and_then(|v| v.as_string().ok())
        .and_then(|s| parse_color(&s))
        .unwrap_or(Rgb::hex(0xE2E8FF));
        let cursor = map.get("cursor")
        .and_then(|v| v.as_string().ok())
        .and_then(|s| parse_color(&s))
        .unwrap_or(Rgb::hex(0x00FFD9));

        let mut ansi = Self::default().ansi;
        if let Some(HkValue::Array(arr)) = map.get("ansi") {
            for (i, val) in arr.iter().enumerate() {
                if i < 16 {
                    if let Ok(s) = val.as_string() {
                        if let Some(rgb) = parse_color(&s) {
                            ansi[i] = rgb;
                        }
                    }
                }
            }
        }
        Self { bg, fg, cursor, ansi }
    }
}

impl Default for ColorsConfig {
    fn default() -> Self {
        Self {
            bg: Rgb::hex(0x0F0F1A),
            fg: Rgb::hex(0xE2E8FF),
            cursor: Rgb::hex(0x00FFD9),
            ansi: [
                Rgb::hex(0x0F0F1A), Rgb::hex(0xFF3D5C), Rgb::hex(0x00FF88), Rgb::hex(0xFFD700),
                Rgb::hex(0x3399FF), Rgb::hex(0xD94FFF), Rgb::hex(0x00E5FF), Rgb::hex(0xCCD6FF),
                Rgb::hex(0x3D3D5C), Rgb::hex(0xFF6680), Rgb::hex(0x33FFAA), Rgb::hex(0xFFE033),
                Rgb::hex(0x66BBFF), Rgb::hex(0xE580FF), Rgb::hex(0x33EEFF), Rgb::hex(0xFFFFFF),
            ],
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Rgb(pub u8, pub u8, pub u8);

impl Rgb {
    pub fn hex(c: u32) -> Self {
        Rgb(((c >> 16) & 0xFF) as u8, ((c >> 8) & 0xFF) as u8, (c & 0xFF) as u8)
    }
}

fn parse_color(s: &str) -> Option<Rgb> {
    let s = s.trim_start_matches('#');
    if s.len() == 6 {
        let r = u8::from_str_radix(&s[0..2], 16).ok()?;
        let g = u8::from_str_radix(&s[2..4], 16).ok()?;
        let b = u8::from_str_radix(&s[4..6], 16).ok()?;
        Some(Rgb(r,g,b))
    } else {
        None
    }
}

#[derive(Debug, Clone)]
pub struct KeybindingsConfig {
    pub scroll_up: Vec<String>,
    pub scroll_down: Vec<String>,
    pub new_tab: Vec<String>,
    pub close_tab: Vec<String>,
    pub copy: Vec<String>,
    pub paste: Vec<String>,
}

impl KeybindingsConfig {
    fn from_hk(map: &IndexMap<String, HkValue>) -> Self {
        let scroll_up = get_string_list(map.get("scroll_up"));
        let scroll_down = get_string_list(map.get("scroll_down"));
        let new_tab = get_string_list(map.get("new_tab"));
        let close_tab = get_string_list(map.get("close_tab"));
        let copy = get_string_list(map.get("copy"));
        let paste = get_string_list(map.get("paste"));

        Self { scroll_up, scroll_down, new_tab, close_tab, copy, paste }
    }
}

impl Default for KeybindingsConfig {
    fn default() -> Self {
        Self {
            scroll_up: vec!["Ctrl+Up".into(), "Shift+Up".into()],
            scroll_down: vec!["Ctrl+Down".into(), "Shift+Down".into()],
            new_tab: vec!["Ctrl+t".into()],
            close_tab: vec!["Ctrl+w".into()],
            copy: vec!["Ctrl+Shift+c".into()],
            paste: vec!["Ctrl+Shift+v".into()],
        }
    }
}

fn get_string_list(val: Option<&HkValue>) -> Vec<String> {
    match val {
        Some(HkValue::Array(arr)) => arr.iter()
        .filter_map(|v| v.as_string().ok())
        .collect(),
        Some(HkValue::String(s)) => vec![s.clone()],
        _ => vec![],
    }
}

#[derive(Debug, Clone)]
pub struct SixelConfig {
    pub enabled: bool,
    pub max_width: u32,
    pub max_height: u32,
}

impl SixelConfig {
    fn from_hk(map: &IndexMap<String, HkValue>) -> Self {
        let enabled = map.get("enabled")
        .and_then(|v| v.as_bool().ok())
        .unwrap_or(true);
        let max_width = map.get("max_width")
        .and_then(|v| v.as_number().ok())
        .map(|n| n as u32)
        .unwrap_or(800);
        let max_height = map.get("max_height")
        .and_then(|v| v.as_number().ok())
        .map(|n| n as u32)
        .unwrap_or(600);
        Self { enabled, max_width, max_height }
    }
}

impl Default for SixelConfig {
    fn default() -> Self {
        Self { enabled: true, max_width: 800, max_height: 600 }
    }
}
