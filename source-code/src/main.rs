mod config;
mod font;
mod terminal;
mod pty;
mod canvas;

slint::include_modules!();

use std::sync::{Arc, Mutex};
use std::io::Read;
use std::time::Duration;

use slint::{Image, SharedPixelBuffer, Timer, TimerMode, SharedString, ModelRc};
use slint::platform::Key;
use anyhow::Result;

use config::Config;
use canvas::Canvas;
use terminal::Terminal;

struct Tab {
    term:   Arc<Mutex<Terminal>>,
    writer: Arc<Mutex<pty::PtyWriter>>,
    _reader_thread: std::thread::JoinHandle<()>,
}

fn main() -> Result<()> {
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("warn")
    ).init();

    let cfg = Config::default();

    let font_data = font::find_font();
    let atlas = font::Atlas::new(&font_data, cfg.font_size);
    let canvas_shared = Arc::new(Mutex::new(Canvas::new(cfg.clone(), atlas)));

    let tabs = Arc::new(Mutex::new(Vec::<Tab>::new()));
    let active_tab = Arc::new(Mutex::new(0usize));

    spawn_new_tab(&tabs, &active_tab, &cfg)?;

    let ui = HackerTermWindow::new()?;
    ui.set_canvas_image(Image::from_rgba8(SharedPixelBuffer::new(1, 1)));

    // Aktualizacja tytułów zakładek
    {
        let tabs_clone = tabs.clone();
        let active_clone = active_tab.clone();
        let ui_weak = ui.as_weak();
        let timer = Timer::default();
        timer.start(TimerMode::Repeated, Duration::from_millis(50), move || {
            let ui = match ui_weak.upgrade() { Some(u) => u, None => return };
            let guard = tabs_clone.lock().unwrap();
            let active = *active_clone.lock().unwrap();

            let titles: Vec<SharedString> = guard.iter()
            .map(|tab| tab.term.lock().unwrap().title.clone().into())
            .collect();
            ui.set_tab_titles(ModelRc::from(titles.as_slice()));
            ui.set_active_tab(active as i32);
        });
        std::mem::forget(timer);
    }

    // Renderer 60 fps
    {
        let ui_weak = ui.as_weak();
        let tabs_clone = tabs.clone();
        let active_clone = active_tab.clone();
        let canvas_clone = canvas_shared.clone();

        let timer = Timer::default();
        timer.start(TimerMode::Repeated, Duration::from_millis(16), move || {
            let ui = match ui_weak.upgrade() { Some(u) => u, None => return };
            let sf = ui.window().scale_factor();
            let chrome_h = ((38.0 + 28.0 + 22.0) * sf) as u32;
            let cav_w = (ui.get_win_width() * sf) as u32;
            let cav_h = ((ui.get_win_height() * sf) as u32)
            .saturating_sub(chrome_h).max(40);
            let cav_w = cav_w.max(40);

            let active_idx = *active_clone.lock().unwrap();
            let tabs_guard = tabs_clone.lock().unwrap();
            if active_idx >= tabs_guard.len() {
                return;
            }
            let current_term = &tabs_guard[active_idx].term;

            let (cols, rows) = canvas_clone.lock().unwrap().grid_size(cav_w, cav_h);

            for tab in tabs_guard.iter() {
                let mut term = tab.term.lock().unwrap();
                if cols != term.cols || rows != term.rows {
                    term.resize(cols, rows);
                    drop(term);
                    tab.writer.lock().unwrap().resize(cols, rows).ok();
                }
            }

            let pixel_buf = {
                let term = current_term.lock().unwrap();
                let mut canvas = canvas_clone.lock().unwrap();
                canvas.render(&term, cav_w, cav_h)
            };

            ui.set_canvas_image(Image::from_rgba8(pixel_buf));
        });
        std::mem::forget(timer);
    }

    // Obsługa klawiatury
    {
        let tabs_clone = tabs.clone();
        let active_clone = active_tab.clone();
        let cfg_clone = cfg.clone();
        let ui_weak = ui.as_weak();

        ui.on_key_input(move |text, ctrl, alt, _shift| {
            if ctrl && text.as_str() == "t" {
                if let Some(ui) = ui_weak.upgrade() {
                    spawn_new_tab(&tabs_clone, &active_clone, &cfg_clone).ok();
                    ui.set_canvas_image(Image::from_rgba8(SharedPixelBuffer::new(1, 1)));
                }
                return;
            }
            if ctrl && text.as_str() == "w" {
                let mut tabs_guard = tabs_clone.lock().unwrap();
                let mut active = *active_clone.lock().unwrap();
                if active < tabs_guard.len() && tabs_guard.len() > 1 {
                    tabs_guard.remove(active);
                    if active >= tabs_guard.len() {
                        active = tabs_guard.len() - 1;
                    }
                    *active_clone.lock().unwrap() = active;
                    if let Some(ui) = ui_weak.upgrade() {
                        ui.set_canvas_image(Image::from_rgba8(SharedPixelBuffer::new(1, 1)));
                    }
                }
                return;
            }

            let active = *active_clone.lock().unwrap();
            let tabs_guard = tabs_clone.lock().unwrap();
            if let Some(tab) = tabs_guard.get(active) {
                let bytes = map_key(&text, ctrl, alt);
                if !bytes.is_empty() {
                    tab.writer.lock().unwrap().write(&bytes).ok();
                    tab.term.lock().unwrap().scroll_off = 0;
                }
            }
        });
    }

    // Przełączanie zakładek
    {
        let active_clone = active_tab.clone();
        ui.on_switch_tab(move |idx| {
            if idx >= 0 {
                *active_clone.lock().unwrap() = idx as usize;
            }
        });
    }

    // Zamykanie zakładki przez X
    {
        let tabs_clone = tabs.clone();
        let active_clone = active_tab.clone();
        ui.on_close_tab(move |idx| {
            let mut tabs_guard = tabs_clone.lock().unwrap();
            if idx < 0 || idx as usize >= tabs_guard.len() {
                return;
            }
            let idx = idx as usize;
            tabs_guard.remove(idx);
            let mut active = *active_clone.lock().unwrap();
            if active >= idx && active > 0 {
                active -= 1;
            } else if active == idx && tabs_guard.is_empty() {
                std::process::exit(0);
            }
            *active_clone.lock().unwrap() = active;
        });
    }

    // Nowa zakładka przez przycisk +
    {
        let tabs_clone = tabs.clone();
        let active_clone = active_tab.clone();
        let cfg_clone = cfg.clone();
        ui.on_new_tab(move || {
            spawn_new_tab(&tabs_clone, &active_clone, &cfg_clone).ok();
        });
    }

    // Scroll – każda akcja dostaje własne klony zmiennych
    {
        let tabs_clone = tabs.clone();
        let active_clone = active_tab.clone();
        ui.on_scroll_up(move || {
            let active = *active_clone.lock().unwrap();
            let guard = tabs_clone.lock().unwrap();
            if let Some(tab) = guard.get(active) {
                tab.term.lock().unwrap().scroll_view(-3);
            }
        });
    }
    {
        let tabs_clone = tabs.clone();
        let active_clone = active_tab.clone();
        ui.on_scroll_down(move || {
            let active = *active_clone.lock().unwrap();
            let guard = tabs_clone.lock().unwrap();
            if let Some(tab) = guard.get(active) {
                tab.term.lock().unwrap().scroll_view(3);
            }
        });
    }

    ui.run()?;
    Ok(())
}

fn spawn_new_tab(
    tabs: &Arc<Mutex<Vec<Tab>>>,
    active: &Arc<Mutex<usize>>,
    cfg: &Config,
) -> Result<()> {
    // reader musi być mutable, aby można było wywołać .read()
    let (mut reader, writer) = pty::spawn(&cfg.shell, 80, 24)?;
    let term = Arc::new(Mutex::new(Terminal::new(80, 24)));

    let term_clone = term.clone();
    let reader_thread = std::thread::spawn(move || {
        let mut buf = vec![0u8; 8192];
        loop {
            match reader.inner.read(&mut buf) {
                Ok(0) | Err(_) => break,
                                           Ok(n) => {
                                               term_clone.lock().unwrap().feed(&buf[..n]);
                                           }
            }
        }
    });

    let tab = Tab {
        term,
        writer, // writer jest już Arc<Mutex<PtyWriter>>
        _reader_thread: reader_thread,
    };

    let mut tabs_guard = tabs.lock().unwrap();
    tabs_guard.push(tab);
    *active.lock().unwrap() = tabs_guard.len() - 1;

    Ok(())
}

fn make_key_table() -> Vec<(SharedString, &'static [u8])> {
    vec![
        (Key::Return.into(),     b"\r"),
        (Key::Backspace.into(),  b"\x7f"),
        (Key::Delete.into(),     b"\x1b[3~"),
        (Key::Escape.into(),     b"\x1b"),
        (Key::Tab.into(),        b"\t"),
        (Key::UpArrow.into(),    b"\x1b[A"),
        (Key::DownArrow.into(),  b"\x1b[B"),
        (Key::RightArrow.into(), b"\x1b[C"),
        (Key::LeftArrow.into(),  b"\x1b[D"),
        (Key::Home.into(),       b"\x1b[H"),
        (Key::End.into(),        b"\x1b[F"),
        (Key::PageUp.into(),     b"\x1b[5~"),
        (Key::PageDown.into(),   b"\x1b[6~"),
        (Key::Insert.into(),     b"\x1b[2~"),
        (Key::F1.into(),         b"\x1bOP"),
        (Key::F2.into(),         b"\x1bOQ"),
        (Key::F3.into(),         b"\x1bOR"),
        (Key::F4.into(),         b"\x1bOS"),
        (Key::F5.into(),         b"\x1b[15~"),
        (Key::F6.into(),         b"\x1b[17~"),
        (Key::F7.into(),         b"\x1b[18~"),
        (Key::F8.into(),         b"\x1b[19~"),
        (Key::F9.into(),         b"\x1b[20~"),
        (Key::F10.into(),        b"\x1b[21~"),
        (Key::F11.into(),        b"\x1b[23~"),
        (Key::F12.into(),        b"\x1b[24~"),
    ]
}

fn map_key(text: &SharedString, ctrl: bool, alt: bool) -> Vec<u8> {
    let table = make_key_table();
    for (k, seq) in &table {
        if text == k {
            return seq.to_vec();
        }
    }

    let s = text.as_str();

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

    if alt && !s.is_empty() {
        let mut v = vec![0x1b];
        v.extend_from_slice(s.as_bytes());
        return v;
    }

    if !s.is_empty() {
        let b = s.as_bytes();
        if b.iter().all(|&x| x >= 0x20 || x == b'\r' || x == b'\t') {
            return b.to_vec();
        }
    }

    Vec::new()
}
