use gio::prelude::*;
use gtk::prelude::*;
use gio::ApplicationFlags;
use gtk::Application;

mod style;
mod ui;
mod terminal;
mod webview;

use style::apply_styles;
use ui::build_ui;

fn main() {
    // Initialize GTK application
    let app = Application::new(Some("com.example.hackerterm"), ApplicationFlags::default());

    // Connect startup to apply global settings and styles
    app.connect_startup(|_| {
        // Enable dark theme
        let settings = gtk::Settings::default().unwrap();
        settings.set_property("gtk-application-prefer-dark-theme", &true.to_value());
        settings.set_property("gtk-theme-name", &"Adwaita".to_value()); // Use Adwaita dark variant

        // Apply custom styles
        apply_styles();
    });

    // Connect activate to build the UI
    app.connect_activate(build_ui);

    // Run the application
    app.run();
}
