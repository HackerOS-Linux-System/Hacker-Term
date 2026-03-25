mod config;
mod font;
mod terminal;
mod pty;
mod canvas;
mod sixel;

slint::include_modules!();

use std::sync::{Arc, Mutex, atomic::{AtomicUsize, Ordering}};
use std::io::Read;
use std::time::{Duration, Instant};

use slint::{Image, SharedPixelBuffer, Timer, TimerMode, SharedString, ModelRc};
use slint::platform::Key;
use anyhow::Result;
use arboard::Clipboard;
use hk_parser::{HkConfig, HkValue, write_hk_file};
use indexmap::IndexMap;

use config::Config;
use canvas::Canvas;
use terminal::{Terminal, FlowControl};

struct Tab {
    term: Arc<Mutex<Terminal>>,
    writer: Arc<Mutex<pty::PtyWriter>>,
    _reader_thread: std::thread::JoinHandle<()>,
    changed_cells: Arc<Mutex<Vec<(u16, u16)>>>,
}

fn main() -> Result<()> {
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("warn")
    ).init();

    let cfg = Config::load().unwrap_or_else(|e| {
        eprintln!("Warning: Failed to load config: {}", e);
        Config::default()
    });

    let font_data = font::find_font();
    let atlas = font::Atlas::new(&font_data, cfg.general.font_size);
    let canvas_shared = Arc::new(Mutex::new(Canvas::new(cfg.clone(), atlas)));

    let tabs = Arc::new(Mutex::new(Vec::<Tab>::new()));
    let active_tab = Arc::new(AtomicUsize::new(0));

    if let Some(session) = load_session() {
        for (shell, cols, rows) in session {
            spawn_new_tab(&tabs, &active_tab, &cfg, Some((shell, cols, rows)))?;
        }
    } else {
        spawn_new_tab(&tabs, &active_tab, &cfg, None)?;
    }

    let ui = HackerTermWindow::new()?;
    ui.set_canvas_image(Image::from_rgba8(SharedPixelBuffer::new(1, 1)));

    // ---- Timer aktualizacji tytułów zakładek ----
    {
        let tabs_clone = tabs.clone();
        let active_clone = active_tab.clone();
        let ui_weak = ui.as_weak();
        let timer = Timer::default();
        timer.start(TimerMode::Repeated, Duration::from_millis(50), move || {
            let ui = match ui_weak.upgrade() {
                Some(u) => u,
                    None => return,
            };
            let guard = tabs_clone.lock().unwrap();
            let active = active_clone.load(Ordering::Relaxed);

            let titles: Vec<SharedString> = guard
            .iter()
            .map(|tab| tab.term.lock().unwrap().title.clone().into())
            .collect();
            ui.set_tab_titles(ModelRc::from(titles.as_slice()));
            ui.set_active_tab(active as i32);
        });
        std::mem::forget(timer);
    }

    // ---- Timer renderowania (60 fps) ----
    {
        let ui_weak = ui.as_weak();
        let tabs_clone = tabs.clone();
        let active_clone = active_tab.clone();
        let canvas_clone = canvas_shared.clone();
        let _cfg_clone = cfg.clone(); // celowo nieużywane, aby uniknąć ostrzeżenia

        let timer = Timer::default();
        timer.start(TimerMode::Repeated, Duration::from_millis(16), move || {
            let ui = match ui_weak.upgrade() {
                Some(u) => u,
                    None => return,
            };
            let sf = ui.window().scale_factor();
            let chrome_h = ((38.0 + 28.0 + 22.0) * sf) as u32;
            let win_w = (ui.get_win_width() * sf) as u32;
            let win_h = ((ui.get_win_height() * sf) as u32)
            .saturating_sub(chrome_h)
            .max(40);
            if win_w == 0 || win_h == 0 {
                return;
            }

            let active_idx = active_clone.load(Ordering::Relaxed);
            let mut tabs_guard = tabs_clone.lock().unwrap();
            if active_idx >= tabs_guard.len() {
                return;
            }
            let tab = &mut tabs_guard[active_idx];

            let term = tab.term.lock().unwrap();
            let mut canvas = canvas_clone.lock().unwrap();

            let (cols, rows) = canvas.grid_size(win_w, win_h);
            if cols != term.cols || rows != term.rows {
                drop(term);
                let mut term = tab.term.lock().unwrap();
                term.resize(cols, rows);
                drop(term);
                let _ = tab.writer.lock().unwrap().resize(cols, rows);
                let term = tab.term.lock().unwrap();
                let pixel_buf = canvas.render(&term, win_w, win_h);
                ui.set_canvas_image(Image::from_rgba8(pixel_buf));
            } else {
                let pixel_buf = canvas.render(&term, win_w, win_h);
                ui.set_canvas_image(Image::from_rgba8(pixel_buf));
            }

            // Wyczyść znaczniki zmienionych komórek – dodany średnik, aby tymczasowa wartość została zniszczona
            {
                if let Ok(mut changed) = tab.changed_cells.lock() {
                    changed.clear();
                }
            }; // <-- średnik zapewnia wcześniejsze zwolnienie
        });
        std::mem::forget(timer);
    }

    // ---- Obsługa klawiatury ----
    let last_key_time = Arc::new(Mutex::new(Instant::now()));
    let clipboard = Arc::new(Mutex::new(Clipboard::new().ok()));

    {
        let tabs_clone = tabs.clone();
        let active_clone = active_tab.clone();
        let cfg_clone = cfg.clone();
        let last_key_time = last_key_time.clone();
        let clipboard = clipboard.clone();
        let ui_weak = ui.as_weak();

        ui.on_key_input(move |text, ctrl, alt, shift| {
            let mut last = last_key_time.lock().unwrap();
            let elapsed = last.elapsed().as_millis();
            if elapsed < cfg_clone.general.throttle_keyboard_ms as u128 {
                return;
            }
            *last = Instant::now();

            let key_combo = format!(
                "{}{}{}{}",
                if ctrl { "Ctrl+" } else { "" },
                    if alt { "Alt+" } else { "" },
                        if shift { "Shift+" } else { "" },
                            text.as_str()
            );

            if cfg_clone.keybindings.copy.contains(&key_combo) {
                let active = active_clone.load(Ordering::Relaxed);
                let guard = tabs_clone.lock().unwrap();
                if let Some(tab) = guard.get(active) {
                    let selected = tab.term.lock().unwrap().get_selected_text();
                    if let Some(clip) = clipboard.lock().unwrap().as_mut() {
                        let _ = clip.set_text(selected);
                    }
                }
                return;
            }

            if cfg_clone.keybindings.paste.contains(&key_combo) {
                if let Some(clip) = clipboard.lock().unwrap().as_mut() {
                    if let Ok(text) = clip.get_text() {
                        let active = active_clone.load(Ordering::Relaxed);
                        let guard = tabs_clone.lock().unwrap();
                        if let Some(tab) = guard.get(active) {
                            let _ = tab.writer.lock().unwrap().write(text.as_bytes());
                            tab.term.lock().unwrap().clear_selection();
                        }
                    }
                }
                return;
            }

            if cfg_clone.keybindings.scroll_up.contains(&key_combo) {
                let active = active_clone.load(Ordering::Relaxed);
                let guard = tabs_clone.lock().unwrap();
                if let Some(tab) = guard.get(active) {
                    tab.term.lock().unwrap().scroll_view(-5);
                }
                return;
            }
            if cfg_clone.keybindings.scroll_down.contains(&key_combo) {
                let active = active_clone.load(Ordering::Relaxed);
                let guard = tabs_clone.lock().unwrap();
                if let Some(tab) = guard.get(active) {
                    tab.term.lock().unwrap().scroll_view(5);
                }
                return;
            }

            if cfg_clone.keybindings.new_tab.contains(&key_combo) {
                if let Some(ui) = ui_weak.upgrade() {
                    let _ = spawn_new_tab(&tabs_clone, &active_clone, &cfg_clone, None);
                    ui.set_canvas_image(Image::from_rgba8(SharedPixelBuffer::new(1, 1)));
                }
                return;
            }

            if cfg_clone.keybindings.close_tab.contains(&key_combo) {
                let mut guard = tabs_clone.lock().unwrap();
                let active = active_clone.load(Ordering::Relaxed);
                if active < guard.len() && guard.len() > 1 {
                    guard.remove(active);
                    let new_active = if active >= guard.len() {
                        guard.len() - 1
                    } else {
                        active
                    };
                    active_clone.store(new_active, Ordering::Relaxed);
                    if let Some(ui) = ui_weak.upgrade() {
                        ui.set_canvas_image(Image::from_rgba8(SharedPixelBuffer::new(1, 1)));
                    }
                }
                return;
            }

            let bytes = map_key(&text, ctrl, alt);
            if !bytes.is_empty() {
                let active = active_clone.load(Ordering::Relaxed);
                let guard = tabs_clone.lock().unwrap();
                if let Some(tab) = guard.get(active) {
                    let mut term = tab.term.lock().unwrap();
                    if term.flow_control == FlowControl::Running {
                        let _ = tab.writer.lock().unwrap().write(&bytes);
                        term.scroll_off = 0;
                    }
                }
            }
        });
    }

    // ---- Obsługa myszy (zaznaczanie) ----
    let drag_start = Arc::new(Mutex::new(None));

    // Pobieramy wymiary komórki raz, aby nie klonować atlasu
    let (cell_w, cell_h) = {
        let canvas = canvas_shared.lock().unwrap();
        (canvas.atlas.cell_w, canvas.atlas.cell_h)
    };

    let drag_start1 = drag_start.clone();
    let active_tab1 = active_tab.clone();
    let tabs1 = tabs.clone();
    let cfg1 = cfg.clone();

    ui.on_mouse_pressed(move |x, y, button| {
        if button == 1 {
            let active = active_tab1.load(Ordering::Relaxed);
            let guard = tabs1.lock().unwrap();
            if let Some(tab) = guard.get(active) {
                let (col, row) = screen_to_cell(x, y, &cfg1.general, cell_w, cell_h);
                tab.term.lock().unwrap().start_selection(col, row);
                *drag_start1.lock().unwrap() = Some((col, row));
            }
        }
    });

    let drag_start2 = drag_start.clone();
    let active_tab2 = active_tab.clone();
    let tabs2 = tabs.clone();
    let cfg2 = cfg.clone();

    ui.on_mouse_moved(move |x, y| {
        if let Some((_start_x, _start_y)) = *drag_start2.lock().unwrap() {
            let active = active_tab2.load(Ordering::Relaxed);
            let guard = tabs2.lock().unwrap();
            if let Some(tab) = guard.get(active) {
                let (col, row) = screen_to_cell(x, y, &cfg2.general, cell_w, cell_h);
                tab.term.lock().unwrap().update_selection(col, row);
            }
        }
    });

    let clipboard2 = clipboard.clone();
    let active_tab3 = active_tab.clone();
    let tabs3 = tabs.clone();
    let drag_start3 = drag_start.clone();

    ui.on_mouse_released(move |_, _| {
        *drag_start3.lock().unwrap() = None;
        if let Some(clip) = clipboard2.lock().unwrap().as_mut() {
            let active = active_tab3.load(Ordering::Relaxed);
            let guard = tabs3.lock().unwrap();
            if let Some(tab) = guard.get(active) {
                let text = tab.term.lock().unwrap().get_selected_text();
                if !text.is_empty() {
                    let _ = clip.set_text(text);
                }
            }
        }
    });

    // ---- Przełączanie zakładek ----
    let active_clone_tab = active_tab.clone();
    ui.on_switch_tab(move |idx| {
        if idx >= 0 {
            active_clone_tab.store(idx as usize, Ordering::Relaxed);
        }
    });

    // ---- Zamykanie zakładki przez X ----
    let tabs_close = tabs.clone();
    let active_close = active_tab.clone();
    ui.on_close_tab(move |idx| {
        let mut guard = tabs_close.lock().unwrap();
        if idx < 0 || idx as usize >= guard.len() {
            return;
        }
        let idx = idx as usize;
        guard.remove(idx);
        let mut active = active_close.load(Ordering::Relaxed);
        if active >= idx && active > 0 {
            active -= 1;
        } else if active == idx && guard.is_empty() {
            save_session(&guard);
            std::process::exit(0);
        }
        active_close.store(active, Ordering::Relaxed);
    });

    // ---- Nowa zakładka przez przycisk + ----
    let tabs_new = tabs.clone();
    let active_new = active_tab.clone();
    let cfg_new = cfg.clone();
    ui.on_new_tab(move || {
        let _ = spawn_new_tab(&tabs_new, &active_new, &cfg_new, None);
    });

    // ---- Przeciąganie zakładek ----
    let tabs_drag = tabs.clone();
    let active_drag = active_tab.clone();
    ui.on_move_tab(move |from, to| {
        let mut guard = tabs_drag.lock().unwrap();
        if from >= 0 && to >= 0 && (from as usize) < guard.len() && (to as usize) < guard.len() && from != to {
            let tab = guard.remove(from as usize);
            guard.insert(to as usize, tab);
            let active = active_drag.load(Ordering::Relaxed);
            let new_active = if active == from as usize {
                to as usize
            } else if active > from as usize && active <= to as usize {
                active - 1
            } else if active < from as usize && active >= to as usize {
                active + 1
            } else {
                active
            };
            active_drag.store(new_active, Ordering::Relaxed);
        }
    });

    // ---- Zapisz sesję przy wyjściu (Ctrl+C) ----
    {
        let tabs_clone = tabs.clone();
        ctrlc::set_handler(move || {
            let guard = tabs_clone.lock().unwrap();
            save_session(&guard);
            std::process::exit(0);
        }).ok();
    }

    ui.run()?;
    Ok(())
}

fn spawn_new_tab(
    tabs: &Arc<Mutex<Vec<Tab>>>,
    active: &Arc<AtomicUsize>,
    cfg: &Config,
    restore: Option<(String, u16, u16)>,
) -> Result<()> {
    let (cols, rows) = restore.as_ref().map(|(_, c, r)| (*c, *r)).unwrap_or((80, 24));
    let shell = restore.map(|(s, _, _)| s).unwrap_or_else(|| cfg.general.shell.clone());

    let (mut reader, writer) = pty::spawn(&shell, cols, rows)?;
    let term = Arc::new(Mutex::new(Terminal::new(cols, rows)));
    term.lock().unwrap().set_sixel_config(cfg.sixel.enabled, cfg.sixel.max_width, cfg.sixel.max_height);

    let term_clone = term.clone();
    let changed_cells = Arc::new(Mutex::new(Vec::new()));
    let changed_cells_clone = changed_cells.clone();

    let reader_thread = std::thread::spawn(move || {
        let mut buf = vec![0u8; 8192];
        loop {
            match reader.inner.read(&mut buf) {
                Ok(0) | Err(_) => break,
                                           Ok(n) => {
                                               let mut term = term_clone.lock().unwrap();
                                               term.feed(&buf[..n]);
                                               let (cols, rows) = (term.cols, term.rows);
                                               let mut changed = changed_cells_clone.lock().unwrap();
                                               changed.clear();
                                               for y in 0..rows {
                                                   for x in 0..cols {
                                                       changed.push((x, y));
                                                   }
                                               }
                                           }
            }
        }
    });

    let tab = Tab {
        term,
        writer,
        _reader_thread: reader_thread,
        changed_cells,
    };

    let mut guard = tabs.lock().unwrap();
    guard.push(tab);
    active.store(guard.len() - 1, Ordering::Relaxed);
    Ok(())
}

fn screen_to_cell(x: f32, y: f32, general: &config::GeneralConfig, cell_w: u32, cell_h: u32) -> (u16, u16) {
    let pad = general.padding as f32;
    let cw = cell_w as f32;
    let ch = cell_h as f32;
    let col = ((x - pad) / cw).floor().max(0.0) as u16;
    let row = ((y - pad) / ch).floor().max(0.0) as u16;
    (col, row)
}

fn map_key(text: &SharedString, ctrl: bool, alt: bool) -> Vec<u8> {
    let table: Vec<(SharedString, &'static [u8])> = vec![
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
    ];

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
            if let Some(byte) = b {
                return vec![byte];
            }
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

fn save_session(tabs: &[Tab]) {
    let mut session = HkConfig::new();
    let mut sessions = Vec::new();
    for tab in tabs {
        let term = tab.term.lock().unwrap();
        let shell = std::env::var("SHELL").unwrap_or("/bin/zsh".into());
        let mut map = IndexMap::new();
        map.insert("shell".into(), HkValue::String(shell));
        map.insert("cols".into(), HkValue::Number(term.cols as f64));
        map.insert("rows".into(), HkValue::Number(term.rows as f64));
        sessions.push(HkValue::Map(map));
    }
    session.insert("session".into(), HkValue::Array(sessions));
    let path = dirs::home_dir()
    .unwrap()
    .join(".config/hacker-term/session.hk");
    let _ = write_hk_file(path, &session);
}

fn load_session() -> Option<Vec<(String, u16, u16)>> {
    let path = dirs::home_dir()
    .unwrap()
    .join(".config/hacker-term/session.hk");
    if !path.exists() {
        return None;
    }
    let config = hk_parser::load_hk_file(&path).ok()?;
    let session = config.get("session")?.as_array().ok()?;
    let mut result = Vec::new();
    for item in session {
        let map = item.as_map().ok()?;
        let shell = map.get("shell")?.as_string().ok()?;
        let cols = map.get("cols")?.as_number().ok()? as u16;
        let rows = map.get("rows")?.as_number().ok()? as u16;
        result.push((shell, cols, rows));
    }
    Some(result)
}
