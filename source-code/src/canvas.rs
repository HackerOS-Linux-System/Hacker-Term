use std::collections::HashSet;
use std::collections::VecDeque;
use std::time::Instant;

use slint::{SharedPixelBuffer, Rgba8Pixel};

use crate::config::{Config, Rgb};
use crate::font::Atlas;
use crate::terminal::{Terminal, Color, CellFlags, Selection};

// ── Pixel helpers ─────────────────────────────────────────────────────────────
#[inline]
fn argb(a: u8, r: u8, g: u8, b: u8) -> u32 {
    ((a as u32) << 24) | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32)
}

#[inline]
fn unpack(c: u32) -> (u8, u8, u8, u8) {
    (
        ((c >> 16) & 0xFF) as u8,
     ((c >> 8)  & 0xFF) as u8,
     (c         & 0xFF) as u8,
     ((c >> 24) & 0xFF) as u8,
    )
}

#[inline]
fn blend_over(dst: u32, src: u32, src_a: u8) -> u32 {
    if src_a == 255 { return src; }
    if src_a == 0   { return dst; }
    let a  = src_a as u32;
    let ia = 255 - a;
    let (sr, sg, sb, _)  = unpack(src);
    let (dr, dg, db, da) = unpack(dst);
    let r  = (sr as u32 * a + dr as u32 * ia) / 255;
    let g  = (sg as u32 * a + dg as u32 * ia) / 255;
    let b  = (sb as u32 * a + db as u32 * ia) / 255;
    let oa = (a + da as u32 * ia / 255).min(255);
    argb(oa as u8, r as u8, g as u8, b as u8)
}

#[inline]
fn smooth_pulse(t: f32, freq: f32, lo: f32, hi: f32) -> f32 {
    let s = (t * freq * std::f32::consts::TAU).sin() * 0.5 + 0.5;
    // ease
    let e = s * s * (3.0 - 2.0 * s);
    lo + e * (hi - lo)
}

#[inline]
fn blit_glyph(
    buf: &mut [u8],
    bw: u32, bh: u32,
    atlas: &[u8], aw: u32,
    gx: i32, gy: i32,
    gw: u32, gh: u32,
    ax: u32, ay: u32,
    color: u32,
) {
    for row in 0..gh as i32 {
        let py = gy + row;
        if py < 0 || py >= bh as i32 { continue; }
        for col in 0..gw as i32 {
            let px = gx + col;
            if px < 0 || px >= bw as i32 { continue; }
            let ai    = ((ay as i32 + row) * aw as i32 + ax as i32 + col) as usize;
            let alpha = *atlas.get(ai).unwrap_or(&0);
            if alpha == 0 { continue; }
            let bi  = (py as u32 * bw + px as u32) as usize * 4;
            let dst = (buf[bi] as u32) << 16
            | (buf[bi+1] as u32) << 8
            | (buf[bi+2] as u32)
            | (buf[bi+3] as u32) << 24;
            let blended = blend_over(dst, color, alpha);
            let (r, g, b, a) = unpack(blended);
            buf[bi]   = r; buf[bi+1] = g;
            buf[bi+2] = b; buf[bi+3] = a;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
pub struct Canvas {
    pub cfg:   Config,
    pub atlas: Atlas,
    start:     Instant,
    prev_pixels: Vec<u8>,
    prev_grid:   (u16, u16),
    changed_cells: HashSet<(u16, u16)>,
    motion_buf:    VecDeque<Vec<u8>>,
    frame:         u64,
    cur_rx: f32,   // smooth cursor x
    cur_ry: f32,   // smooth cursor y
}

impl Canvas {
    pub fn new(cfg: Config, atlas: Atlas) -> Self {
        Self {
            cfg, atlas,
            start: Instant::now(),
            prev_pixels: Vec::new(),
            prev_grid: (0, 0),
            changed_cells: HashSet::new(),
            motion_buf: VecDeque::with_capacity(4),
            frame: 0,
            cur_rx: 0.0,
            cur_ry: 0.0,
        }
    }

    pub fn grid_size(&self, px_w: u32, px_h: u32) -> (u16, u16) {
        let p    = self.cfg.general.padding;
        let cols = ((px_w.saturating_sub(p * 2)) / self.atlas.cell_w).max(4) as u16;
        let rows = ((px_h.saturating_sub(p * 2)) / self.atlas.cell_h).max(2) as u16;
        (cols, rows)
    }

    pub fn render(
        &mut self,
        term: &Terminal,
        px_w: u32,
        px_h: u32,
    ) -> SharedPixelBuffer<Rgba8Pixel> {
        self.frame += 1;
        let t = self.start.elapsed().as_secs_f32();

        // Smooth cursor lerp
        let lerp = self.cfg.effects.cursor_lerp_speed.clamp(0.05, 1.0);
        self.cur_rx += (term.cx as f32 - self.cur_rx) * lerp;
        self.cur_ry += (term.cy as f32 - self.cur_ry) * lerp;

        let (cols, rows) = self.grid_size(px_w, px_h);
        let grid_changed = (cols, rows) != self.prev_grid;

        let mut buf = SharedPixelBuffer::<Rgba8Pixel>::new(px_w, px_h);
        let raw = buf.make_mut_bytes();

        // 1. Tło
        self.draw_bg(raw, px_w, px_h, t);

        // 2. CRT scanlines (przed komórkami, bardzo subtelne)
        if self.cfg.effects.scanlines {
            self.draw_scanlines(raw, px_w, px_h);
        }

        // 3. Komórki (differential)
        if !grid_changed && !self.prev_pixels.is_empty() && !self.changed_cells.is_empty() {
            raw.copy_from_slice(&self.prev_pixels);
            let changed = self.changed_cells.clone();
            for (x, y) in changed {
                if x < cols && y < rows {
                    self.draw_cell(raw, px_w, px_h, term, x, y, t);
                }
            }
        } else {
            self.draw_all_cells(raw, px_w, px_h, term, t);
        }

        // 4. Motion blur
        let mb = self.cfg.general.motion_blur_strength;
        if mb > 0.0 {
            if let Some(prev) = self.motion_buf.front() {
                let alpha = (mb * 200.0) as u32;
                let ia    = 255 - alpha;
                for i in (0..raw.len()).step_by(4) {
                    if i + 3 >= prev.len() { break; }
                    raw[i]   = ((raw[i]   as u32 * ia + prev[i]   as u32 * alpha) / 255) as u8;
                    raw[i+1] = ((raw[i+1] as u32 * ia + prev[i+1] as u32 * alpha) / 255) as u8;
                    raw[i+2] = ((raw[i+2] as u32 * ia + prev[i+2] as u32 * alpha) / 255) as u8;
                    raw[i+3] = ((raw[i+3] as u32 * ia + prev[i+3] as u32 * alpha) / 255) as u8;
                }
            }
        }

        // 5. Zaznaczenie
        self.draw_selection(raw, px_w, px_h, term);

        // 6. Sixel
        for img in &term.sixel_images {
            self.draw_sixel(raw, px_w, px_h, img);
        }

        // 7. Winieta
        if self.cfg.effects.vignette {
            self.draw_vignette(raw, px_w, px_h);
        }

        // Update state
        self.prev_pixels = raw.to_vec();
        self.prev_grid   = (cols, rows);
        self.changed_cells.clear();

        self.motion_buf.push_front(raw.to_vec());
        while self.motion_buf.len() > 3 { self.motion_buf.pop_back(); }

        buf
    }

    // ── Tło: ciemny granat/fiolet jak Contour, bez nachalnych blobów ─────────
    fn draw_bg(&self, raw: &mut [u8], w: u32, h: u32, _t: f32) {
        let Rgb(bgr, bgg, bgb) = self.cfg.colors.bg;
        let transparency = self.cfg.general.window_transparency;

        for y in 0..h {
            let fy = y as f32 / h as f32;
            for x in 0..w {
                let fx = x as f32 / w as f32;

                // Bardzo subtelny gradient góra-dół
                let grad = 1.0 - fy * 0.18;

                // Subtelna poświata lewa-góra (niebieska)
                let dx1  = fx * 0.9;
                let dy1  = fy * 0.9;
                let d1   = (dx1 * dx1 + dy1 * dy1).sqrt();
                let g1   = (1.0 - (d1 * 1.6).min(1.0)).powf(3.0)
                * self.cfg.effects.bg_glow_intensity / 255.0 * 0.8;

                // Subtelna poświata prawa-dół (fioletowa)
                let dx2  = 1.0 - fx;
                let dy2  = 1.0 - fy;
                let d2   = (dx2 * dx2 + dy2 * dy2).sqrt();
                let g2   = (1.0 - (d2 * 1.8).min(1.0)).powf(3.0)
                * self.cfg.effects.bg_glow_intensity / 255.0 * 0.5;

                let Rgb(g1r, g1g, g1b) = self.cfg.colors.glow1;
                let Rgb(g2r, g2g, g2b) = self.cfg.colors.glow2;

                let off = (y * w + x) as usize * 4;
                raw[off]   = ((bgr as f32 * grad + g1r as f32 * g1 + g2r as f32 * g2).min(255.0)) as u8;
                raw[off+1] = ((bgg as f32 * grad + g1g as f32 * g1 + g2g as f32 * g2).min(255.0)) as u8;
                raw[off+2] = ((bgb as f32 * grad + g1b as f32 * g1 + g2b as f32 * g2).min(255.0)) as u8;
                raw[off+3] = transparency;
            }
        }
    }

    // ── CRT scanlines: co 2 piksele, bardzo subtelne ─────────────────────────
    fn draw_scanlines(&self, raw: &mut [u8], w: u32, h: u32) {
        let op = self.cfg.effects.scanline_opacity as u32;
        if op == 0 { return; }
        for y in (0..h).step_by(2) {
            for x in 0..w {
                let off = (y * w + x) as usize * 4;
                raw[off]   = (raw[off]   as u32 * (256 - op) / 256) as u8;
                raw[off+1] = (raw[off+1] as u32 * (256 - op) / 256) as u8;
                raw[off+2] = (raw[off+2] as u32 * (256 - op) / 256) as u8;
            }
        }
    }

    // ── Winieta ───────────────────────────────────────────────────────────────
    fn draw_vignette(&self, raw: &mut [u8], w: u32, h: u32) {
        let s = self.cfg.effects.vignette_strength as f32 / 255.0;
        for y in 0..h {
            let fy = (y as f32 / h as f32 - 0.5) * 2.0;
            for x in 0..w {
                let fx = (x as f32 / w as f32 - 0.5) * 2.0;
                let d  = (fx * fx + fy * fy).sqrt() / std::f32::consts::SQRT_2;
                let f  = 1.0 - (d * s).min(1.0);
                let off = (y * w + x) as usize * 4;
                raw[off]   = (raw[off]   as f32 * f) as u8;
                raw[off+1] = (raw[off+1] as f32 * f) as u8;
                raw[off+2] = (raw[off+2] as f32 * f) as u8;
            }
        }
    }

    fn draw_all_cells(&mut self, raw: &mut [u8], w: u32, h: u32, term: &Terminal, t: f32) {
        let lines = term.visible_lines();
        let cols  = term.cols as usize;
        for (row, _) in lines.iter().enumerate() {
            for col in 0..cols {
                self.draw_cell(raw, w, h, term, col as u16, row as u16, t);
            }
        }
    }

    fn draw_cell(
        &mut self,
        raw: &mut [u8],
        w: u32, h: u32,
        term: &Terminal,
        col: u16, row: u16,
        t: f32,
    ) {
        let lines = term.visible_lines();
        if row as usize >= lines.len() { return; }
        let line = lines[row as usize];
        if col as usize >= line.len() { return; }
        let cell = &line[col as usize];

        let pad  = self.cfg.general.padding;
        let cw   = self.atlas.cell_w;
        let ch   = self.atlas.cell_h;
        let px_x = (pad + col as u32 * cw) as i32;
        let px_y = (pad + row as u32 * ch) as i32;

        // Tło komórki
        if cell.bg != Color::Default {
            let (r, g, b) = self.resolve_color(&cell.bg, false);
            for dy in 0..ch as i32 {
                let by = px_y + dy;
                if by < 0 || by >= h as i32 { continue; }
                for dx in 0..cw as i32 {
                    let bx = px_x + dx;
                    if bx < 0 || bx >= w as i32 { continue; }
                    let off = (by as u32 * w + bx as u32) as usize * 4;
                    raw[off] = r; raw[off+1] = g; raw[off+2] = b;
                }
            }
        }

        // Kursor
        let is_cursor = col == term.cx && row == term.cy
        && term.cursor_visible && term.scroll_off == 0;
        if is_cursor {
            self.draw_cursor(raw, w, h, px_x, px_y, cw, ch, t);
        }

        // Podkreślenie
        if cell.flags.contains(CellFlags::UNDERLINE) {
            let (r, g, b) = self.resolve_color(&cell.fg, true);
            let uy = px_y + ch as i32 - 2;
            if uy >= 0 && uy < h as i32 {
                for dx in 0..cw as i32 {
                    let bx = px_x + dx;
                    if bx < 0 || bx >= w as i32 { continue; }
                    let off = (uy as u32 * w + bx as u32) as usize * 4;
                    raw[off] = r; raw[off+1] = g; raw[off+2] = b;
                }
            }
        }

        // Glyph
        if cell.ch == ' ' || cell.ch == '\0' { return; }
        if cell.flags.contains(CellFlags::INVISIBLE) { return; }

        let glyph = self.atlas.get(cell.ch);
        if glyph.w == 0 { return; }

        let (mut r, mut g, mut b) = self.resolve_color(&cell.fg, true);
        if cell.flags.contains(CellFlags::DIM) {
            r /= 2; g /= 2; b /= 2;
        }
        if cell.flags.contains(CellFlags::BOLD) {
            r = (r as u32 * 5 / 4).min(255) as u8;
            g = (g as u32 * 5 / 4).min(255) as u8;
            b = (b as u32 * 5 / 4).min(255) as u8;
        }

        let gx = px_x + glyph.bx;
        let gy = px_y + self.atlas.baseline as i32 - (glyph.h as i32 + glyph.by);

        blit_glyph(
            raw, w, h,
            &self.atlas.pixels, self.atlas.tex_w,
            gx, gy, glyph.w, glyph.h, glyph.ax, glyph.ay,
            argb(255, r, g, b),
        );
    }

    // ── Kursor: block z poświatą, beam lub underline ──────────────────────────
    fn draw_cursor(
        &self, raw: &mut [u8], w: u32, h: u32,
        px_x: i32, px_y: i32, cw: u32, ch: u32, t: f32,
    ) {
        let Rgb(cr, cg, cb) = self.cfg.colors.cursor;
        let color  = argb(255, cr, cg, cb);
        let pulse  = smooth_pulse(t, self.cfg.effects.cursor_blink_freq, 0.45, 1.0);
        let alpha  = (pulse * 255.0) as u8;

        match self.cfg.effects.cursor_style.as_str() {
            "beam" => {
                for dy in 0..ch as i32 {
                    let by = px_y + dy;
                    if by < 0 || by >= h as i32 { continue; }
                    for dx in 0..2i32 {
                        let bx = px_x + dx;
                        if bx < 0 || bx >= w as i32 { continue; }
                        let a   = if dx == 0 { alpha } else { alpha / 3 };
                        let off = (by as u32 * w + bx as u32) as usize * 4;
                        let dst = (raw[off] as u32) << 16 | (raw[off+1] as u32) << 8
                        | raw[off+2] as u32 | (raw[off+3] as u32) << 24;
                        let bl  = blend_over(dst, color, a);
                        let (r, g, b, al) = unpack(bl);
                        raw[off]=r; raw[off+1]=g; raw[off+2]=b; raw[off+3]=al;
                    }
                }
            }
            "underline" => {
                for dy in (ch as i32 - 3)..ch as i32 {
                    let by = px_y + dy;
                    if by < 0 || by >= h as i32 { continue; }
                    for dx in 0..cw as i32 {
                        let bx = px_x + dx;
                        if bx < 0 || bx >= w as i32 { continue; }
                        let a   = if dy == ch as i32 - 1 { alpha } else { alpha / 4 };
                        let off = (by as u32 * w + bx as u32) as usize * 4;
                        let dst = (raw[off] as u32) << 16 | (raw[off+1] as u32) << 8
                        | raw[off+2] as u32 | (raw[off+3] as u32) << 24;
                        let bl  = blend_over(dst, color, a);
                        let (r, g, b, al) = unpack(bl);
                        raw[off]=r; raw[off+1]=g; raw[off+2]=b; raw[off+3]=al;
                    }
                }
            }
            _ => {
                // block (domyślny)
                for dy in 0..ch as i32 {
                    let by = px_y + dy;
                    if by < 0 || by >= h as i32 { continue; }
                    for dx in 0..cw as i32 {
                        let bx = px_x + dx;
                        if bx < 0 || bx >= w as i32 { continue; }
                        // Tylko ramka + dolna belka
                        let is_bottom  = dy >= ch as i32 - 2;
                        let is_edge    = dx == 0 || dx == cw as i32 - 1 || dy == 0;
                        let a = if is_bottom { alpha }
                        else if is_edge { alpha / 4 }
                        else { alpha / 14 };
                        let off = (by as u32 * w + bx as u32) as usize * 4;
                        let dst = (raw[off] as u32) << 16 | (raw[off+1] as u32) << 8
                        | raw[off+2] as u32 | (raw[off+3] as u32) << 24;
                        let bl  = blend_over(dst, color, a);
                        let (r, g, b, al) = unpack(bl);
                        raw[off]=r; raw[off+1]=g; raw[off+2]=b; raw[off+3]=al;
                    }
                }
                // Poświata pod kursorem
                let gy = px_y + ch as i32 - 1;
                for spread in -1i32..=2 {
                    let by = gy + spread;
                    if by < 0 || by >= h as i32 { continue; }
                    let ga = match spread {
                        0  => alpha,
                        1  => alpha / 3,
                        -1 => alpha / 5,
                        _  => alpha / 10,
                    };
                    for dx in -1..cw as i32 + 1 {
                        let bx = px_x + dx;
                        if bx < 0 || bx >= w as i32 { continue; }
                        let a2  = if dx < 0 || dx >= cw as i32 { ga / 3 } else { ga };
                        let off = (by as u32 * w + bx as u32) as usize * 4;
                        let dst = (raw[off] as u32) << 16 | (raw[off+1] as u32) << 8
                        | raw[off+2] as u32 | (raw[off+3] as u32) << 24;
                        let bl  = blend_over(dst, color, a2);
                        let (r, g, b, al) = unpack(bl);
                        raw[off]=r; raw[off+1]=g; raw[off+2]=b; raw[off+3]=al;
                    }
                }
            }
        }
    }

    // ── Zaznaczenie ───────────────────────────────────────────────────────────
    fn draw_selection(&self, raw: &mut [u8], w: u32, h: u32, term: &Terminal) {
        let Rgb(sr, sg, sb) = self.cfg.colors.selection;
        let sa              = self.cfg.colors.selection_alpha;
        let sel_color       = argb(sa, sr, sg, sb);

        match &term.selection {
            Selection::Rectangular { start_x, start_y, end_x, end_y } => {
                let x1  = *start_x.min(end_x);
                let x2  = *start_x.max(end_x);
                let y1  = *start_y.min(end_y);
                let y2  = *start_y.max(end_y);
                let pad = self.cfg.general.padding;
                let cw  = self.atlas.cell_w;
                let ch  = self.atlas.cell_h;
                for y in y1..=y2 {
                    let py = pad + y as u32 * ch;
                    if py + ch > h { continue; }
                    for x in x1..=x2 {
                        let px = pad + x as u32 * cw;
                        if px + cw > w { continue; }
                        for dy in 0..ch {
                            let by = py + dy;
                            for dx in 0..cw {
                                let bx  = px + dx;
                                let off = (by * w + bx) as usize * 4;
                                let dst = (raw[off] as u32) << 16
                                | (raw[off+1] as u32) << 8
                                | raw[off+2] as u32
                                | (raw[off+3] as u32) << 24;
                                let bl  = blend_over(dst, sel_color, sa);
                                let (r, g, b, a) = unpack(bl);
                                raw[off]=r; raw[off+1]=g; raw[off+2]=b; raw[off+3]=a;
                            }
                        }
                    }
                }
            }
            Selection::None => {}
        }
    }

    // ── Sixel ─────────────────────────────────────────────────────────────────
    fn draw_sixel(&self, raw: &mut [u8], w: u32, h: u32, img: &crate::terminal::SixelImage) {
        let pad  = self.cfg.general.padding;
        let x_px = pad + img.x as u32 * self.atlas.cell_w;
        let y_px = pad + img.y as u32 * self.atlas.cell_h;
        for dy in 0..img.height as u32 {
            let py = y_px + dy; if py >= h { break; }
            for dx in 0..img.width as u32 {
                let px = x_px + dx; if px >= w { break; }
                let pi  = (dy * img.width as u32 + dx) as usize * 4;
                if pi + 3 >= img.data.len() { continue; }
                let (ir, ig, ib, ia) = (img.data[pi], img.data[pi+1], img.data[pi+2], img.data[pi+3]);
                let off = (py * w + px) as usize * 4;
                let dst = (raw[off] as u32) << 16 | (raw[off+1] as u32) << 8
                | raw[off+2] as u32 | (raw[off+3] as u32) << 24;
                let bl  = blend_over(dst, argb(ia, ir, ig, ib), ia);
                let (r, g, b, a) = unpack(bl);
                raw[off]=r; raw[off+1]=g; raw[off+2]=b; raw[off+3]=a;
            }
        }
    }

    // ── Kolor terminala → RGB ─────────────────────────────────────────────────
    fn resolve_color(&self, c: &Color, is_fg: bool) -> (u8, u8, u8) {
        let Rgb(r, g, b) = match c {
            Color::Default    => if is_fg { self.cfg.colors.fg } else { self.cfg.colors.bg },
            Color::Ansi(n)    => self.cfg.colors.ansi.get(*n as usize).copied().unwrap_or(self.cfg.colors.fg),
            Color::Rgb(r,g,b) => Rgb(*r, *g, *b),
        };
        (r, g, b)
    }

    pub fn mark_cell_changed(&mut self, x: u16, y: u16) {
        self.changed_cells.insert((x, y));
    }
}
