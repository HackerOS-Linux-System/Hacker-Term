use gtk::gdk::RGBA;
use gtk::gio::ApplicationFlags;
use gtk::prelude::*;
use gtk::{Application, ApplicationWindow, Button, CssProvider, HeaderBar, Label, Notebook, Orientation, ScrolledWindow};
use vte::{PtyFlags, Terminal};
use vte::prelude::{TerminalExt, TerminalExtManual};
use webkitgtk6::{WebContext, WebView};
use webkitgtk6::prelude::WebViewExt;
use which::which;

fn main() {
    // Initialize GTK
    let app = Application::new(Some("com.example.rustterminal"), ApplicationFlags::default());
    app.connect_startup(|_| {
        // Set dark theme globally
        let settings = gtk::Settings::default().unwrap();
        settings.set_property("gtk-application-prefer-dark-theme", &true.to_value());
        settings.set_property("gtk-theme-name", &"Adwaita".to_value()); // Adwaita has dark variant
        // Load custom CSS for semi-transparent background and styling
        let provider = CssProvider::new();
        provider.load_from_data("
        window {
        background-color: rgba(0, 0, 0, 0.8); /* Semi-transparent dark background */
    }
    notebook {
    background-color: transparent;
    }
    scrolledwindow {
    background-color: transparent;
    }
    vte-terminal {
    background-color: transparent;
    color: #ffffff;
    font-family: monospace;
    font-size: 12pt;
    }
    ");
        gtk::style_context_add_provider_for_display(
            &gtk::gdk::Display::default().unwrap(),
                                                    &provider,
                                                    gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
        );
    });
    app.connect_activate(build_ui);
    app.run();
}

fn build_ui(app: &Application) {
    let window = ApplicationWindow::builder()
    .application(app)
    .title("Rust Terminal")
    .default_width(800)
    .default_height(600)
    .build();
    // Create header bar
    let header = HeaderBar::new();
    header.set_show_title_buttons(true);
    window.set_titlebar(Some(&header));
    // Create notebook for tabs
    let notebook = Notebook::new();
    notebook.set_tab_pos(gtk::PositionType::Top);
    notebook.set_scrollable(true);
    // Add button to header to create new tab
    let add_button = Button::with_label("+");
    header.pack_start(&add_button);
    let notebook_weak = notebook.downgrade();
    add_button.connect_clicked(move |_| {
        if let Some(notebook) = notebook_weak.upgrade() {
            add_tab(&notebook);
        }
    });
    // Add initial tab
    add_tab(&notebook);
    window.set_child(Some(&notebook));
    window.present();
}

fn add_tab(notebook: &Notebook) {
    // Create overlay for terminal and webview
    let overlay = gtk::Overlay::new();
    // Create VTE Terminal
    let terminal = Terminal::new();
    terminal.set_hexpand(true);
    terminal.set_vexpand(true);
    terminal.set_allow_hyperlink(true);
    // Determine shell: prefer zsh if available, fallback to bash
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
        glib::SpawnFlags::DEFAULT,
        None::<&(dyn Fn() + 'static)>,
                         -1,
                         None,
                         |_| {},
    );
    overlay.set_child(Some(&terminal));
    // Create WebView for animations (transparent overlay)
    let context = WebContext::default().unwrap();
    let webview = WebView::builder().web_context(&context).build();
    webview.set_background_color(&RGBA::new(0.0, 0.0, 0.0, 0.0)); // Fully transparent
    // Load HTML with canvas and JavaScript for particle animations (simulating Hyperpower)
    let html = r#"
    <html>
    <head>
    <style>
    body, html {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: transparent;
}
canvas {
display: block;
position: absolute;
top: 0;
left: 0;
width: 100%;
height: 100%;
pointer-events: none; /* Allow clicks to pass through */
}
</style>
</head>
<body>
<canvas id="canvas"></canvas>
<script>
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let animationFrameId;
function resizeCanvas() {
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
class Particle {
constructor(x, y) {
this.x = x;
this.y = y;
this.size = Math.random() * 5 + 2;
this.speedX = Math.random() * 4 - 2;
this.speedY = Math.random() * 4 - 2;
this.color = `rgba(${Math.random()*255}, ${Math.random()*255}, ${Math.random()*255}, ${Math.random() * 0.5 + 0.5})`;
this.life = 30 + Math.random() * 20;
}
update() {
this.x += this.speedX;
this.y += this.speedY;
this.speedY += 0.1; // Gravity effect
this.life -= 1;
if (this.size > 0.2) this.size -= 0.1;
}
draw() {
ctx.fillStyle = this.color;
ctx.beginPath();
ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
ctx.fill();
}
}
function animate() {
ctx.clearRect(0, 0, canvas.width, canvas.height);
particles = particles.filter(particle => {
particle.update();
particle.draw();
return particle.life > 0;
});
animationFrameId = requestAnimationFrame(animate);
}
animate();
// Function to spawn particles (called from Rust on input)
function spawnParticles(count = 50) {
const x = Math.random() * canvas.width;
const y = Math.random() * canvas.height;
for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y));
}
}
</script>
</body>
</html>
"#;
webview.load_html(html, None);
// Make webview expand and overlay
webview.set_hexpand(true);
webview.set_vexpand(true);
overlay.add_overlay(&webview);
// Connect to VTE commit signal to trigger particles on text input
let webview_clone = webview.clone();
terminal.connect_commit(move |_, text, _| {
    if !text.is_empty() {
        // Trigger JavaScript to spawn particles
        webview_clone.evaluate_javascript("spawnParticles(50);", None, None, None, |_| {});
    }
});
// Wrap in ScrolledWindow for better handling
let scrolled = ScrolledWindow::new();
scrolled.set_child(Some(&overlay));
scrolled.set_hexpand(true);
scrolled.set_vexpand(true);
// Add to notebook with close button
let tab_box = gtk::Box::new(Orientation::Horizontal, 0);
let label = Label::new(Some("Terminal"));
tab_box.append(&label);
let close_button = Button::builder()
.icon_name("window-close-symbolic")
.css_classes(vec!["flat".to_string()])
.build();
tab_box.append(&close_button);
let _ = notebook.append_page(&scrolled, Some(&tab_box));
let notebook_weak = notebook.downgrade();
let scrolled_weak = scrolled.downgrade();
close_button.connect_clicked(move |_| {
    if let Some(notebook) = notebook_weak.upgrade() {
        if let Some(scrolled) = scrolled_weak.upgrade() {
            if let Some(page) = notebook.page_num(&scrolled) {
                notebook.remove_page(Some(page));
            }
        }
    }
});
}
