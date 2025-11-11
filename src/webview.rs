use gtk::prelude::*;
use gtk::gdk::RGBA;
use webkitgtk6::{WebContext, WebView};
use webkitgtk6::prelude::WebViewExt;

pub fn setup_webview() -> WebView {
    let context = WebContext::default().unwrap();
    let webview = WebView::builder().web_context(&context).build();
    webview.set_background_color(&RGBA::new(0.0, 0.0, 0.0, 0.0)); // Fully transparent
    webview.set_hexpand(true);
    webview.set_vexpand(true);

    // Load enhanced HTML with more advanced particle animations
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
            this.size = Math.random() * 6 + 3;
            this.speedX = Math.random() * 5 - 2.5;
            this.speedY = Math.random() * 5 - 2.5;
            this.color = `hsl(${Math.random() * 360}, 80%, 60%)`; // Vibrant colors
            this.life = 40 + Math.random() * 30;
            this.rotation = Math.random() * Math.PI * 2;
            this.spin = Math.random() * 0.05 - 0.025;
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            this.speedY += 0.15; // Enhanced gravity
            this.life -= 1;
            this.rotation += this.spin;
            if (this.size > 0.3) this.size -= 0.12;
        }
        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(0, -this.size);
            for (let i = 0; i < 5; i++) {
                ctx.lineTo(Math.sin(i * Math.PI * 2 / 5) * this.size, Math.cos(i * Math.PI * 2 / 5) * this.size);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
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
    function spawnParticles(count = 80) {
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

    webview
}
