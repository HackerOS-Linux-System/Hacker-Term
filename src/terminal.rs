use gio::Cancellable;
use glib::{clone::Downgrade, SpawnFlags};
use gtk::prelude::*;
use gtk::{Box as GtkBox, Button, Label, Orientation, Overlay, ScrolledWindow};
use vte::{PtyFlags, Terminal, CursorShape};
use vte::prelude::{TerminalExt, TerminalExtManual};
use webkitgtk6::prelude::WebViewExt;
use which::which;
use crate::webview::setup_webview;

pub fn add_tab(notebook: &gtk::Notebook) {
    // Create overlay for terminal and webview
    let overlay = Overlay::new();

    // Create VTE Terminal
    let terminal = Terminal::new();
    terminal.set_hexpand(true);
    terminal.set_vexpand(true);
    terminal.set_allow_hyperlink(true);
    terminal.set_cursor_shape(CursorShape::Ibeam); // Modern cursor

    // Determine shell: prefer zsh, fallback to bash
    let shell = if which("zsh").is_ok() {
        "/bin/zsh".to_string()
    } else {
        "/bin/bash".to_string()
    };

    // Spawn the shell in the terminal
    terminal.spawn_async(
        PtyFlags::DEFAULT,
        None,
        &[&shell],
        &[],
        SpawnFlags::DEFAULT,
        || {},
        -1,
        None::<&Cancellable>,
        |_| {},
    );

    // Add terminal to overlay
    overlay.set_child(Some(&terminal));

    // Create and setup WebView for animations
    let webview = setup_webview();
    overlay.add_overlay(&webview);

    // Make webview non-interactive
    webview.set_sensitive(false);
    webview.set_can_focus(false);

    // Connect terminal commit to trigger particles
    let webview_clone = webview.clone();
    terminal.connect_commit(move |_, text, _| {
        if !text.is_empty() {
            webview_clone.evaluate_javascript("spawnParticles(80);", None, None, None::<&Cancellable>, |_| {}); // More particles for effect
        }
    });

    // Wrap in ScrolledWindow
    let scrolled = ScrolledWindow::new();
    scrolled.set_child(Some(&overlay));
    scrolled.set_hexpand(true);
    scrolled.set_vexpand(true);
    scrolled.set_policy(gtk::PolicyType::Automatic, gtk::PolicyType::Automatic);

    // Create tab label with close button
    let tab_box = GtkBox::new(Orientation::Horizontal, 4);
    let label = Label::new(Some("Hackeros Term"));
    tab_box.append(&label);

    let close_button = Button::builder()
    .icon_name("window-close-symbolic")
    .css_classes(vec!["flat".to_string()])
    .build();
    tab_box.append(&close_button);

    // Add to notebook
    let page = notebook.append_page(&scrolled, Some(&tab_box));
    notebook.set_tab_reorderable(&scrolled, true); // Allow reordering tabs

    // Connect close button
    let notebook_weak = Downgrade::downgrade(&notebook);
    let scrolled_weak = Downgrade::downgrade(&scrolled);
    close_button.connect_clicked(move |_| {
        if let (Some(notebook), Some(scrolled)) = (notebook_weak.upgrade(), scrolled_weak.upgrade()) {
            if let Some(page_num) = notebook.page_num(&scrolled) {
                notebook.remove_page(Some(page_num));
            }
        }
    });

    // Select the new tab
    notebook.set_current_page(Some(page));
}
