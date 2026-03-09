#[derive(Debug, Clone)]
pub struct Config {
    pub font_size:  f32,
    pub shell:      String,
    pub padding:    u32,
    pub colors:     Colors,
}

#[derive(Debug, Clone)]
pub struct Colors {
    pub bg:     Rgb,
    pub fg:     Rgb,
    pub cursor: Rgb,
    pub ansi:   [Rgb; 16],
}

#[derive(Debug, Clone, Copy)]
pub struct Rgb(pub u8, pub u8, pub u8);

impl Rgb {
    pub const fn hex(c: u32) -> Self {
        Rgb(((c >> 16) & 0xFF) as u8, ((c >> 8) & 0xFF) as u8, (c & 0xFF) as u8)
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            font_size: 14.5,
            shell: std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into()),
            padding: 10,
            colors: Colors::neon(),
        }
    }
}

impl Colors {
    pub fn neon() -> Self {
        Self {
            bg:     Rgb(12, 12, 20),
            fg:     Rgb(226, 232, 255),
            cursor: Rgb(0, 255, 217),
            ansi: [
                Rgb::hex(0x0F0F1A), Rgb::hex(0xFF3D5C), Rgb::hex(0x00FF88), Rgb::hex(0xFFD700),
                Rgb::hex(0x3399FF), Rgb::hex(0xD94FFF), Rgb::hex(0x00E5FF), Rgb::hex(0xCCD6FF),
                Rgb::hex(0x3D3D5C), Rgb::hex(0xFF6680), Rgb::hex(0x33FFAA), Rgb::hex(0xFFE033),
                Rgb::hex(0x66BBFF), Rgb::hex(0xE580FF), Rgb::hex(0x33EEFF), Rgb::hex(0xFFFFFF),
            ],
        }
    }
}
