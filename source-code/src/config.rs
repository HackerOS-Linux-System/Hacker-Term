use hk_parser::{HkConfig, HkValue, load_hk_file, resolve_interpolations};
use indexmap::IndexMap;
use std::env;
use anyhow::{Result, Context};

#[derive(Debug, Clone)]
pub struct Config {
    pub general:     GeneralConfig,
    pub colors:      ColorsConfig,
    pub effects:     EffectsConfig,
    pub keybindings: KeybindingsConfig,
    pub sixel:       SixelConfig,
    pub font:        FontConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            general:     GeneralConfig::default(),
            colors:      ColorsConfig::default(),
            effects:     EffectsConfig::default(),
            keybindings: KeybindingsConfig::default(),
            sixel:       SixelConfig::default(),
            font:        FontConfig::default(),
        }
    }
}

impl Config {
    pub fn load() -> Result<Self> {
        let config_path = dirs::home_dir()
        .expect("Could not find home directory")
        .join(".config/hacker-term/config.hk");

        let mut raw = if config_path.exists() {
            load_hk_file(&config_path).context("Failed to parse config.hk")?
        } else {
            Self::default_hk_config()
        };

        resolve_interpolations(&mut raw).context("Failed to resolve interpolations")?;
        Self::from_hk(&raw)
    }

    pub fn default_hk_config() -> HkConfig {
        let mut cfg = HkConfig::new();

        // ── general ──────────────────────────────────────────────────────────
        let mut g = IndexMap::new();
        g.insert("font_size".into(),             HkValue::Number(14.0));
        g.insert("shell".into(),                 HkValue::String(env::var("SHELL").unwrap_or("/bin/zsh".into())));
        g.insert("padding".into(),               HkValue::Number(10.0));
        g.insert("window_transparency".into(),   HkValue::Number(220.0));  // półprzezroczyste domyślnie
        g.insert("motion_blur_strength".into(),  HkValue::Number(0.12));
        g.insert("throttle_keyboard_ms".into(),  HkValue::Number(8.0));
        g.insert("scrollback_lines".into(),      HkValue::Number(10000.0));
        cfg.insert("general".into(), HkValue::Map(g));

        // ── colors: ciemny granat jak Contour ────────────────────────────────
        let mut c = IndexMap::new();
        c.insert("bg".into(),               HkValue::String("#0d0d20".into()));
        c.insert("fg".into(),               HkValue::String("#c8d0f0".into()));
        c.insert("cursor".into(),           HkValue::String("#7788ff".into()));
        c.insert("glow1".into(),            HkValue::String("#3344aa".into())); // niebieski lewa-góra
        c.insert("glow2".into(),            HkValue::String("#441166".into())); // fioletowy prawa-dół
        c.insert("selection".into(),        HkValue::String("#4455cc".into()));
        c.insert("selection_alpha".into(),  HkValue::Number(80.0));
        let ansi = vec![
            // normalne 0-7
            "#0d0d20", "#ff5555", "#55ff55", "#ffff55",
            "#7788ff", "#ff55ff", "#55ffff", "#c8d0f0",
            // jasne 8-15
            "#383858", "#ff8888", "#88ff88", "#ffff88",
            "#aabbff", "#ff88ff", "#88ffff", "#ffffff",
        ].into_iter().map(|s| HkValue::String(s.to_string())).collect();
        c.insert("ansi".into(), HkValue::Array(ansi));
        cfg.insert("colors".into(), HkValue::Map(c));

        // ── effects ──────────────────────────────────────────────────────────
        let mut e = IndexMap::new();
        e.insert("scanlines".into(),            HkValue::Bool(true));
        e.insert("scanline_opacity".into(),     HkValue::Number(20.0));
        e.insert("border_glow".into(),          HkValue::Bool(false));  // wyłączone domyślnie – czystszy wygląd
        e.insert("border_glow_strength".into(), HkValue::Number(60.0));
        e.insert("vignette".into(),             HkValue::Bool(true));
        e.insert("vignette_strength".into(),    HkValue::Number(120.0));
        e.insert("bg_animation_speed".into(),   HkValue::Number(0.0));   // statyczne tło – jak Contour
        e.insert("bg_glow_intensity".into(),    HkValue::Number(35.0));
        e.insert("glow_pulse_freq".into(),      HkValue::Number(0.5));
        e.insert("cursor_style".into(),         HkValue::String("block".into()));
        e.insert("cursor_blink_freq".into(),    HkValue::Number(0.7));
        e.insert("cursor_lerp_speed".into(),    HkValue::Number(0.3));
        cfg.insert("effects".into(), HkValue::Map(e));

        // ── font ─────────────────────────────────────────────────────────────
        let mut f = IndexMap::new();
        f.insert("path".into(),      HkValue::String("".into()));
        f.insert("size".into(),      HkValue::Number(14.0));
        f.insert("bold_size".into(), HkValue::Number(14.0));
        f.insert("italic".into(),    HkValue::Bool(true));
        cfg.insert("font".into(), HkValue::Map(f));

        // ── keybindings ──────────────────────────────────────────────────────
        let mut kb = IndexMap::new();
        kb.insert("scroll_up".into(),        HkValue::Array(vec![HkValue::String("Ctrl+Up".into()), HkValue::String("Shift+Up".into())]));
        kb.insert("scroll_down".into(),      HkValue::Array(vec![HkValue::String("Ctrl+Down".into()), HkValue::String("Shift+Down".into())]));
        kb.insert("scroll_page_up".into(),   HkValue::Array(vec![HkValue::String("Shift+PageUp".into())]));
        kb.insert("scroll_page_down".into(), HkValue::Array(vec![HkValue::String("Shift+PageDown".into())]));
        kb.insert("scroll_to_top".into(),    HkValue::Array(vec![HkValue::String("Shift+Home".into())]));
        kb.insert("scroll_to_bottom".into(), HkValue::Array(vec![HkValue::String("Shift+End".into())]));
        kb.insert("new_tab".into(),          HkValue::Array(vec![HkValue::String("Ctrl+t".into())]));
        kb.insert("close_tab".into(),        HkValue::Array(vec![HkValue::String("Ctrl+w".into())]));
        kb.insert("next_tab".into(),         HkValue::Array(vec![HkValue::String("Ctrl+Tab".into())]));
        kb.insert("prev_tab".into(),         HkValue::Array(vec![HkValue::String("Ctrl+Shift+Tab".into())]));
        kb.insert("copy".into(),             HkValue::Array(vec![HkValue::String("Ctrl+Shift+c".into())]));
        kb.insert("paste".into(),            HkValue::Array(vec![HkValue::String("Ctrl+Shift+v".into())]));
        kb.insert("zoom_in".into(),          HkValue::Array(vec![HkValue::String("Ctrl++".into())]));
        kb.insert("zoom_out".into(),         HkValue::Array(vec![HkValue::String("Ctrl+-".into())]));
        kb.insert("zoom_reset".into(),       HkValue::Array(vec![HkValue::String("Ctrl+0".into())]));
        cfg.insert("keybindings".into(), HkValue::Map(kb));

        // ── sixel ────────────────────────────────────────────────────────────
        let mut s = IndexMap::new();
        s.insert("enabled".into(),    HkValue::Bool(true));
        s.insert("max_width".into(),  HkValue::Number(1920.0));
        s.insert("max_height".into(), HkValue::Number(1080.0));
        cfg.insert("sixel".into(), HkValue::Map(s));

        cfg
    }

    fn from_hk(raw: &HkConfig) -> Result<Self> {
        let general     = raw.get("general").and_then(|v| v.as_map().ok()).map(GeneralConfig::from_hk).unwrap_or_default();
        let colors      = raw.get("colors").and_then(|v| v.as_map().ok()).map(ColorsConfig::from_hk).unwrap_or_default();
        let effects     = raw.get("effects").and_then(|v| v.as_map().ok()).map(EffectsConfig::from_hk).unwrap_or_default();
        let keybindings = raw.get("keybindings").and_then(|v| v.as_map().ok()).map(KeybindingsConfig::from_hk).unwrap_or_default();
        let sixel       = raw.get("sixel").and_then(|v| v.as_map().ok()).map(SixelConfig::from_hk).unwrap_or_default();
        let font        = raw.get("font").and_then(|v| v.as_map().ok()).map(FontConfig::from_hk).unwrap_or_default();
        Ok(Config { general, colors, effects, keybindings, sixel, font })
    }
}

// ── GeneralConfig ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct GeneralConfig {
    pub font_size:            f32,
    pub shell:                String,
    pub padding:              u32,
    pub window_transparency:  u8,
    pub motion_blur_strength: f32,
    pub throttle_keyboard_ms: u64,
    pub scrollback_lines:     usize,
}

impl GeneralConfig {
    fn from_hk(m: &IndexMap<String, HkValue>) -> Self {
        Self {
            font_size:            get_f32(m, "font_size", 14.0),
            shell:                get_str(m, "shell", &env::var("SHELL").unwrap_or("/bin/zsh".into())),
            padding:              get_f32(m, "padding", 10.0) as u32,
            window_transparency:  get_f32(m, "window_transparency", 220.0) as u8,
            motion_blur_strength: get_f32(m, "motion_blur_strength", 0.12),
            throttle_keyboard_ms: get_f32(m, "throttle_keyboard_ms", 8.0) as u64,
            scrollback_lines:     get_f32(m, "scrollback_lines", 10000.0) as usize,
        }
    }
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            font_size: 14.0,
            shell: env::var("SHELL").unwrap_or("/bin/zsh".into()),
            padding: 10,
            window_transparency: 220,
            motion_blur_strength: 0.12,
            throttle_keyboard_ms: 8,
            scrollback_lines: 10000,
        }
    }
}

// ── EffectsConfig ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct EffectsConfig {
    pub scanlines:            bool,
    pub scanline_opacity:     u8,
    pub border_glow:          bool,
    pub border_glow_strength: u8,
    pub vignette:             bool,
    pub vignette_strength:    u8,
    pub bg_animation_speed:   f32,
    pub bg_glow_intensity:    f32,
    pub glow_pulse_freq:      f32,
    pub cursor_style:         String,
    pub cursor_blink_freq:    f32,
    pub cursor_lerp_speed:    f32,
}

impl EffectsConfig {
    fn from_hk(m: &IndexMap<String, HkValue>) -> Self {
        Self {
            scanlines:            get_bool(m, "scanlines", true),
            scanline_opacity:     get_f32(m, "scanline_opacity", 20.0) as u8,
            border_glow:          get_bool(m, "border_glow", false),
            border_glow_strength: get_f32(m, "border_glow_strength", 60.0) as u8,
            vignette:             get_bool(m, "vignette", true),
            vignette_strength:    get_f32(m, "vignette_strength", 120.0) as u8,
            bg_animation_speed:   get_f32(m, "bg_animation_speed", 0.0),
            bg_glow_intensity:    get_f32(m, "bg_glow_intensity", 35.0),
            glow_pulse_freq:      get_f32(m, "glow_pulse_freq", 0.5),
            cursor_style:         get_str(m, "cursor_style", "block"),
            cursor_blink_freq:    get_f32(m, "cursor_blink_freq", 0.7),
            cursor_lerp_speed:    get_f32(m, "cursor_lerp_speed", 0.3),
        }
    }
}

impl Default for EffectsConfig {
    fn default() -> Self {
        Self {
            scanlines: true, scanline_opacity: 20,
            border_glow: false, border_glow_strength: 60,
            vignette: true, vignette_strength: 120,
            bg_animation_speed: 0.0, bg_glow_intensity: 35.0,
            glow_pulse_freq: 0.5,
            cursor_style: "block".into(), cursor_blink_freq: 0.7, cursor_lerp_speed: 0.3,
        }
    }
}

// ── FontConfig ────────────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct FontConfig {
    pub path:      String,
    pub size:      f32,
    pub bold_size: f32,
    pub italic:    bool,
}

impl FontConfig {
    fn from_hk(m: &IndexMap<String, HkValue>) -> Self {
        Self {
            path:      get_str(m, "path", ""),
            size:      get_f32(m, "size", 14.0),
            bold_size: get_f32(m, "bold_size", 14.0),
            italic:    get_bool(m, "italic", true),
        }
    }
}

impl Default for FontConfig {
    fn default() -> Self {
        Self { path: String::new(), size: 14.0, bold_size: 14.0, italic: true }
    }
}

// ── ColorsConfig ──────────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct ColorsConfig {
    pub bg:              Rgb,
    pub fg:              Rgb,
    pub cursor:          Rgb,
    pub glow1:           Rgb,
    pub glow2:           Rgb,
    pub selection:       Rgb,
    pub selection_alpha: u8,
    pub ansi:            [Rgb; 16],
}

impl ColorsConfig {
    fn from_hk(m: &IndexMap<String, HkValue>) -> Self {
        let mut d = Self::default();
        if let Some(c) = get_color(m, "bg")         { d.bg         = c; }
        if let Some(c) = get_color(m, "fg")         { d.fg         = c; }
        if let Some(c) = get_color(m, "cursor")     { d.cursor     = c; }
        if let Some(c) = get_color(m, "glow1")      { d.glow1      = c; }
        if let Some(c) = get_color(m, "glow2")      { d.glow2      = c; }
        if let Some(c) = get_color(m, "selection")  { d.selection  = c; }
        d.selection_alpha = get_f32(m, "selection_alpha", 80.0) as u8;
        if let Some(HkValue::Array(arr)) = m.get("ansi") {
            for (i, v) in arr.iter().enumerate() {
                if i < 16 {
                    if let Ok(s) = v.as_string() {
                        if let Some(rgb) = parse_color(&s) { d.ansi[i] = rgb; }
                    }
                }
            }
        }
        d
    }
}

impl Default for ColorsConfig {
    fn default() -> Self {
        Self {
            bg:              Rgb::hex(0x0d0d20),
            fg:              Rgb::hex(0xc8d0f0),
            cursor:          Rgb::hex(0x7788ff),
            glow1:           Rgb::hex(0x3344aa),
            glow2:           Rgb::hex(0x441166),
            selection:       Rgb::hex(0x4455cc),
            selection_alpha: 80,
            ansi: [
                Rgb::hex(0x0d0d20), Rgb::hex(0xff5555), Rgb::hex(0x55ff55), Rgb::hex(0xffff55),
                Rgb::hex(0x7788ff), Rgb::hex(0xff55ff), Rgb::hex(0x55ffff), Rgb::hex(0xc8d0f0),
                Rgb::hex(0x383858), Rgb::hex(0xff8888), Rgb::hex(0x88ff88), Rgb::hex(0xffff88),
                Rgb::hex(0xaabbff), Rgb::hex(0xff88ff), Rgb::hex(0x88ffff), Rgb::hex(0xffffff),
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

pub fn parse_color(s: &str) -> Option<Rgb> {
    let s = s.trim_start_matches('#');
    if s.len() == 6 {
        Some(Rgb(
            u8::from_str_radix(&s[0..2], 16).ok()?,
                 u8::from_str_radix(&s[2..4], 16).ok()?,
                 u8::from_str_radix(&s[4..6], 16).ok()?,
        ))
    } else { None }
}

// ── KeybindingsConfig ─────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct KeybindingsConfig {
    pub scroll_up:         Vec<String>,
    pub scroll_down:       Vec<String>,
    pub scroll_page_up:    Vec<String>,
    pub scroll_page_down:  Vec<String>,
    pub scroll_to_top:     Vec<String>,
    pub scroll_to_bottom:  Vec<String>,
    pub new_tab:           Vec<String>,
    pub close_tab:         Vec<String>,
    pub next_tab:          Vec<String>,
    pub prev_tab:          Vec<String>,
    pub copy:              Vec<String>,
    pub paste:             Vec<String>,
    pub zoom_in:           Vec<String>,
    pub zoom_out:          Vec<String>,
    pub zoom_reset:        Vec<String>,
}

impl KeybindingsConfig {
    fn from_hk(m: &IndexMap<String, HkValue>) -> Self {
        Self {
            scroll_up:        get_list(m, "scroll_up"),
            scroll_down:      get_list(m, "scroll_down"),
            scroll_page_up:   get_list(m, "scroll_page_up"),
            scroll_page_down: get_list(m, "scroll_page_down"),
            scroll_to_top:    get_list(m, "scroll_to_top"),
            scroll_to_bottom: get_list(m, "scroll_to_bottom"),
            new_tab:          get_list(m, "new_tab"),
            close_tab:        get_list(m, "close_tab"),
            next_tab:         get_list(m, "next_tab"),
            prev_tab:         get_list(m, "prev_tab"),
            copy:             get_list(m, "copy"),
            paste:            get_list(m, "paste"),
            zoom_in:          get_list(m, "zoom_in"),
            zoom_out:         get_list(m, "zoom_out"),
            zoom_reset:       get_list(m, "zoom_reset"),
        }
    }
}

impl Default for KeybindingsConfig {
    fn default() -> Self {
        Self {
            scroll_up:        vec!["Ctrl+Up".into(), "Shift+Up".into()],
            scroll_down:      vec!["Ctrl+Down".into(), "Shift+Down".into()],
            scroll_page_up:   vec!["Shift+PageUp".into()],
            scroll_page_down: vec!["Shift+PageDown".into()],
            scroll_to_top:    vec!["Shift+Home".into()],
            scroll_to_bottom: vec!["Shift+End".into()],
            new_tab:          vec!["Ctrl+t".into()],
            close_tab:        vec!["Ctrl+w".into()],
            next_tab:         vec!["Ctrl+Tab".into()],
            prev_tab:         vec!["Ctrl+Shift+Tab".into()],
            copy:             vec!["Ctrl+Shift+c".into()],
            paste:            vec!["Ctrl+Shift+v".into()],
            zoom_in:          vec!["Ctrl++".into()],
            zoom_out:         vec!["Ctrl+-".into()],
            zoom_reset:       vec!["Ctrl+0".into()],
        }
    }
}

// ── SixelConfig ───────────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct SixelConfig {
    pub enabled:    bool,
    pub max_width:  u32,
    pub max_height: u32,
}

impl SixelConfig {
    fn from_hk(m: &IndexMap<String, HkValue>) -> Self {
        Self {
            enabled:    get_bool(m, "enabled", true),
            max_width:  get_f32(m, "max_width", 1920.0) as u32,
            max_height: get_f32(m, "max_height", 1080.0) as u32,
        }
    }
}

impl Default for SixelConfig {
    fn default() -> Self { Self { enabled: true, max_width: 1920, max_height: 1080 } }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
fn get_f32(m: &IndexMap<String, HkValue>, k: &str, def: f32) -> f32 {
    m.get(k).and_then(|v| v.as_number().ok()).map(|n| n as f32).unwrap_or(def)
}

fn get_str(m: &IndexMap<String, HkValue>, k: &str, def: &str) -> String {
    m.get(k).and_then(|v| v.as_string().ok()).unwrap_or_else(|| def.to_string())
}

fn get_bool(m: &IndexMap<String, HkValue>, k: &str, def: bool) -> bool {
    m.get(k).and_then(|v| v.as_bool().ok()).unwrap_or(def)
}

fn get_color(m: &IndexMap<String, HkValue>, k: &str) -> Option<Rgb> {
    m.get(k).and_then(|v| v.as_string().ok()).and_then(|s| parse_color(&s))
}

fn get_list(m: &IndexMap<String, HkValue>, k: &str) -> Vec<String> {
    match m.get(k) {
        Some(HkValue::Array(a)) => a.iter().filter_map(|v| v.as_string().ok()).collect(),
        Some(HkValue::String(s)) => vec![s.clone()],
        _ => vec![],
    }
}
