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

        let cell_h = (ascent + descent + gap).ceil() as u32 + 2;
        let baseline = ascent.ceil() as u32 + 1;

        let tex_w = 2048u32;
        let tex_h = 2048u32;

        let mut atlas = Self {
            font, size,
            cell_w, cell_h, baseline,
            tex_w, tex_h,
            pixels: vec![0u8; (tex_w * tex_h) as usize],
            cache: HashMap::new(),
            cx: 1, cy: 1, row_h: 0,
        };

        for c in ' '..='~' { atlas.get(c); }
        atlas
    }

    pub fn get(&mut self, c: char) -> Glyph {
        if let Some(g) = self.cache.get(&c) { return g.clone(); }
        let (m, bmp) = self.font.rasterize(c, self.size);

        if m.width == 0 || m.height == 0 {
            let g = Glyph { ax:0,ay:0,w:0,h:0,bx:0,by:0,advance:m.advance_width as u32 };
            self.cache.insert(c, g.clone()); return g;
        }

        let (w, h) = (m.width as u32, m.height as u32);
        if self.cx + w + 1 > self.tex_w { self.cy += self.row_h + 1; self.cx = 1; self.row_h = 0; }
        if h > self.row_h { self.row_h = h; }

        for row in 0..h {
            for col in 0..w {
                let idx = ((self.cy+row)*self.tex_w + self.cx+col) as usize;
                let bi  = (row*w+col) as usize;
                if idx < self.pixels.len() && bi < bmp.len() { self.pixels[idx] = bmp[bi]; }
            }
        }

        let g = Glyph { ax:self.cx, ay:self.cy, w, h, bx:m.xmin, by:m.ymin, advance:m.advance_width as u32 };
        self.cx += w + 1;
        self.cache.insert(c, g.clone());
        g
    }
}

pub fn find_font() -> Vec<u8> {
    let candidates = [
        "/usr/share/fonts/truetype/hack/Hack-Regular.ttf",
        "/usr/share/fonts/TTF/Hack-Regular.ttf",
        "/usr/share/fonts/truetype/firacode/FiraCode-Regular.ttf",
        "/usr/share/fonts/OTF/FiraCode-Regular.otf",
        "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
        "/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
        "/usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf",
        "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf",
    ];

    for p in &candidates {
        if let Ok(d) = std::fs::read(p) { log::info!("Font: {}", p); return d; }
    }

    if let Ok(out) = std::process::Command::new("fc-list")
        .args([":spacing=mono:style=Regular", "--format=%{file}\n"]).output()
        {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let p = line.trim();
                if p.ends_with(".ttf") || p.ends_with(".otf") {
                    if let Ok(d) = std::fs::read(p) { return d; }
                }
            }
        }

        eprintln!("ERROR: No monospace font found. Install: sudo apt install fonts-dejavu-core");
        std::process::exit(1);
}
