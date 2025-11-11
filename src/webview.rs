use gtk::prelude::*;
use gtk::gdk::RGBA;
use webkitgtk6::{WebContext, WebView};
use webkitgtk6::prelude::WebViewExt;
use crate::style::load_config;
pub fn setup_webview() -> WebView {
    let config = load_config();
    let particle_color = config.particle_color.unwrap_or_else(|| "rgba(255, 255, 255, 1)".to_string());
    let particle_count = config.particle_count.unwrap_or(20); // Reduced for less intense animation
    let particle_life_min = config.particle_life_min.unwrap_or(40);
    let particle_life_max = config.particle_life_max.unwrap_or(70);
    let particle_size_min = config.particle_size_min.unwrap_or(2.0); // Smaller particles
    let particle_size_max = config.particle_size_max.unwrap_or(5.0); // Smaller max size
    let context = WebContext::default().unwrap();
    let webview = WebView::builder().web_context(&context).build();
    webview.set_background_color(&RGBA::new(0.0, 0.0, 0.0, 0.0)); // Fully transparent
    webview.set_hexpand(true);
    webview.set_vexpand(true);
    // Load enhanced HTML with configurable particle animations only on typing at cursor
    let html = format!(r#"
    <html>
    <head>
    <style>
    body, html {{
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: transparent;
    }}
    canvas {{
        display: block;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none; /* Allow clicks to pass through */
    }}
    </style>
    </head>
    <body>
    <canvas id="canvas"></canvas>
    <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationFrameId;
    function resizeCanvas() {{
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }}
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    class Particle {{
        constructor(x, y) {{
            this.x = x;
            this.y = y;
            this.size = Math.random() * {} + {}; // Configurable size
            this.speedX = Math.random() * 3 - 1.5; // Reduced speed
            this.speedY = Math.random() * 3 - 1.5; // Reduced speed
            this.color = '{}'; // Configurable color
            this.life = {} + Math.random() * {}; // Configurable life
            this.initialLife = this.life;
            this.alpha = 1.0;
        }}
        update() {{
            this.x += this.speedX;
            this.y += this.speedY;
            this.speedY += 0.1; // Reduced gravity
            this.life -= 1;
            // Fade out linearly instead of flashing
            this.alpha = this.life / this.initialLife;
            if (this.size > 0.3) this.size -= 0.08; // Slower size reduction
        }}
        draw() {{
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }}
    }}
    function animate() {{
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles = particles.filter(particle => {{
            particle.update();
            particle.draw();
            return particle.life > 0;
        }});
        animationFrameId = requestAnimationFrame(animate);
    }}
    animate();
    // Function to spawn particles at specific x, y (called from Rust on input)
    function spawnParticles(x, y) {{
        const count = {};
        for (let i = 0; i < count; i++) {{
            particles.push(new Particle(x, y));
        }}
    }}
    </script>
    </body>
    </html>
    "#, particle_size_max - particle_size_min, particle_size_min, particle_color, particle_life_min, particle_life_max - particle_life_min, particle_count);
    webview.load_html(&html, None);
    webview
}
