mod config;
mod font;
mod terminal;
mod pty;
mod canvas;

slint::include_modules!();

use std::sync::{Arc, Mutex};
use std::io::Read;
use std::time::Duration;

use slint::{Image, SharedPixelBuffer, Rgba8Pixel, Timer, TimerMode, SharedString};
use slint::platform::Key;
use anyhow::Result;

use config::Config;
use canvas::Canvas;
use terminal::Terminal;

fn main() -> Result<()> {
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("warn")
    ).init();

    let cfg = Config::default();

    let font_data = font::find_font();
    let atlas     = font::Atlas::new(&font_data, cfg.font_size);
    let canvas    = Arc::new(Mutex::new(Canvas::new(cfg.clone(), atlas)));
    let terminal  = Arc::new(Mutex::new(Terminal::new(80, 24)));

    let (pty_reader, pty_writer) = pty::spawn(&cfg.shell, 80, 24)
    .expect("Failed to spawn shell — is zsh installed?");

    let ui = NeonTermWindow::new()?;
    ui.set_canvas_image(Image::from_rgba8(SharedPixelBuffer::<Rgba8Pixel>::new(1, 1)));

    // PTY reader thread
    {
        let term_r  = terminal.clone();
        let mut rdr = pty_reader;
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 8192];
            loop {
                match rdr.inner.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                           Ok(n) => { term_r.lock().unwrap().feed(&buf[..n]); }
                }
            }
        });
    }

    // 60 fps render timer
    {
        let ui_w     = ui.as_weak();
        let term_r   = terminal.clone();
        let canvas_r = canvas.clone();
        let writer_r = pty_writer.clone();

        let timer = Timer::default();
        timer.start(TimerMode::Repeated, Duration::from_millis(16), move || {
            let ui = match ui_w.upgrade() { Some(u) => u, None => return };

            let sf       = ui.window().scale_factor();
            let chrome_h = ((38.0 + 28.0 + 22.0) * sf) as u32;
            let cav_w    = (ui.get_win_width()  * sf) as u32;
            let cav_h    = ((ui.get_win_height() * sf) as u32)
            .saturating_sub(chrome_h).max(40);
            let cav_w    = cav_w.max(40);

            {
                let (cols, rows) = canvas_r.lock().unwrap().grid_size(cav_w, cav_h);
                let mut term = term_r.lock().unwrap();
                if cols != term.cols || rows != term.rows {
                    term.resize(cols, rows);
                    drop(term);
                    writer_r.lock().unwrap().resize(cols, rows).ok();
                }
            }

            let pixel_buf = {
                let term = term_r.lock().unwrap();
                let mut c = canvas_r.lock().unwrap();
                c.render(&term, cav_w, cav_h)
            };

            ui.set_canvas_image(Image::from_rgba8(pixel_buf));

            let (title, scrolled, off) = {
                let t = term_r.lock().unwrap();
                (t.title.clone(), t.scroll_off > 0, t.scroll_off)
            };
            ui.set_shell_title(title.into());
            ui.set_is_scrolled(scrolled);
            ui.set_scroll_lines(off);
        });
        std::mem::forget(timer);
    }

    // Keyboard
    {
        let writer_k = pty_writer.clone();
        let term_k   = terminal.clone();

        ui.on_key_input(move |text, ctrl, alt, _shift| {
            let bytes = map_key(&text, ctrl, alt);
            if !bytes.is_empty() {
                writer_k.lock().unwrap().write(&bytes).ok();
                term_k.lock().unwrap().scroll_off = 0;
            }
        });
    }

    { let t = terminal.clone(); ui.on_scroll_up(move   || { t.lock().unwrap().scroll_view(-3); }); }
    { let t = terminal.clone(); ui.on_scroll_down(move || { t.lock().unwrap().scroll_view(3);  }); }

    ui.run()?;
    Ok(())
}

// ── Key mapper ────────────────────────────────────────────────────────────────
// Key implements From<Key> for char (not the reverse).
// We convert each Key variant → SharedString and compare with event.text.
fn make_key_table() -> Vec<(SharedString, &'static [u8])> {
    // Each entry: (Slint SharedString for the key, ANSI bytes to send)
    vec![
        (Key::Return.into(),     b"\r"         as &[u8]),
        (Key::Backspace.into(),  b"\x7f"       as &[u8]),
        (Key::Delete.into(),     b"\x1b[3~"    as &[u8]),
        (Key::Escape.into(),     b"\x1b"       as &[u8]),
        (Key::Tab.into(),        b"\t"         as &[u8]),
        (Key::UpArrow.into(),    b"\x1b[A"     as &[u8]),
        (Key::DownArrow.into(),  b"\x1b[B"     as &[u8]),
        (Key::RightArrow.into(), b"\x1b[C"     as &[u8]),
        (Key::LeftArrow.into(),  b"\x1b[D"     as &[u8]),
        (Key::Home.into(),       b"\x1b[H"     as &[u8]),
        (Key::End.into(),        b"\x1b[F"     as &[u8]),
        (Key::PageUp.into(),     b"\x1b[5~"    as &[u8]),
        (Key::PageDown.into(),   b"\x1b[6~"    as &[u8]),
        (Key::Insert.into(),     b"\x1b[2~"    as &[u8]),
        (Key::F1.into(),         b"\x1bOP"     as &[u8]),
        (Key::F2.into(),         b"\x1bOQ"     as &[u8]),
        (Key::F3.into(),         b"\x1bOR"     as &[u8]),
        (Key::F4.into(),         b"\x1bOS"     as &[u8]),
        (Key::F5.into(),         b"\x1b[15~"   as &[u8]),
        (Key::F6.into(),         b"\x1b[17~"   as &[u8]),
        (Key::F7.into(),         b"\x1b[18~"   as &[u8]),
        (Key::F8.into(),         b"\x1b[19~"   as &[u8]),
        (Key::F9.into(),         b"\x1b[20~"   as &[u8]),
        (Key::F10.into(),        b"\x1b[21~"   as &[u8]),
        (Key::F11.into(),        b"\x1b[23~"   as &[u8]),
        (Key::F12.into(),        b"\x1b[24~"   as &[u8]),
    ]
}

// Lazily built table lives for the duration of the callback closure
fn map_key(text: &SharedString, ctrl: bool, alt: bool) -> Vec<u8> {
    // Check special keys table
    let table = make_key_table();
    for (k, seq) in &table {
        if text == k { return seq.to_vec(); }
    }

    let s = text.as_str();

    // Ctrl+letter → control byte
    if ctrl {
        if let Some(c) = s.chars().next() {
            if c.is_ascii_alphabetic() {
                return vec![c.to_ascii_lowercase() as u8 - b'a' + 1];
            }
            let b: Option<u8> = match c {
                '@' => Some(0x00), '[' => Some(0x1b), '\\' => Some(0x1c),
                ']' => Some(0x1d), '^' => Some(0x1e), '_'  => Some(0x1f),
                '2' => Some(0x00), '3' => Some(0x1b), '4'  => Some(0x1c),
                '5' => Some(0x1d), '6' => Some(0x1e), '7'  => Some(0x1f),
                '8' => Some(0x7f), _ => None,
            };
            if let Some(byte) = b { return vec![byte]; }
        }
    }

    // Alt+key → ESC prefix
    if alt && !s.is_empty() {
        let mut v = vec![0x1bu8];
        v.extend_from_slice(s.as_bytes());
        return v;
    }

    // Plain printable
    if !s.is_empty() {
        let b = s.as_bytes();
        // Skip lone control/modifier chars
        if b.iter().all(|&x| x >= 0x20 || x == b'\r' || x == b'\t') {
            return b.to_vec();
        }
    }

    Vec::new()
}
