use std::collections::HashSet;
use std::collections::VecDeque;
use std::time::Instant;

use slint::{SharedPixelBuffer, Rgba8Pixel};

use crate::config::{Config, Rgb};
use crate::font::Atlas;
use crate::terminal::{Terminal, Color, CellFlags, Selection};

// Pomocnicze funkcje do manipulacji pikselami RGBA
#[inline]
fn argb(a: u8, r: u8, g: u8, b: u8) -> u32 {
    ((a as u32) << 24) | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32)
}

#[inline]
fn unpack(c: u32) -> (u8, u8, u8, u8) {
    (
        ((c >> 16) & 0xFF) as u8,
     ((c >> 8) & 0xFF) as u8,
     (c & 0xFF) as u8,
     ((c >> 24) & 0xFF) as u8,
    )
}

#[inline]
fn blend_over(dst: u32, src: u32, src_a: u8) -> u32 {
    if src_a == 255 {
        return src;
    }
    if src_a == 0 {
        return dst;
    }
    let a = src_a as u32;
    let ia = 255 - a;
    let (sr, sg, sb, _) = unpack(src);
    let (dr, dg, db, da) = unpack(dst);
    let r = (sr as u32 * a + dr as u32 * ia) / 255;
    let g = (sg as u32 * a + dg as u32 * ia) / 255;
    let b = (sb as u32 * a + db as u32 * ia) / 255;
    let oa = (a + da as u32 * ia / 255).min(255);
    argb(oa as u8, r as u8, g as u8, b as u8)
}

#[inline]
fn blit_glyph(
    buf: &mut [u8], // RGBA
    bw: u32,
    bh: u32,
    atlas: &[u8], // alpha mask
    aw: u32,
    gx: i32,
    gy: i32,
    gw: u32,
    gh: u32,
    ax: u32,
    ay: u32,
    color: u32,
) {
    // Usunięto ostrzeżenia przez przedrostek _
    let (_cr, _cg, _cb, _ca) = unpack(color);
    for row in 0..gh as i32 {
        let py = gy + row;
        if py < 0 || py >= bh as i32 {
            continue;
        }
        for col in 0..gw as i32 {
            let px = gx + col;
            if px < 0 || px >= bw as i32 {
                continue;
            }
            let ai = ((ay as i32 + row) * aw as i32 + ax as i32 + col) as usize;
            let alpha = *atlas.get(ai).unwrap_or(&0);
            if alpha == 0 {
                continue;
            }
            let bi = (py as u32 * bw + px as u32) as usize * 4;
            let dst = (buf[bi] as u32) << 16
            | (buf[bi + 1] as u32) << 8
            | (buf[bi + 2] as u32)
            | (buf[bi + 3] as u32) << 24;
            let blended = blend_over(dst, color, alpha);
            let (r, g, b, a) = unpack(blended);
            buf[bi] = r;
            buf[bi + 1] = g;
            buf[bi + 2] = b;
            buf[bi + 3] = a;
        }
    }
}

pub struct Canvas {
    pub cfg: Config,
    pub atlas: Atlas,
    start: Instant,
    // Differential rendering
    prev_pixels: Vec<u8>,
    prev_grid: (u16, u16),
    changed_cells: HashSet<(u16, u16)>,
    // Motion blur
    motion_blur_buffer: VecDeque<Vec<u8>>,
    // Frame counter
    frame: u64,
}

impl Canvas {
    pub fn new(cfg: Config, atlas: Atlas) -> Self {
        Self {
            cfg,
            atlas,
            start: Instant::now(),
            prev_pixels: Vec::new(),
            prev_grid: (0, 0),
            changed_cells: HashSet::new(),
            motion_blur_buffer: VecDeque::with_capacity(3),
            frame: 0,
        }
    }

    pub fn grid_size(&self, px_w: u32, px_h: u32) -> (u16, u16) {
        let p = self.cfg.general.padding;
        let cols = ((px_w.saturating_sub(p * 2)) / self.atlas.cell_w).max(4) as u16;
        let rows = ((px_h.saturating_sub(p * 2)) / self.atlas.cell_h).max(2) as u16;
        (cols, rows)
    }

    /// Główna metoda renderowania – zwraca bufor RGBA dla Slinta.
    pub fn render(&mut self, term: &Terminal, px_w: u32, px_h: u32) -> SharedPixelBuffer<Rgba8Pixel> {
        self.frame += 1;
        let t = self.start.elapsed().as_secs_f32();

        let (cols, rows) = self.grid_size(px_w, px_h);
        let grid_changed = (cols, rows) != self.prev_grid;

        let mut buf = SharedPixelBuffer::<Rgba8Pixel>::new(px_w, px_h);
        let raw = buf.make_mut_bytes();

        // 1. Tło – gradient
        self.draw_background(raw, px_w, px_h, t);

        // 2. Rysowanie komórek (z uwzględnieniem differential rendering)
        if !grid_changed && !self.prev_pixels.is_empty() && !self.changed_cells.is_empty() {
            // Kopiujemy poprzedni bufor
            raw.copy_from_slice(&self.prev_pixels);
            // Klonujemy zbiór zmienionych komórek, aby uniknąć podwójnego pożyczenia
            let changed = self.changed_cells.clone();
            for (x, y) in changed {
                if x < cols && y < rows {
                    self.draw_cell(raw, px_w, px_h, term, x, y, t);
                }
            }
        } else {
            // Rysujemy wszystko od nowa
            self.draw_all_cells(raw, px_w, px_h, term, t);
        }

        // 3. Motion blur (mieszanie z poprzednimi klatkami)
        let strength = self.cfg.general.motion_blur_strength;
        if strength > 0.0 && !self.motion_blur_buffer.is_empty() {
            let mut blended = raw.to_vec();
            for prev in &self.motion_blur_buffer {
                for i in (0..raw.len()).step_by(4) {
                    let alpha = (strength * 255.0) as u8;
                    let dr = prev[i];
                    let dg = prev[i + 1];
                    let db = prev[i + 2];
                    let da = prev[i + 3];
                    let sr = blended[i];
                    let sg = blended[i + 1];
                    let sb = blended[i + 2];
                    let sa = blended[i + 3];
                    let nr = (sr as u32 * (255 - alpha as u32) + dr as u32 * alpha as u32) / 255;
                    let ng = (sg as u32 * (255 - alpha as u32) + dg as u32 * alpha as u32) / 255;
                    let nb = (sb as u32 * (255 - alpha as u32) + db as u32 * alpha as u32) / 255;
                    let na = (sa as u32 * (255 - alpha as u32) + da as u32 * alpha as u32) / 255;
                    blended[i] = nr as u8;
                    blended[i + 1] = ng as u8;
                    blended[i + 2] = nb as u8;
                    blended[i + 3] = na as u8;
                }
            }
            raw.copy_from_slice(&blended);
        }

        // 4. Zaznaczenie (rysowane na wierzchu)
        self.draw_selection(raw, px_w, px_h, term);

        // 5. Obrazy Sixel (jeśli istnieją)
        for img in &term.sixel_images {
            self.draw_sixel(raw, px_w, px_h, img);
        }

        // Aktualizacja stanu dla differential rendering
        self.prev_pixels = raw.to_vec();
        self.prev_grid = (cols, rows);
        self.changed_cells.clear();

        // Aktualizacja motion blur – zachowujemy max 3 klatki
        self.motion_blur_buffer.push_front(raw.to_vec());
        while self.motion_blur_buffer.len() > 3 {
            self.motion_blur_buffer.pop_back();
        }

        buf
    }

    // Rysowanie tła z gradientem neonowym
    fn draw_background(&self, raw: &mut [u8], w: u32, h: u32, _t: f32) {
        let Rgb(bgr, bgg, bgb) = self.cfg.colors.bg;
        for y in 0..h {
            let fy = y as f32 / h as f32;
            for x in 0..w {
                let fx = x as f32 / w as f32;
                let d1 = (fx * fx + fy * fy).sqrt();
                let d2 = ((1.0 - fx) * (1.0 - fx) + (1.0 - fy) * (1.0 - fy)).sqrt();
                let g1 = (1.0 - (d1 * 1.6).min(1.0)) * 40.0;
                let g2 = (1.0 - (d2 * 1.9).min(1.0)) * 25.0;
                let off = (y * w + x) as usize * 4;
                raw[off] = (bgr as f32 + g2 * 0.8).min(255.0) as u8;
                raw[off + 1] = (bgg as f32 + g1 * 0.5).min(255.0) as u8;
                raw[off + 2] = (bgb as f32 + g1 * 0.6 + g2 * 0.5).min(255.0) as u8;
                raw[off + 3] = self.cfg.general.window_transparency;
            }
        }
    }

    // Rysuje wszystkie komórki (pełne renderowanie)
    fn draw_all_cells(&mut self, raw: &mut [u8], w: u32, h: u32, term: &Terminal, t: f32) {
        let lines = term.visible_lines();
        let cols = term.cols as usize;
        for (row, _line) in lines.iter().enumerate() {
            for col in 0..cols {
                self.draw_cell(raw, w, h, term, col as u16, row as u16, t);
            }
        }
    }

    // Rysuje pojedynczą komórkę
    fn draw_cell(
        &mut self,
        raw: &mut [u8],
        w: u32,
        h: u32,
        term: &Terminal,
        col: u16,
        row: u16,
        t: f32,
    ) {
        let lines = term.visible_lines();
        if row as usize >= lines.len() {
            return;
        }
        let line = lines[row as usize];
        if col as usize >= line.len() {
            return;
        }
        let cell = &line[col as usize];

        let pad = self.cfg.general.padding;
        let cw = self.atlas.cell_w;
        let ch = self.atlas.cell_h;
        let px_x = (pad + col as u32 * cw) as i32;
        let px_y = (pad + row as u32 * ch) as i32;

        // Tło komórki (tylko jeśli nie domyślne)
        if cell.bg != Color::Default {
            let (r, g, b) = self.resolve_color(&cell.bg, false);
            for dy in 0..ch as i32 {
                let by = px_y + dy;
                if by < 0 || by >= h as i32 {
                    continue;
                }
                for dx in 0..cw as i32 {
                    let bx = px_x + dx;
                    if bx < 0 || bx >= w as i32 {
                        continue;
                    }
                    let off = (by as u32 * w + bx as u32) as usize * 4;
                    raw[off] = r;
                    raw[off + 1] = g;
                    raw[off + 2] = b;
                    // zachowujemy przezroczystość tła
                }
            }
        }

        // Kursor
        let is_cursor = col == term.cx && row == term.cy && term.cursor_visible && term.scroll_off == 0;
        if is_cursor {
            let pulse = (t * 4.2).sin() * 0.3 + 0.7;
            let alpha = (pulse * 255.0) as u8;
            let Rgb(cr, cg, cb) = self.cfg.colors.cursor;
            for dy in 0..ch as i32 {
                let by = px_y + dy;
                if by < 0 || by >= h as i32 {
                    continue;
                }
                for dx in 0..cw as i32 {
                    let bx = px_x + dx;
                    if bx < 0 || bx >= w as i32 {
                        continue;
                    }
                    let alpha_cursor = if dy >= ch as i32 - 2 {
                        alpha
                    } else if dy == 0 || dx == 0 || dx == cw as i32 - 1 {
                        alpha / 4
                    } else {
                        alpha / 14
                    };
                    let off = (by as u32 * w + bx as u32) as usize * 4;
                    let dst = (raw[off] as u32) << 16
                    | (raw[off + 1] as u32) << 8
                    | (raw[off + 2] as u32)
                    | (raw[off + 3] as u32) << 24;
                    let color = argb(255, cr, cg, cb);
                    let blended = blend_over(dst, color, alpha_cursor);
                    let (r, g, b, a) = unpack(blended);
                    raw[off] = r;
                    raw[off + 1] = g;
                    raw[off + 2] = b;
                    raw[off + 3] = a;
                }
            }
        }

        // Podkreślenie
        if cell.flags.contains(CellFlags::UNDERLINE) {
            let (r, g, b) = self.resolve_color(&cell.fg, true);
            let uy = px_y + ch as i32 - 2;
            if uy >= 0 && uy < h as i32 {
                for dx in 0..cw as i32 {
                    let bx = px_x + dx;
                    if bx < 0 || bx >= w as i32 {
                        continue;
                    }
                    let off = (uy as u32 * w + bx as u32) as usize * 4;
                    raw[off] = r;
                    raw[off + 1] = g;
                    raw[off + 2] = b;
                }
            }
        }

        // Glyph
        if cell.ch == ' ' || cell.ch == '\0' {
            return;
        }
        if cell.flags.contains(CellFlags::INVISIBLE) {
            return;
        }

        let glyph = self.atlas.get(cell.ch);
        if glyph.w == 0 {
            return;
        }

        let (mut r, mut g, mut b) = self.resolve_color(&cell.fg, true);
        if cell.flags.contains(CellFlags::DIM) {
            r /= 2;
            g /= 2;
            b /= 2;
        }
        if cell.flags.contains(CellFlags::BOLD) {
            r = (r as u32 * 5 / 4).min(255) as u8;
            g = (g as u32 * 5 / 4).min(255) as u8;
            b = (b as u32 * 5 / 4).min(255) as u8;
        }

        let gx = px_x + glyph.bx;
        let gy = px_y + self.atlas.baseline as i32 - (glyph.h as i32 + glyph.by);

        blit_glyph(
            raw,
            w,
            h,
            &self.atlas.pixels,
            self.atlas.tex_w,
            gx,
            gy,
            glyph.w,
            glyph.h,
            glyph.ax,
            glyph.ay,
            argb(255, r, g, b),
        );
    }

    // Rysowanie zaznaczenia
    fn draw_selection(&self, raw: &mut [u8], w: u32, h: u32, term: &Terminal) {
        match &term.selection {
            Selection::Rectangular {
                start_x,
                start_y,
                end_x,
                end_y,
            } => {
                let x1 = *start_x.min(end_x);
                let x2 = *start_x.max(end_x);
                let y1 = *start_y.min(end_y);
                let y2 = *start_y.max(end_y);
                let pad = self.cfg.general.padding;
                let cw = self.atlas.cell_w;
                let ch = self.atlas.cell_h;

                for y in y1..=y2 {
                    let py = pad + (y as u32) * ch;
                    if py + ch > h {
                        continue;
                    }
                    for x in x1..=x2 {
                        let px = pad + (x as u32) * cw;
                        if px + cw > w {
                            continue;
                        }
                        // Rysujemy półprzezroczysty prostokąt
                        for dy in 0..ch {
                            let by = py + dy;
                            for dx in 0..cw {
                                let bx = px + dx;
                                let off = (by * w + bx) as usize * 4;
                                let dst = (raw[off] as u32) << 16
                                | (raw[off + 1] as u32) << 8
                                | (raw[off + 2] as u32)
                                | (raw[off + 3] as u32) << 24;
                                let sel_color = argb(100, 80, 160, 255);
                                let blended = blend_over(dst, sel_color, 100);
                                let (r, g, b, a) = unpack(blended);
                                raw[off] = r;
                                raw[off + 1] = g;
                                raw[off + 2] = b;
                                raw[off + 3] = a;
                            }
                        }
                    }
                }
            }
            Selection::None => {}
        }
    }

    // Rysowanie obrazu Sixel
    fn draw_sixel(&self, raw: &mut [u8], w: u32, h: u32, img: &crate::terminal::SixelImage) {
        let pad = self.cfg.general.padding;
        let cw = self.atlas.cell_w;
        let ch = self.atlas.cell_h;
        let x_px = pad + img.x as u32 * cw;
        let y_px = pad + img.y as u32 * ch;

        let img_w = img.width as u32;
        let img_h = img.height as u32;

        for dy in 0..img_h {
            let py = y_px + dy;
            if py >= h {
                break;
            }
            for dx in 0..img_w {
                let px = x_px + dx;
                if px >= w {
                    break;
                }
                let off = (py * w + px) as usize * 4;
                let pixel_idx = (dy * img_w + dx) as usize * 4;
                if pixel_idx + 3 < img.data.len() {
                    let r = img.data[pixel_idx];
                    let g = img.data[pixel_idx + 1];
                    let b = img.data[pixel_idx + 2];
                    let a = img.data[pixel_idx + 3];
                    let dst = (raw[off] as u32) << 16
                    | (raw[off + 1] as u32) << 8
                    | (raw[off + 2] as u32)
                    | (raw[off + 3] as u32) << 24;
                    let src = argb(a, r, g, b);
                    let blended = blend_over(dst, src, a);
                    let (r, g, b, a) = unpack(blended);
                    raw[off] = r;
                    raw[off + 1] = g;
                    raw[off + 2] = b;
                    raw[off + 3] = a;
                }
            }
        }
    }

    // Konwersja koloru terminalowego na RGB
    fn resolve_color(&self, c: &Color, is_fg: bool) -> (u8, u8, u8) {
        let Rgb(r, g, b) = match c {
            Color::Default => {
                if is_fg {
                    self.cfg.colors.fg
                } else {
                    self.cfg.colors.bg
                }
            }
            Color::Ansi(n) => self
            .cfg
            .colors
            .ansi
            .get(*n as usize)
            .copied()
            .unwrap_or(self.cfg.colors.fg),
            Color::Rgb(r, g, b) => Rgb(*r, *g, *b),
        };
        (r, g, b)
    }

    /// Rejestruje zmienione komórki – wywoływane przez PTY reader
    pub fn mark_cell_changed(&mut self, x: u16, y: u16) {
        self.changed_cells.insert((x, y));
    }
}
