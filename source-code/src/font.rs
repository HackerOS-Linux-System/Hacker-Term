use fontdue::{Font, FontSettings};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct Glyph {
    pub ax: u32, pub ay: u32,
    pub w:  u32, pub h:  u32,
    pub bx: i32, pub by: i32,
    pub advance: u32,
}

pub struct Atlas {
    pub font:     Font,
    pub size:     f32,
    pub cell_w:   u32,
    pub cell_h:   u32,
    pub baseline: u32,
    pub tex_w:    u32,
    pub tex_h:    u32,
    pub pixels:   Vec<u8>,
    cache:        HashMap<char, Glyph>,
    cx: u32, cy: u32, row_h: u32,
}

impl Atlas {
    pub fn new(font_data: &[u8], size: f32) -> Self {
        let font = Font::from_bytes(font_data, FontSettings::default())
        .expect("Failed to parse font");

        let (m, _) = font.rasterize('M', size);
        let cell_w = (m.advance_width.ceil() as u32).max(1);

        let (ascent, descent, gap) = font.horizontal_line_metrics(size)
        .map(|l| (l.ascent, l.descent.abs(), l.line_gap))
        .unwrap_or((size * 0.78, size * 0.22, size * 0.1));

        let cell_h   = (ascent + descent + gap).ceil() as u32 + 2;
        let baseline = ascent.ceil() as u32 + 1;

        let mut atlas = Self {
            font, size,
            cell_w, cell_h, baseline,
            tex_w: 2048, tex_h: 2048,
            pixels: vec![0u8; 2048 * 2048],
            cache: HashMap::new(),
            cx: 1, cy: 1, row_h: 0,
        };

        // Pre-warm printable ASCII
        for c in ' '..='~' { atlas.get(c); }
        // Box drawing + block elements (używane przez neofetch, btop, itd.)
        for c in '\u{2500}'..='\u{257F}' { atlas.get(c); }
        for c in '\u{2580}'..='\u{259F}' { atlas.get(c); }
        // Braille (używane przez btop)
        for c in '\u{2800}'..='\u{28FF}' { atlas.get(c); }

        atlas
    }

    pub fn get(&mut self, c: char) -> Glyph {
        if let Some(g) = self.cache.get(&c) { return g.clone(); }

        let (m, bmp) = self.font.rasterize(c, self.size);

        if m.width == 0 || m.height == 0 {
            let g = Glyph { ax: 0, ay: 0, w: 0, h: 0, bx: 0, by: 0, advance: m.advance_width as u32 };
            self.cache.insert(c, g.clone());
            return g;
        }

        let (w, h) = (m.width as u32, m.height as u32);

        if self.cx + w + 1 > self.tex_w {
            self.cy  += self.row_h + 1;
            self.cx   = 1;
            self.row_h = 0;
        }
        if h > self.row_h { self.row_h = h; }

        for row in 0..h {
            for col in 0..w {
                let idx = ((self.cy + row) * self.tex_w + self.cx + col) as usize;
                let bi  = (row * w + col) as usize;
                if idx < self.pixels.len() && bi < bmp.len() {
                    self.pixels[idx] = bmp[bi];
                }
            }
        }

        let g = Glyph {
            ax: self.cx, ay: self.cy,
            w, h,
            bx: m.xmin, by: m.ymin,
            advance: m.advance_width as u32,
        };
        self.cx += w + 1;
        self.cache.insert(c, g.clone());
        g
    }
}

/// Szuka czcionki: najpierw w custom_path, potem system paths, potem fc-list.
pub fn find_font_with_path(custom_path: &str) -> Vec<u8> {
    if !custom_path.is_empty() {
        match std::fs::read(custom_path) {
            Ok(d) => { log::info!("Font (custom): {}", custom_path); return d; }
            Err(_) => log::warn!("Custom font '{}' not found, auto-detecting.", custom_path),
        }
    }
    find_font()
}

pub fn find_font() -> Vec<u8> {
    let candidates = [
        // JetBrains Mono (świetna dla programistów)
        "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf",
        "/usr/share/fonts/JetBrainsMono/JetBrainsMono-Regular.ttf",
        "/usr/share/fonts/OTF/JetBrainsMono-Regular.otf",
        // Hack (popularna w środowiskach haker/sec)
        "/usr/share/fonts/truetype/hack/Hack-Regular.ttf",
        "/usr/share/fonts/TTF/Hack-Regular.ttf",
        "/usr/share/fonts/hack/Hack-Regular.ttf",
        // FiraCode
        "/usr/share/fonts/truetype/firacode/FiraCode-Regular.ttf",
        "/usr/share/fonts/OTF/FiraCode-Regular.otf",
        "/usr/share/fonts/fira-code/FiraCode-Regular.ttf",
        // Cascadia Code (Windows-style ale dostępna na Linux)
        "/usr/share/fonts/truetype/cascadia-code/CascadiaCode.ttf",
        "/usr/share/fonts/TTF/CascadiaCode.ttf",
        // Iosevka
        "/usr/share/fonts/truetype/iosevka/Iosevka-Regular.ttf",
        "/usr/share/fonts/OTF/Iosevka-Regular.otf",
        // DejaVu (wszechobecna)
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
        "/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf",
        // Liberation
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
        "/usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf",
        // Ubuntu Mono
        "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
        // Noto
        "/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf",
        "/usr/share/fonts/google-noto/NotoSansMono-Regular.ttf",
        // Source Code Pro
        "/usr/share/fonts/OTF/SourceCodePro-Regular.otf",
        "/usr/share/fonts/truetype/SourceCodePro/SourceCodePro-Regular.ttf",
    ];

    for p in &candidates {
        if let Ok(d) = std::fs::read(p) {
            log::info!("Font: {}", p);
            return d;
        }
    }

    // fc-list fallback
    if let Ok(out) = std::process::Command::new("fc-list")
        .args([":spacing=mono:style=Regular", "--format=%{file}\n"])
        .output()
        {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let p = line.trim();
                if p.ends_with(".ttf") || p.ends_with(".otf") {
                    if let Ok(d) = std::fs::read(p) {
                        log::info!("Font (fc-list): {}", p);
                        return d;
                    }
                }
            }
        }

        eprintln!("ERROR: Nie znaleziono czcionki monospace.");
        eprintln!("Zainstaluj: sudo dnf install jetbrains-mono-fonts  lub  sudo apt install fonts-jetbrains-mono");
        std::process::exit(1);
}
