use std::num::NonZeroU32;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use softbuffer::{Context, Surface};
use winit::window::Window;

use crate::config::{Config, Colors};
use crate::font::Atlas;
use crate::terminal::{Terminal, Color, CellFlags};

/// ARGB pixel helpers
#[inline] fn argb(a:u8,r:u8,g:u8,b:u8)->u32 { ((a as u32)<<24)|((r as u32)<<16)|((g as u32)<<8)|(b as u32) }
#[inline] fn unpack(c:u32)->(u8,u8,u8,u8) {
(((c>>16)&0xFF) as u8, ((c>>8)&0xFF) as u8, (c&0xFF) as u8, ((c>>24)&0xFF) as u8)
}

/// Alpha-blend src over dst (pre-multiplied)
#[inline]
fn blend(dst: u32, src: u32, src_a: u8) -> u32 {
    if src_a == 255 { return src; }
    if src_a == 0   { return dst; }
    let a  = src_a as u32;
    let ia = 255 - a;
    let (sr,sg,sb,_) = unpack(src);
    let (dr,dg,db,da) = unpack(dst);
    let r = (sr as u32 * a + dr as u32 * ia) / 255;
    let g = (sg as u32 * a + dg as u32 * ia) / 255;
    let b = (sb as u32 * a + db as u32 * ia) / 255;
    let oa = (a + da as u32 * ia / 255).min(255);
    argb(oa as u8, r as u8, g as u8, b as u8)
}

/// Glyph blit — alpha from atlas R8
#[inline]
fn blit_glyph(buf: &mut [u32], bw: u32, bh: u32,
              atlas: &[u8], aw: u32,
              gx:i32, gy:i32, gw:u32, gh:u32, ax:u32, ay:u32,
              color: u32) {
    let (cr,cg,cb,_) = unpack(color);
    for row in 0..gh as i32 {
        let py = gy + row; if py < 0 || py >= bh as i32 { continue; }
        for col in 0..gw as i32 {
            let px = gx + col; if px < 0 || px >= bw as i32 { continue; }
            let ai = ((ay as i32 + row) * aw as i32 + ax as i32 + col) as usize;
            let a  = *atlas.get(ai).unwrap_or(&0);
            if a == 0 { continue; }
            let bi = py as usize * bw as usize + px as usize;
            buf[bi] = blend(buf[bi], argb(255,cr,cg,cb), a);
        }
    }
              }

              // ── Scanline noise (subtle static overlay) ───────────────────────────────────
              fn scanline_noise(y: u32, frame: u64) -> i32 {
                  let h = (y as u64)
                  .wrapping_mul(6364136223846793005)
                  .wrapping_add(frame.wrapping_mul(1442695040888963407)) as i32;
                  ((h >> 28) & 0x7) - 3  // -3..+3
              }

              pub struct Renderer {
                  surface:  Surface<Arc<Window>, Arc<Window>>,
                  width:    u32,
                  height:   u32,
                  atlas:    Atlas,
                  cfg:      Config,
                  start:    Instant,
                  frame:    u64,
              }

              impl Renderer {
                  pub fn new(window: Arc<Window>, atlas: Atlas, cfg: Config) -> Self {
                      let ctx  = Context::new(window.clone()).expect("softbuffer context");
                      let surf = Surface::new(&ctx, window.clone()).expect("softbuffer surface");
                      let sz   = window.inner_size();
                      Self {
                          surface: surf,
                          width:  sz.width.max(1),
                          height: sz.height.max(1),
                          atlas, cfg,
                          start: Instant::now(),
                          frame: 0,
                      }
                  }

                  pub fn resize(&mut self, w: u32, h: u32) {
                      self.width  = w.max(1);
                      self.height = h.max(1);
                  }

                  /// Compute terminal dimensions from current window size
                  pub fn term_size(&self) -> (u16, u16) {
                      let cw = self.atlas.cell_w;
                      let ch = self.atlas.cell_h;
                      let p  = self.cfg.padding;
                      let cols = ((self.width  - p * 2) / cw).max(4) as u16;
                      let rows = ((self.height - p * 2 - TITLE_BAR_H) / ch).max(2) as u16;
                      (cols, rows)
                  }

                  pub fn render(&mut self, term: &Arc<Mutex<Terminal>>) {
                      self.frame += 1;
                      let t = self.start.elapsed().as_secs_f32();
                      let w = self.width; let h = self.height;
                      let (nr, ng, nb) = Colors::rgb(self.cfg.colors.bg);

                      // ── Allocate pixel buffer ─────────────────────────────────────────────
                      let mut buf = vec![argb(255, nr, ng, nb); (w * h) as usize];

                      // ── Background gradient  ──────────────────────────────────────────────
                      self.draw_bg(&mut buf, w, h, t);

                      // ── Title bar  ────────────────────────────────────────────────────────
                      let title = { term.lock().unwrap().title.clone() };
                      self.draw_title_bar(&mut buf, w, &title, t);

                      // ── Terminal cells  ───────────────────────────────────────────────────
                      {
                          let term = term.lock().unwrap();
                          self.draw_term(&mut buf, w, h, &term, t);
                      }

                      // ── Scanlines (CRT aesthetic) ─────────────────────────────────────────
                      self.draw_scanlines(&mut buf, w, h);

                      // ── Outer glow border ─────────────────────────────────────────────────
                      self.draw_border(&mut buf, w, h, t);

                      // ── Blit to window ────────────────────────────────────────────────────
                      self.surface.resize(
                          NonZeroU32::new(w).unwrap(),
                                          NonZeroU32::new(h).unwrap(),
                      ).ok();
                      if let Ok(mut sb) = self.surface.buffer_mut() {
                          sb.copy_from_slice(&buf);
                          sb.present().ok();
                      }
                  }

                  // ── Background: radial neon glow from corners ─────────────────────────────
                  fn draw_bg(&self, buf: &mut [u32], w: u32, h: u32, _t: f32) {
                      let (br, bg, bb) = Colors::rgb(self.cfg.colors.bg);
                      // Top-left cyan glow
                      let (gr, gg, gb) = (0u32, 40u32, 60u32);
                      // Bottom-right magenta glow
                      let (mr, mg, mb) = (40u32, 0u32, 50u32);

                      for y in 0..h {
                          for x in 0..w {
                              let fx = x as f32 / w as f32;
                              let fy = y as f32 / h as f32;

                              // radial from top-left
                              let d1 = (fx * fx + fy * fy).sqrt();
                              // radial from bottom-right
                              let d2 = ((1.0-fx)*(1.0-fx) + (1.0-fy)*(1.0-fy)).sqrt();

                              let g1 = (1.0 - (d1 * 1.8).min(1.0)) * 0.6;
                              let g2 = (1.0 - (d2 * 2.0).min(1.0)) * 0.4;

                              let r = (br as f32 + gr as f32 * g1 + mr as f32 * g2).min(255.0) as u8;
                              let g = (bg as f32 + gg as f32 * g1 + mg as f32 * g2).min(255.0) as u8;
                              let b = (bb as f32 + gb as f32 * g1 + mb as f32 * g2).min(255.0) as u8;

                              let i = (y * w + x) as usize;
                              buf[i] = argb(self.cfg.bg_opacity, r, g, b);
                          }
                      }
                  }

                  // ── Title bar ──────────────────────────────────────────────────────────────
                  fn draw_title_bar(&mut self, buf: &mut [u32], w: u32, title: &str, t: f32) {
                      let h = TITLE_BAR_H;

                      // Bar background
                      for y in 0..h {
                          for x in 0..w {
                              let i = (y * w + x) as usize;
                              let alpha = 180u8;
                              let (r, g, b) = Colors::rgb(self.cfg.colors.tab_bar);
                              // subtle gradient
                              let fade = (1.0 - y as f32 / h as f32) * 0.3;
                              let r2 = ((r as f32 * (1.0 + fade)).min(255.0)) as u8;
                              let g2 = ((g as f32 * (1.0 + fade)).min(255.0)) as u8;
                              let b2 = ((b as f32 * (1.0 + fade * 2.0)).min(255.0)) as u8;
                              buf[i] = blend(buf[i], argb(alpha, r2, g2, b2), alpha);
                          }
                      }

                      // Bottom border line — animated neon glow
                      let pulse = (t * 2.0).sin() * 0.3 + 0.7;
                      let glow_alpha = (pulse * 200.0) as u8;
                      let (gr, gg, gb) = Colors::rgb(self.cfg.colors.glow);
                      for x in 0..w {
                          let i = ((h - 1) * w + x) as usize;
                          buf[i] = blend(buf[i], argb(255, gr, gg, gb), glow_alpha);
                          if h >= 2 {
                              let i2 = ((h - 2) * w + x) as usize;
                              buf[i2] = blend(buf[i2], argb(255, gr, gg, gb), glow_alpha / 3);
                          }
                      }

                      // ⚡ Icon + title text
                      let icon  = "⚡ NeonTerm";
                      let label = if title == "NeonTerm" || title.is_empty() {
                          icon.to_string()
                      } else {
                          format!("⚡ {}", title)
                      };

                      let text_y = 6i32;
                      let text_x = 12i32;
                      let (tc_r, tc_g, tc_b) = Colors::rgb(self.cfg.colors.glow);
                      let text_color = argb(255, tc_r, tc_g, tc_b);

                      self.draw_string(buf, w, h as i32 * 4, text_x, text_y, &label, text_color);

                      // Window "buttons" (decorative)
                      let bx = w as i32 - 80;
                      let by = h as i32 / 2 - 5;
                      for (i, (r, g, b)) in [(255u8,80u8,80u8),(255u8,180u8,0u8),(80u8,220u8,80u8)].iter().enumerate() {
                          let cx = bx + i as i32 * 24;
                          self.fill_circle(buf, w, cx, by+5, 5, argb(200,*r,*g,*b));
                      }
                  }

                  // ── Draw terminal screen ──────────────────────────────────────────────────
                  fn draw_term(&mut self, buf: &mut [u32], w: u32, h: u32,
                               term: &Terminal, t: f32) {
                      let pad_x = self.cfg.padding as i32;
                      let pad_y = TITLE_BAR_H as i32 + self.cfg.padding as i32;
                      let cw    = self.atlas.cell_w as i32;
                      let ch    = self.atlas.cell_h as i32;
                      let lines = term.visible_lines();
                      let cols  = term.cols as usize;

                      for (row, line) in lines.iter().enumerate() {
                          for col in 0..cols {
                              let cell = line.get(col).cloned().unwrap_or_default();
                              let px   = pad_x + col as i32 * cw;
                              let py   = pad_y + row  as i32 * ch;

                              // ── Background ───────────────────────────────────────────────
                              let bg_raw = self.resolve_color(&cell.bg, &term, false);
                              let (bgr, bgg, bgb) = Colors::rgb(bg_raw);
                              let is_default_bg   = cell.bg == Color::Default;

                              for dy in 0..ch {
                                  for dx in 0..cw {
                                      let bx = px + dx; let by = py + dy;
                                      if bx < 0 || by < 0 || bx >= w as i32 || by >= h as i32 { continue; }
                                      let i = (by as u32 * w + bx as u32) as usize;
                                      if is_default_bg {
                                          // transparent — keep bg gradient
                                      } else {
                                          let a = 200u8;
                                          buf[i] = blend(buf[i], argb(255, bgr, bgg, bgb), a);
                                      }
                                  }
                              }

                              // ── Cursor ────────────────────────────────────────────────────
                              let is_cursor = col == term.cx as usize
                              && row == term.cy as usize
                              && term.visible
                              && term.scroll_off == 0;

                              if is_cursor {
                                  self.draw_cursor(buf, w, h, px, py, cw, ch, t);
                              }

                              // ── Underline ─────────────────────────────────────────────────
                              if cell.flags.contains(CellFlags::UNDERLINE) {
                                  let uy = py + ch - 2;
                                  let fg = self.resolve_color(&cell.fg, term, true);
                                  let (ur, ug, ub) = Colors::rgb(fg);
                                  for dx in 0..cw {
                                      let bx = px + dx;
                                      if uy >= 0 && uy < h as i32 && bx >= 0 && bx < w as i32 {
                                          let i = (uy as u32 * w + bx as u32) as usize;
                                          buf[i] = argb(255, ur, ug, ub);
                                      }
                                  }
                              }

                              // ── Glyph ─────────────────────────────────────────────────────
                              if cell.ch == ' ' || cell.ch == '\0' { continue; }

                              let glyph = self.atlas.get(cell.ch);
                              if glyph.w == 0 { continue; }

                              let mut fg = self.resolve_color(&cell.fg, term, true);
                              if cell.flags.contains(CellFlags::DIM) {
                                  let (r,g,b,_) = unpack(fg);
                                  fg = argb(255, r/2, g/2, b/2);
                              }
                              if cell.flags.contains(CellFlags::INVISIBLE) { continue; }
                              if cell.flags.contains(CellFlags::REVERSE) {
                                  std::mem::swap(&mut fg, &mut { let b=self.resolve_color(&cell.bg,term,false); b });
                              }

                              // Bold = slightly brighter
                              if cell.flags.contains(CellFlags::BOLD) {
                                  let (r,g,b,a) = unpack(fg);
                                  fg = argb(a,
                                            (r as u32 * 5 / 4).min(255) as u8,
                                            (g as u32 * 5 / 4).min(255) as u8,
                                            (b as u32 * 5 / 4).min(255) as u8,
                                  );
                              }

                              // Position: baseline - (glyph height + bearing_y)
                              let gx = px + glyph.bx;
                              let gy = py + self.atlas.baseline as i32
                              - (glyph.h as i32 + glyph.by);

                              blit_glyph(
                                  buf, w, h,
                                  &self.atlas.pixels, self.atlas.tex_w,
                                  gx, gy, glyph.w, glyph.h, glyph.ax, glyph.ay,
                                  fg,
                              );
                          }
                      }

                      // ── Scrollback indicator ──────────────────────────────────────────────
                      if term.scroll_off > 0 {
                          let msg = format!("  ▲ scrollback ({} lines) ▲  ", term.scroll_off);
                          let mx  = pad_x;
                          let my  = pad_y - ch;
                          self.draw_string(buf, w, h as i32, mx, my, &msg,
                                           argb(255, 255, 200, 50));
                      }
                               }

                               // ── Animated cursor ───────────────────────────────────────────────────────
                               fn draw_cursor(&self, buf: &mut [u32], w: u32, h: u32,
                                              px: i32, py: i32, cw: i32, ch: i32, t: f32) {
                                   let pulse = (t * 4.5).sin() * 0.35 + 0.65;
                                   let alpha = (pulse * 255.0) as u8;
                                   let (cr, cg, cb) = Colors::rgb(self.cfg.colors.cursor);

                                   // Full block cursor
                                   for dy in 0..ch {
                                       for dx in 0..cw {
                                           let bx = px + dx; let by = py + dy;
                                           if bx < 0 || by < 0 || bx >= w as i32 || by >= h as i32 { continue; }
                                           let i = (by as u32 * w + bx as u32) as usize;
                                           let a = if dy == ch-1 || dy == ch-2 { alpha }
                                           else if dx == 0 || dx == cw-1 { alpha / 2 }
                                           else { alpha / 6 };
                                           buf[i] = blend(buf[i], argb(255, cr, cg, cb), a);
                                       }
                                   }

                                   // Bottom glow bar — full brightness
                                   let bar_y = py + ch - 2;
                                   for dy in 0..3i32 {
                                       let by = bar_y + dy - 1;
                                       if by < 0 || by >= h as i32 { continue; }
                                       for dx in 0..cw {
                                           let bx = px + dx;
                                           if bx < 0 || bx >= w as i32 { continue; }
                                           let i = (by as u32 * w + bx as u32) as usize;
                                           let a = if dy == 1 { alpha } else { alpha / 3 };
                                           buf[i] = blend(buf[i], argb(255, cr, cg, cb), a);
                                       }
                                   }
                                              }

                                              // ── CRT scanlines ─────────────────────────────────────────────────────────
                                              fn draw_scanlines(&self, buf: &mut [u32], w: u32, h: u32) {
                                                  for y in (0..h).step_by(3) {
                                                      for x in 0..w {
                                                          let i = (y * w + x) as usize;
                                                          let (r,g,b,a) = unpack(buf[i]);
                                                          buf[i] = argb(a, r*8/10, g*8/10, b*8/10);
                                                      }
                                                  }
                                                  // Add slight noise per scanline
                                                  for y in 0..h {
                                                      let n = scanline_noise(y, self.frame);
                                                      if n == 0 { continue; }
                                                      for x in 0..w {
                                                          let i = (y * w + x) as usize;
                                                          let (r,g,b,a) = unpack(buf[i]);
                                                          let r2 = (r as i32 + n).clamp(0,255) as u8;
                                                          let g2 = (g as i32 + n).clamp(0,255) as u8;
                                                          let b2 = (b as i32 + n).clamp(0,255) as u8;
                                                          buf[i] = argb(a, r2, g2, b2);
                                                      }
                                                  }
                                              }

                                              // ── Border glow ──────────────────────────────────────────────────────────
                                              fn draw_border(&self, buf: &mut [u32], w: u32, h: u32, t: f32) {
                                                  let pulse = (t * 1.5).sin() * 0.2 + 0.8;
                                                  let a = (pulse * 120.0) as u8;
                                                  let (gr, gg, gb) = Colors::rgb(self.cfg.colors.glow);

                                                  // Top edge
                                                  for x in 0..w {
                                                      let i = x as usize;
                                                      buf[i] = blend(buf[i], argb(255,gr,gg,gb), a);
                                                      if h > 1 { buf[w as usize + x as usize] = blend(buf[w as usize + x as usize], argb(255,gr,gg,gb), a/3); }
                                                  }
                                                  // Left & right edges
                                                  for y in 0..h {
                                                      let il = (y * w) as usize;
                                                      let ir = (y * w + w - 1) as usize;
                                                      buf[il] = blend(buf[il], argb(255,gr,gg,gb), a/2);
                                                      buf[ir] = blend(buf[ir], argb(255,gr,gg,gb), a/2);
                                                  }
                                                  // Bottom edge
                                                  for x in 0..w {
                                                      let i = ((h-1)*w + x) as usize;
                                                      buf[i] = blend(buf[i], argb(255,gr,gg,gb), a);
                                                  }
                                              }

                                              // ── Resolve terminal color → ARGB ─────────────────────────────────────────
                                              fn resolve_color(&self, c: &Color, _term: &Terminal, _is_fg: bool) -> u32 {
                                                  match c {
                                                      Color::Default => {
                                                          if _is_fg { self.cfg.colors.fg } else { self.cfg.colors.bg }
                                                      }
                                                      Color::Ansi(n) => {
                                                          self.cfg.colors.ansi.get(*n as usize)
                                                          .copied()
                                                          .unwrap_or(self.cfg.colors.fg)
                                                      }
                                                      Color::Rgb(r,g,b) => argb(255, *r, *g, *b),
                                                  }
                                              }

                                              // ── Helpers ───────────────────────────────────────────────────────────────

                                              fn draw_string(&mut self, buf: &mut [u32], w: u32, h: i32,
                                                             x: i32, y: i32, s: &str, color: u32) {
                                                  let mut cx = x;
                                                  for c in s.chars() {
                                                      let g = self.atlas.get(c);
                                                      if g.w > 0 {
                                                          let gx = cx + g.bx;
                                                          let gy = y + self.atlas.baseline as i32 - (g.h as i32 + g.by);
                                                          blit_glyph(buf, w, h as u32, &self.atlas.pixels, self.atlas.tex_w,
                                                                     gx, gy, g.w, g.h, g.ax, g.ay, color);
                                                      }
                                                      cx += g.advance as i32;
                                                      if cx >= w as i32 { break; }
                                                  }
                                                             }

                                                             fn fill_circle(&self, buf: &mut [u32], w: u32, cx: i32, cy: i32, r: i32, color: u32) {
                                                                 for dy in -r..=r {
                                                                     for dx in -r..=r {
                                                                         if dx*dx + dy*dy <= r*r {
                                                                             let px = cx+dx; let py = cy+dy;
                                                                             if px>=0 && py>=0 && px<w as i32 {
                                                                                 let i = (py as u32 * w + px as u32) as usize;
                                                                                 if i < buf.len() { buf[i] = blend(buf[i], color, 200); }
                                                                             }
                                                                         }
                                                                     }
                                                                 }
                                                             }
              }

              const TITLE_BAR_H: u32 = 30;
