use std::time::Instant;
use slint::{SharedPixelBuffer, Rgba8Pixel};

use crate::config::{Config, Rgb};
use crate::font::Atlas;
use crate::terminal::{Terminal, Color, CellFlags};

#[inline] fn blend_over(dr:u8,dg:u8,db:u8, sr:u8,sg:u8,sb:u8, a:u8) -> (u8,u8,u8) {
if a == 255 { return (sr,sg,sb); }
if a == 0   { return (dr,dg,db); }
let fa=a as u32; let fi=255-fa;
(
    ((sr as u32*fa + dr as u32*fi)/255) as u8,
 ((sg as u32*fa + dg as u32*fi)/255) as u8,
 ((sb as u32*fa + db as u32*fi)/255) as u8,
)
}

#[inline]
fn blit(raw: &mut [u8], bw:u32, bh:u32,
        atlas:&[u8], aw:u32,
        gx:i32, gy:i32, gw:u32, gh:u32, ax:u32, ay:u32,
        r:u8, g:u8, b:u8)
{
    for row in 0..gh as i32 {
        let py = gy+row;
        if py < 0 || py >= bh as i32 { continue; }
        for col in 0..gw as i32 {
            let px = gx+col;
            if px < 0 || px >= bw as i32 { continue; }
            let ai = ((ay as i32+row)*aw as i32 + ax as i32+col) as usize;
            let alpha = *atlas.get(ai).unwrap_or(&0);
            if alpha == 0 { continue; }
            let bi = (py as u32*bw + px as u32) as usize * 4;
            let (nr,ng,nb) = blend_over(raw[bi],raw[bi+1],raw[bi+2], r,g,b, alpha);
            raw[bi]   = nr;
            raw[bi+1] = ng;
            raw[bi+2] = nb;
            // alpha channel stays 255
        }
    }
}

pub struct Canvas {
    pub cfg:   Config,
    pub atlas: Atlas,
    start:     Instant,
}

impl Canvas {
    pub fn new(cfg: Config, atlas: Atlas) -> Self {
        Self { cfg, atlas, start: Instant::now() }
    }

    pub fn grid_size(&self, px_w:u32, px_h:u32) -> (u16,u16) {
        let p = self.cfg.padding;
        let cols = ((px_w.saturating_sub(p*2)) / self.atlas.cell_w).max(4) as u16;
        let rows = ((px_h.saturating_sub(p*2)) / self.atlas.cell_h).max(2) as u16;
        (cols, rows)
    }

    pub fn render(&mut self, term: &Terminal, px_w:u32, px_h:u32)
    -> SharedPixelBuffer<Rgba8Pixel>
    {
        let t   = self.start.elapsed().as_secs_f32();
        let cw  = self.atlas.cell_w;
        let ch  = self.atlas.cell_h;
        let pad = self.cfg.padding;
        let Rgb(bgr,bgg,bgb) = self.cfg.colors.bg;

        // Allocate Slint buffer and get raw &mut [u8] (RGBA, 4 bytes/pixel)
        let mut buf = SharedPixelBuffer::<Rgba8Pixel>::new(px_w, px_h);
        {
            let raw: &mut [u8] = buf.make_mut_bytes();

            // Fill with background + subtle corner glows
            let stride = (px_w * 4) as usize;
            for y in 0..px_h {
                let fy = y as f32 / px_h as f32;
                for x in 0..px_w {
                    let fx = x as f32 / px_w as f32;
                    let d1 = (fx*fx + fy*fy).sqrt();
                    let d2 = ((1.0-fx)*(1.0-fx)+(1.0-fy)*(1.0-fy)).sqrt();
                    let g1 = (1.0-(d1*1.6).min(1.0))*40.0;
                    let g2 = (1.0-(d2*1.9).min(1.0))*25.0;
                    let off = y as usize * stride + x as usize * 4;
                    raw[off]   = (bgr as f32 + g2*0.8).min(255.0) as u8;
                    raw[off+1] = (bgg as f32 + g1*0.5).min(255.0) as u8;
                    raw[off+2] = (bgb as f32 + g1*0.6 + g2*0.5).min(255.0) as u8;
                    raw[off+3] = 255;
                }
            }

            let lines = term.visible_lines();
            let cols  = term.cols as usize;

            for (row, line) in lines.iter().enumerate() {
                for col in 0..cols {
                    let cell = line.get(col).cloned().unwrap_or_default();
                    let px_x = (pad + col as u32 * cw) as i32;
                    let px_y = (pad + row as u32 * ch) as i32;

                    // ── Cell background ───────────────────────────────────────
                    if cell.bg != Color::Default {
                        let (r,g,b) = self.resolve(&cell.bg, false);
                        for dy in 0..ch as i32 {
                            let by = px_y+dy;
                            if by < 0 || by >= px_h as i32 { continue; }
                            for dx in 0..cw as i32 {
                                let bx = px_x+dx;
                                if bx < 0 || bx >= px_w as i32 { continue; }
                                let off = (by as u32*px_w + bx as u32) as usize * 4;
                                raw[off]=r; raw[off+1]=g; raw[off+2]=b; raw[off+3]=255;
                            }
                        }
                    }

                    // ── Cursor ────────────────────────────────────────────────
                    let is_cur = col == term.cx as usize
                    && row == term.cy as usize
                    && term.cursor_visible
                    && term.scroll_off == 0;

                    if is_cur {
                        let pulse = (t*4.2).sin()*0.3 + 0.7;
                        let a = (pulse * 255.0) as u8;
                        let Rgb(cr,cg,cb) = self.cfg.colors.cursor;

                        for dy in 0..ch as i32 {
                            let by = px_y+dy;
                            if by < 0 || by >= px_h as i32 { continue; }
                            for dx in 0..cw as i32 {
                                let bx = px_x+dx;
                                if bx < 0 || bx >= px_w as i32 { continue; }
                                let alpha = if dy >= ch as i32-2 { a }
                                else if dy==0 || dx==0 || dx==cw as i32-1 { a/4 }
                                else { a/14 };
                                let off = (by as u32*px_w + bx as u32) as usize * 4;
                                let (nr,ng,nb) = blend_over(raw[off],raw[off+1],raw[off+2],cr,cg,cb,alpha);
                                raw[off]=nr; raw[off+1]=ng; raw[off+2]=nb;
                            }
                        }
                        // glow below
                        for gd in 0i32..3 {
                            let by2 = px_y + ch as i32 - 1 + gd;
                            if by2 < 0 || by2 >= px_h as i32 { continue; }
                            for dx in 0..cw as i32 {
                                let bx = px_x+dx;
                                if bx < 0 || bx >= px_w as i32 { continue; }
                                let alpha = (a as u32*(3-gd as u32)/4) as u8;
                                let off = (by2 as u32*px_w + bx as u32) as usize * 4;
                                let (nr,ng,nb) = blend_over(raw[off],raw[off+1],raw[off+2],cr,cg,cb,alpha);
                                raw[off]=nr; raw[off+1]=ng; raw[off+2]=nb;
                            }
                        }
                    }

                    // ── Underline ─────────────────────────────────────────────
                    if cell.flags.contains(CellFlags::UNDERLINE) {
                        let (r,g,b) = self.resolve(&cell.fg, true);
                        let uy = px_y + ch as i32 - 2;
                        if uy >= 0 && uy < px_h as i32 {
                            for dx in 0..cw as i32 {
                                let bx = px_x+dx;
                                if bx < 0 || bx >= px_w as i32 { continue; }
                                let off = (uy as u32*px_w + bx as u32) as usize * 4;
                                raw[off]=r; raw[off+1]=g; raw[off+2]=b; raw[off+3]=255;
                            }
                        }
                    }

                    // ── Glyph ─────────────────────────────────────────────────
                    if cell.ch == ' ' || cell.ch == '\0' { continue; }
                    if cell.flags.contains(CellFlags::INVISIBLE) { continue; }

                    let glyph = self.atlas.get(cell.ch);
                    if glyph.w == 0 { continue; }

                    let (mut r,mut g,mut b) = self.resolve(&cell.fg, true);
                    if cell.flags.contains(CellFlags::DIM) {
                        r/=2; g/=2; b/=2;
                    }
                    if cell.flags.contains(CellFlags::BOLD) {
                        r=(r as u32*5/4).min(255) as u8;
                        g=(g as u32*5/4).min(255) as u8;
                        b=(b as u32*5/4).min(255) as u8;
                    }

                    let gx = px_x + glyph.bx;
                    let gy = px_y + self.atlas.baseline as i32 - (glyph.h as i32 + glyph.by);

                    blit(raw, px_w, px_h,
                         &self.atlas.pixels, self.atlas.tex_w,
                         gx, gy, glyph.w, glyph.h, glyph.ax, glyph.ay,
                         r, g, b);
                }
            }
        }
        buf
    }

    fn resolve(&self, c: &Color, is_fg: bool) -> (u8,u8,u8) {
        let Rgb(r,g,b) = match c {
            Color::Default    => if is_fg { self.cfg.colors.fg } else { self.cfg.colors.bg },
            Color::Ansi(n)    => self.cfg.colors.ansi.get(*n as usize).copied()
            .unwrap_or(self.cfg.colors.fg),
            Color::Rgb(r,g,b) => Rgb(*r,*g,*b),
        };
        (r,g,b)
    }
}
