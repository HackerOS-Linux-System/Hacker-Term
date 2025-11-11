use gtk::{CssProvider, gdk::Display, STYLE_PROVIDER_PRIORITY_APPLICATION};
use std::fs::{self, create_dir_all};
use serde::Deserialize;
use toml;
#[derive(Deserialize, Debug, Default)]
pub struct Config {
    pub background_opacity: Option<f32>,
    pub background_color: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<u32>,
    pub text_color: Option<String>,
    pub cursor_color: Option<String>,
    pub header_background_color: Option<String>,
    pub tab_background_color: Option<String>,
    pub button_background_color: Option<String>,
    pub particle_color: Option<String>,
    pub particle_count: Option<u32>,
    pub particle_life_min: Option<u32>,
    pub particle_life_max: Option<u32>,
    pub particle_size_min: Option<f32>,
    pub particle_size_max: Option<f32>,
    // Add more configurable fields as needed
}
fn hex_to_rgba(hex: &str, alpha: f32) -> String {
    let hex = hex.trim_start_matches('#');
    let (r, g, b) = if hex.len() == 6 {
        (
            u8::from_str_radix(&hex[0..2], 16).unwrap_or(0),
            u8::from_str_radix(&hex[2..4], 16).unwrap_or(0),
            u8::from_str_radix(&hex[4..6], 16).unwrap_or(0),
        )
    } else if hex.len() == 3 {
        (
            u8::from_str_radix(&hex[0..1], 16).unwrap_or(0) * 17,
            u8::from_str_radix(&hex[1..2], 16).unwrap_or(0) * 17,
            u8::from_str_radix(&hex[2..3], 16).unwrap_or(0) * 17,
        )
    } else {
        (0, 0, 0)
    };
    format!("rgba({},{},{},{})", r, g, b, alpha)
}
pub fn load_config() -> Config {
    let mut config_path = dirs::home_dir().unwrap_or_default();
    config_path.push(".hackeros");
    config_path.push("hacker-term");
    let _ = create_dir_all(&config_path); // Create directories if not exist
    config_path.push("config.toml");
    if let Ok(config_str) = fs::read_to_string(config_path) {
        toml::from_str(&config_str).unwrap_or_default()
    } else {
        Config::default()
    }
}
pub fn apply_styles() {
    let config = load_config();
    let background_opacity = config.background_opacity.unwrap_or(0.8);
    let background_color = config.background_color.unwrap_or_else(|| "#1e1e2e".to_string()); // Nicer default: dark purple-gray
    let font_family = config.font_family.unwrap_or_else(|| "'JetBrains Mono', monospace".to_string());
    let font_size = config.font_size.unwrap_or(13);
    let text_color = config.text_color.unwrap_or_else(|| "#cdd6f4".to_string()); // Nicer light color
    let cursor_color = config.cursor_color.unwrap_or_else(|| "#f5e0dc".to_string()); // Soft pink
    let header_background_color = config.header_background_color.unwrap_or_else(|| "#313244".to_string());
    let tab_background_color = config.tab_background_color.unwrap_or_else(|| "#45475a".to_string());
    let button_background_color = config.button_background_color.unwrap_or_else(|| "#6c7086".to_string());
    let window_bg = hex_to_rgba(&background_color, background_opacity);
    let header_bg = hex_to_rgba(&header_background_color, background_opacity);
    let tab_bg = hex_to_rgba(&tab_background_color, background_opacity);
    let terminal_bg = hex_to_rgba(&background_color, background_opacity);
    let button_bg = hex_to_rgba(&button_background_color, 0.8);
    let css = format!(r#"
        /* Global window styling */
        window {{
            background-color: {}; /* Configurable nicer background with opacity */
            border-radius: 12px; /* Rounded corners for modern look */
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); /* Subtle shadow */
        }}
        /* Header bar styling */
        headerbar {{
            background-color: {};
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: none;
            padding: 4px;
        }}
        /* Notebook and tabs */
        notebook {{
            background-color: transparent;
            border: none;
        }}
        notebook tab {{
            background-color: {};
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 8px 8px 0 0;
            padding: 6px 12px;
            margin: 2px;
            transition: background-color 0.2s ease;
        }}
        notebook tab:hover {{
            background-color: rgba(60, 60, 60, 0.9);
        }}
        notebook tab:checked {{
            background-color: rgba(80, 80, 80, 0.95);
            border-bottom: none;
        }}
        /* Scrolled window */
        scrolledwindow {{
            background-color: transparent;
            border: none;
        }}
        /* VTE Terminal styling */
        vte-terminal {{
            background-color: {}; /* Nicer configurable background for terminal */
            color: {}; /* Configurable text color */
            font-family: {}; /* Configurable font family */
            font-size: {}pt; /* Configurable font size */
            padding: 10px;
            border-radius: 8px;
            -vte-cursor-color: {}; /* Configurable cursor color */
        }}
        /* Buttons */
        button {{
            background-color: {};
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 4px 8px;
            transition: background-color 0.2s ease;
        }}
        button:hover {{
            background-color: rgba(70, 70, 70, 0.9);
        }}
        /* Close button in tabs */
        button.flat {{
            background: none;
            border: none;
            color: #ff5555; /* Red for close */
        }}
        button.flat:hover {{
            color: #ff7777;
        }}
        /* Overlay for webview */
        overlay {{
            background-color: transparent;
        }}
    "#, window_bg, header_bg, tab_bg, terminal_bg, text_color, font_family, font_size, cursor_color, button_bg);
    let provider = CssProvider::new();
    provider.load_from_data(&css);
    gtk::style_context_add_provider_for_display(
        &Display::default().expect("No GDK Display"),
        &provider,
        STYLE_PROVIDER_PRIORITY_APPLICATION,
    );
}
