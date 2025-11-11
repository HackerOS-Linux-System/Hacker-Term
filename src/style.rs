use gtk::{CssProvider, gdk::Display, STYLE_PROVIDER_PRIORITY_APPLICATION};

pub fn apply_styles() {
    let provider = CssProvider::new();
    provider.load_from_data(r#"
    /* Global window styling */
    window {
    background-color: rgba(18, 18, 18, 0.95); /* Semi-transparent modern dark background */
    border-radius: 12px; /* Rounded corners for modern look */
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); /* Subtle shadow */
}

/* Header bar styling */
headerbar {
background-color: rgba(30, 30, 30, 0.9);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: none;
    padding: 4px;
}

/* Notebook and tabs */
notebook {
background-color: transparent;
border: none;
}

notebook tab {
background-color: rgba(40, 40, 40, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px 8px 0 0;
    padding: 6px 12px;
    margin: 2px;
    transition: background-color 0.2s ease;
}

notebook tab:hover {
background-color: rgba(60, 60, 60, 0.9);
}

notebook tab:checked {
background-color: rgba(80, 80, 80, 0.95);
    border-bottom: none;
}

/* Scrolled window */
scrolledwindow {
background-color: transparent;
border: none;
}

/* VTE Terminal styling */
vte-terminal {
background-color: transparent;
color: #e0e0e0; /* Light gray text for readability */
font-family: 'JetBrains Mono', monospace; /* Modern monospace font */
font-size: 13pt;
padding: 10px;
border-radius: 8px;
}

/* Buttons */
button {
background-color: rgba(50, 50, 50, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 4px 8px;
    transition: background-color 0.2s ease;
}

button:hover {
background-color: rgba(70, 70, 70, 0.9);
}

/* Close button in tabs */
button.flat {
background: none;
border: none;
color: #ff5555; /* Red for close */
}

button.flat:hover {
color: #ff7777;
}

/* Overlay for webview */
overlay {
background-color: transparent;
}
"#);

    gtk::style_context_add_provider_for_display(
        &Display::default().expect("No GDK Display"),
                                                &provider,
                                                STYLE_PROVIDER_PRIORITY_APPLICATION,
    );
}
