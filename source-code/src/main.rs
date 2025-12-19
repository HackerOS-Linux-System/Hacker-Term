use anyhow::Result;
use gdk::prelude::*;
use glib::object::{Cast, ObjectExt};
use glib::{Propagation, RegexCompileFlags};
use gtk::prelude::*;
use gtk::{Application, ApplicationWindow, EventControllerKey, GestureClick};
use pango::FontDescription;
use std::cell::RefCell;
use std::env;
use std::path::Path;
use std::rc::Rc;
use vte::{CursorBlinkMode, CursorShape, Format, PtyFlags, Regex, Terminal, TerminalExt, TerminalExtManual};
use gio::{Menu, SimpleAction, Cancellable};

struct TerminalTab {
    container: gtk::Box,
    terminal: Terminal,
    scrolled_window: gtk::ScrolledWindow,
}

impl TerminalTab {
    fn new(hacker_term: Rc<HackerTerm>) -> Self {
        let terminal = Terminal::new();
        terminal.set_allow_hyperlink(true);
        terminal.set_scrollback_lines(10000);
        terminal.set_mouse_autohide(true);
        terminal.set_cursor_blink_mode(CursorBlinkMode::On);
        terminal.set_cursor_shape(CursorShape::Block);
        terminal.set_font(Some(&FontDescription::from_string("Fira Code 14")));
        let palette: Vec<gdk::RGBA> = vec![
            gdk::RGBA::new(0.10, 0.10, 0.12, 1.0),
            gdk::RGBA::new(0.98, 0.40, 0.45, 1.0),
            gdk::RGBA::new(0.40, 0.85, 0.45, 1.0),
            gdk::RGBA::new(0.98, 0.75, 0.30, 1.0),
            gdk::RGBA::new(0.35, 0.60, 0.95, 1.0),
            gdk::RGBA::new(0.75, 0.45, 0.90, 1.0),
            gdk::RGBA::new(0.30, 0.80, 0.85, 1.0),
            gdk::RGBA::new(0.95, 0.95, 0.97, 1.0),
            gdk::RGBA::new(0.25, 0.25, 0.30, 1.0),
            gdk::RGBA::new(1.00, 0.55, 0.60, 1.0),
            gdk::RGBA::new(0.55, 0.95, 0.60, 1.0),
            gdk::RGBA::new(1.00, 0.85, 0.45, 1.0),
            gdk::RGBA::new(0.50, 0.75, 1.00, 1.0),
            gdk::RGBA::new(0.85, 0.60, 1.00, 1.0),
            gdk::RGBA::new(0.45, 0.90, 0.95, 1.0),
            gdk::RGBA::new(1.00, 1.00, 1.0, 1.0),
        ];
        let palette_refs: Vec<&gdk::RGBA> = palette.iter().collect();
        terminal.set_colors(
            Some(&gdk::RGBA::new(0.95, 0.95, 0.97, 1.0)),
            Some(&gdk::RGBA::new(0.05, 0.05, 0.10, 0.9)),
            &palette_refs,
        );
        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let shell = if cfg!(target_os = "linux") && Path::new("/bin/zsh").exists() {
            "/bin/zsh".to_string()
        } else {
            shell
        };
        let working_directory: Option<String> = env::var("HOME").ok();
        let argv = vec![shell.as_str()];
        let envv: Vec<String> = env::vars().map(|(k, v)| format!("{}={}", k, v)).collect();
        let envv_str: Vec<&str> = envv.iter().map(|s| s.as_str()).collect();
        terminal.spawn_async(
            PtyFlags::DEFAULT,
            working_directory.as_deref(),
            &argv,
            &envv_str,
            glib::SpawnFlags::DO_NOT_REAP_CHILD,
            || {},
            -1,
            None::<&Cancellable>,
            Box::new(|result| {
                if let Err(err) = result {
                    log::error!("Failed to spawn shell: {}", err);
                }
            }),
        );
        let scrolled_window = gtk::ScrolledWindow::new();
        scrolled_window.set_policy(gtk::PolicyType::Automatic, gtk::PolicyType::Automatic);
        scrolled_window.set_child(Some(&terminal));
        let container = gtk::Box::new(gtk::Orientation::Vertical, 0);
        container.append(&scrolled_window);
        scrolled_window.set_vexpand(true);
        scrolled_window.set_hexpand(true);
        let hacker_term_clone = hacker_term.clone();
        terminal.connect_child_exited(move |terminal, _status| {
            if let Some(scrolled) = terminal.parent() {
                if let Ok(scrolled) = scrolled.downcast::<gtk::ScrolledWindow>() {
                    if let Some(container) = scrolled.parent() {
                        if let Ok(container) = container.downcast::<gtk::Box>() {
                            if let Some(notebook) = container.parent() {
                                if let Ok(notebook) = notebook.downcast::<gtk::Notebook>() {
                                    if let Some(page) = notebook.page_num(&container) {
                                        notebook.remove_page(Some(page));
                                    }
                                    if notebook.n_pages() == 0 {
                                        hacker_term_clone.window.close();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        let hacker_term_clone = hacker_term.clone();
        let gesture = GestureClick::new();
        gesture.set_button(3);
        gesture.connect_pressed(move |_, n, x, y| {
            if n == 1 {
                let rect = gdk::Rectangle::new(x as i32, y as i32, 1, 1);
                hacker_term_clone.context_menu.set_pointing_to(Some(&rect));
                hacker_term_clone.context_menu.popup();
            }
        });
        terminal.add_controller(gesture);
        Self {
            container,
            terminal,
            scrolled_window,
        }
    }
}

struct HackerTerm {
    window: ApplicationWindow,
    notebook: gtk::Notebook,
    font_size: RefCell<i32>,
    fullscreened: RefCell<bool>,
    context_menu: gtk::PopoverMenu,
}

impl HackerTerm {
    fn new(app: &Application) -> Rc<Self> {
        let window = ApplicationWindow::new(app);
        window.set_title(Some("Hacker Term"));
        window.set_default_size(1200, 800);
        if let Some(settings) = gtk::Settings::default() {
            settings.set_property("gtk-application-prefer-dark-theme", true);
        }
        let css_provider = gtk::CssProvider::new();
        let css = r#"
        window {
        background-color: rgba(18, 18, 18, 0.95); /* Semi-transparent dark background */
        font-family: 'Fira Code', monospace;
        font-size: 14pt;
        border-radius: 16px; /* Softer corners */
        box-shadow: 0 0 30px rgba(160, 160, 255, 0.5); /* Softer pastel blue glow */
        transition: box-shadow 0.3s ease-in-out;
    }
    window:hover {
    box-shadow: 0 0 35px rgba(160, 160, 255, 0.6); /* Glow on hover for interactivity */
    }
    notebook {
    background-color: rgba(26, 26, 26, 0.9);
    border: none;
    }
    notebook tab {
    background-color: rgba(26, 26, 26, 0.9);
    color: #E0E0E0;
    padding: 8px 12px; /* Slightly smaller padding for tabs */
    border-radius: 12px 12px 0 0; /* Smoother tab corners */
    border-bottom: none;
    box-shadow: inset 0 -3px 0 #444444;
    transition: background-color 0.2s, box-shadow 0.2s;
    }
    notebook tab:checked {
    background-color: rgba(18, 18, 18, 0.95);
    box-shadow: inset 0 -3px 0 #A0A0FF; /* Pastel blue accent */
    }
    notebook tab button {
    background-color: transparent;
    border: none;
    color: #E0E0E0;
    font-size: 10pt; /* Smaller font for close button */
    padding: 2px 6px; /* Smaller padding for close button */
    margin-left: 4px;
    border-radius: 50%; /* Circular close button for elegance */
    transition: color 0.2s, background-color 0.2s;
    }
    notebook tab button:hover {
    color: #FF9999; /* Pastel red hover */
    background-color: rgba(255, 153, 153, 0.1); /* Light overlay on hover */
    }
    vte-terminal {
    background-color: rgba(18, 18, 18, 0.85); /* Semi-transparent terminal bg */
    color: #E0E0E0;
    padding: 20px;
    box-shadow: inset 0 5px 15px rgba(0, 0, 0, 0.7), inset 0 -5px 15px rgba(0, 0, 0, 0.7);
    background-image: linear-gradient(to bottom, rgba(26, 26, 26, 0.9), rgba(18, 18, 18, 0.85));
    border-radius: 0 0 16px 16px; /* Matching window corners */
    transition: background-color 0.3s;
    }
    /* Cursor with vibrant pulse animation */
    vte-terminal {
    -VteTerminal-cursor-blink: on;
    -VteTerminal-cursor-shape: block;
    -VteTerminal-cursor-color: #A0A0FF;
    }
    /* Scrollbar - colorful, with gradients and hover glow */
    scrollbar {
    background-color: transparent;
    border: none;
    min-width: 10px;
    }
    scrollbar slider {
    background: linear-gradient(to right, #333333, #444444);
    border-radius: 5px;
    min-width: 8px;
    box-shadow: 0 0 8px rgba(160, 160, 255, 0.4);
    transition: background 0.3s, box-shadow 0.3s;
    }
    scrollbar slider:hover {
    background: linear-gradient(to right, #A0A0FF, #9999FF);
    box-shadow: 0 0 12px rgba(160, 160, 255, 0.6);
    }
    /* Menu styling - vibrant with gradients and smooth transitions */
    menubar {
    background: linear-gradient(to bottom, #1a1a1a, #121212);
    color: #E0E0E0;
    padding: 8px;
    border-bottom: 1px solid #444444;
    }
    menu {
    background: linear-gradient(to bottom, #1a1a1a, #121212);
    color: #E0E0E0;
    border: 1px solid #444444;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.8);
    border-radius: 10px;
    }
    menuitem {
    padding: 10px 15px;
    transition: background-color 0.2s;
    }
    menuitem:hover {
    background-color: #9999FF; /* Pastel blue hover */
    color: #121212;
    border-radius: 6px;
    }
    /* Header bar - colorful accents with subtle gradient */
    headerbar {
    background: linear-gradient(to bottom, #1a1a1a, #121212);
    color: #E0E0E0;
    box-shadow: none;
    border-bottom: 1px solid #444444;
    padding: 0 12px;
    border-radius: 16px 16px 0 0; /* Matching window */
    }
    button {
    background: linear-gradient(to bottom, #333333, #444444);
    color: #E0E0E0;
    border: none;
    border-radius: 6px;
    padding: 8px 15px;
    transition: background 0.3s;
    }
    button:hover {
    background: linear-gradient(to bottom, #A0A0FF, #9999FF);
    color: #121212;
    }
    /* Additional refinements for smoother look */
    * {
    transition: all 0.2s ease-in-out;
    }
    "#;
        css_provider.load_from_data(css);
        if let Some(display) = gdk::Display::default() {
            gtk::style_context_add_provider_for_display(&display, &css_provider, gtk::STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
        let header_bar = gtk::HeaderBar::new();
        header_bar.set_show_title_buttons(true);
        header_bar.set_title_widget(Some(&gtk::Label::new(Some("Hacker Term"))));
        window.set_titlebar(Some(&header_bar));
        let self_rc = Rc::new(Self {
            window: window.clone(),
            notebook: gtk::Notebook::new(),
            font_size: RefCell::new(14),
            fullscreened: RefCell::new(false),
            context_menu: gtk::PopoverMenu::builder().build(),
        });
        let self_clone = self_rc.clone();
        let new_tab_button = gtk::Button::with_label("+");
        new_tab_button.connect_clicked(move |_| {
            self_clone.new_tab();
        });
        header_bar.pack_start(&new_tab_button);
        self_rc.notebook.set_tab_pos(gtk::PositionType::Top);
        self_rc.notebook.set_scrollable(true);
        self_rc.notebook.set_show_border(false);
        let self_clone = self_rc.clone();
        self_rc.notebook.connect_switch_page(move |_, _, _| {
            // on_switch_page
        });
        self_rc.window.set_child(Some(&self_rc.notebook));
        let self_clone = self_rc.clone();
        self_rc.window.connect_close_request(move |_| {
            // on_delete_event
            Propagation::Proceed
        });
        let key_controller = EventControllerKey::new();
        let self_clone = self_rc.clone();
        key_controller.connect_key_pressed(move |_, key, _, state| {
            if state.contains(gdk::ModifierType::CONTROL_MASK) {
                if let Some(name) = key.name() {
                    if name == "plus" {
                        self_clone.zoom_in();
                    } else if name == "minus" {
                        self_clone.zoom_out();
                    } else if name == "0" {
                        self_clone.zoom_normal();
                    } else if name == "f" {
                        self_clone.toggle_fullscreen();
                    }
                }
            }
            Propagation::Proceed
        });
        self_rc.window.add_controller(key_controller);
        // Context menu
        let menu_model = Menu::new();
        let action = SimpleAction::new("new_tab", None);
        let self_clone = self_rc.clone();
        action.connect_activate(move |_, _| {
            self_clone.new_tab();
        });
        self_rc.window.add_action(&action);
        menu_model.append(Some("New Tab"), Some("win.new_tab"));
        let action = SimpleAction::new("close_tab", None);
        let self_clone = self_rc.clone();
        action.connect_activate(move |_, _| {
            self_clone.close_current_tab();
        });
        self_rc.window.add_action(&action);
        menu_model.append(Some("Close Tab"), Some("win.close_tab"));
        let action = SimpleAction::new("copy", None);
        let self_clone = self_rc.clone();
        action.connect_activate(move |_, _| {
            self_clone.copy();
        });
        self_rc.window.add_action(&action);
        menu_model.append(Some("Copy"), Some("win.copy"));
        let action = SimpleAction::new("paste", None);
        let self_clone = self_rc.clone();
        action.connect_activate(move |_, _| {
            self_clone.paste();
        });
        self_rc.window.add_action(&action);
        menu_model.append(Some("Paste"), Some("win.paste"));
        let action = SimpleAction::new("select_all", None);
        let self_clone = self_rc.clone();
        action.connect_activate(move |_, _| {
            self_clone.select_all();
        });
        self_rc.window.add_action(&action);
        menu_model.append(Some("Select All"), Some("win.select_all"));
        let action = SimpleAction::new("clear", None);
        let self_clone = self_rc.clone();
        action.connect_activate(move |_, _| {
            self_clone.clear();
        });
        self_rc.window.add_action(&action);
        menu_model.append(Some("Clear"), Some("win.clear"));
        let action = SimpleAction::new("find", None);
        let self_clone = self_rc.clone();
        action.connect_activate(move |_, _| {
            self_clone.find();
        });
        self_rc.window.add_action(&action);
        menu_model.append(Some("Find"), Some("win.find"));
        let action = SimpleAction::new("zoom_in", None);
        let self_clone = self_rc.clone();
        action.connect_activate(move |_, _| {
            self_clone.zoom_in();
        });
        self_rc.window.add_action(&action);
        menu_model.append(Some("Zoom In"), Some("win.zoom_in"));
        let action = SimpleAction::new("zoom_out", None);
        let self_clone = self_rc.clone();
        action.connect_activate(move |_, _| {
            self_clone.zoom_out();
        });
        self_rc.window.add_action(&action);
        menu_model.append(Some("Zoom Out"), Some("win.zoom_out"));
        let action = SimpleAction::new("zoom_normal", None);
        let self_clone = self_rc.clone();
        action.connect_activate(move |_, _| {
            self_clone.zoom_normal();
        });
        self_rc.window.add_action(&action);
        menu_model.append(Some("Reset Zoom"), Some("win.zoom_normal"));
        self_rc.context_menu.set_menu_model(Some(&menu_model));
        self_rc.new_tab();
        self_rc
    }

    fn new_tab(self: &Rc<Self>) {
        let tab = TerminalTab::new(self.clone());
        self.notebook.append_page(&tab.container, None::<&gtk::Widget>);
        self.notebook.set_current_page(Some(self.notebook.n_pages() - 1));
    }

    fn close_current_tab(self: &Rc<Self>) {
        if let Some(page) = self.notebook.current_page() {
            self.notebook.remove_page(Some(page));
        }
    }

    fn copy(self: &Rc<Self>) {
        if let Some(terminal) = self.get_current_terminal() {
            terminal.copy_clipboard_format(Format::Text);
        }
    }

    fn paste(self: &Rc<Self>) {
        if let Some(terminal) = self.get_current_terminal() {
            terminal.paste_clipboard();
        }
    }

    fn select_all(self: &Rc<Self>) {
        if let Some(terminal) = self.get_current_terminal() {
            terminal.select_all();
        }
    }

    fn clear(self: &Rc<Self>) {
        if let Some(terminal) = self.get_current_terminal() {
            terminal.reset(true, true);
        }
    }

    fn find(self: &Rc<Self>) {
        let dialog = gtk::Dialog::with_buttons(
            Some("Find"),
            Some(&self.window),
            gtk::DialogFlags::MODAL,
            &[("Close", gtk::ResponseType::Close)],
        );
        let entry = gtk::Entry::new();
        dialog.content_area().append(&entry);
        dialog.present();
        let self_clone = self.clone();
        dialog.connect_response(move |dialog, response| {
            if response == gtk::ResponseType::Close {
                let search_text = entry.text().to_string();
                dialog.close();
                if !search_text.is_empty() {
                    if let Some(terminal) = self_clone.get_current_terminal() {
                        if let Ok(regex) = Regex::for_search(&search_text, RegexCompileFlags::DEFAULT.bits()) {
                            terminal.search_set_regex(Some(&regex), 0);
                            terminal.search_find_next();
                        }
                    }
                }
            }
        });
    }

    fn zoom_in(self: &Rc<Self>) {
        let mut font_size = self.font_size.borrow_mut();
        *font_size += 2;
        self.update_font_size(*font_size);
    }

    fn zoom_out(self: &Rc<Self>) {
        let mut font_size = self.font_size.borrow_mut();
        if *font_size > 4 {
            *font_size -= 2;
        }
        self.update_font_size(*font_size);
    }

    fn zoom_normal(self: &Rc<Self>) {
        let mut font_size = self.font_size.borrow_mut();
        *font_size = 14;
        self.update_font_size(*font_size);
    }

    fn update_font_size(self: &Rc<Self>, size: i32) {
        let font_desc = FontDescription::from_string(&format!("Fira Code {}", size));
        if let Some(terminal) = self.get_current_terminal() {
            terminal.set_font(Some(&font_desc));
        }
    }

    fn toggle_fullscreen(self: &Rc<Self>) {
        let mut fullscreened = self.fullscreened.borrow_mut();
        if *fullscreened {
            self.window.unfullscreen();
            *fullscreened = false;
        } else {
            self.window.fullscreen();
            *fullscreened = true;
        }
    }

    fn get_current_terminal(self: &Rc<Self>) -> Option<Terminal> {
        if let Some(page) = self.notebook.current_page() {
            if let Some(widget) = self.notebook.nth_page(Some(page)) {
                if let Ok(boxx) = widget.downcast::<gtk::Box>() {
                    if let Some(scrolled) = boxx.first_child() {
                        if let Ok(scwin) = scrolled.downcast::<gtk::ScrolledWindow>() {
                            if let Some(term) = scwin.child() {
                                return term.downcast::<Terminal>().ok();
                            }
                        }
                    }
                }
            }
        }
        None
    }
}

fn main() -> Result<()> {
    env_logger::init();
    let app = gtk::Application::new(Some("com.example.hackerterm"), Default::default());
    app.connect_activate(move |app| {
        let hacker_term = HackerTerm::new(app);
        hacker_term.window.present();
    });
    app.run_with_args(&env::args().collect::<Vec<_>>());
    Ok(())
}
