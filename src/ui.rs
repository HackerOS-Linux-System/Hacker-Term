use gtk::prelude::*;
use gtk::{Application, ApplicationWindow, Button, HeaderBar, Notebook};
use glib::clone::Downgrade;
use crate::terminal::add_tab;
pub fn build_ui(app: &Application) {
    let window = ApplicationWindow::builder()
        .application(app)
        .title("Hacker Terminal - Hackeros Edition")
        .default_width(1000)
        .default_height(700)
        .build();
    // Create and set header bar
    let header = HeaderBar::new();
    header.set_show_title_buttons(true);
    window.set_titlebar(Some(&header));
    // Create notebook for tabs
    let notebook = Notebook::new();
    notebook.set_tab_pos(gtk::PositionType::Top);
    notebook.set_scrollable(true);
    // Add button to header for new tab
    let add_button = Button::with_label("+");
    add_button.set_css_classes(&["suggested-action"]); // Use suggested action for prominence
    header.pack_start(&add_button);
    let notebook_weak = Downgrade::downgrade(&notebook);
    add_button.connect_clicked(move |_| {
        if let Some(notebook) = notebook_weak.upgrade() {
            add_tab(&notebook);
        }
    });
    // Add initial tab
    add_tab(&notebook);
    // Set notebook as child
    window.set_child(Some(&notebook));
    // Present the window
    window.present();
}
