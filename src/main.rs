use anyhow::{Context, Result};
use crossterm::{
    cursor::{Hide, MoveTo, Show},
    event::{self, Event, KeyCode, KeyEvent},
    execute,
    style::{Color, Print, ResetColor, SetBackgroundColor, SetForegroundColor},
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
    ExecutableCommand,
};
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use std::{
    io::{self, BufRead, BufReader, Write},
    sync::{
        mpsc::{channel, Receiver, Sender},
        Arc, Mutex,
    },
    thread::{self, sleep},
    time::Duration,
};
use vte::{Params, Perform, Parser};

// Handler for VTE to handle terminal output with "hacker" effects
struct HackerHandler {
    tx: Sender<String>,
}

impl Perform for HackerHandler {
    fn print(&mut self, c: char) {
        // Send char to rendering thread with delay for typing effect
        self.tx.send(c.to_string()).unwrap();
    }

    fn execute(&mut self, byte: u8) {
        match byte {
            b'\n' => {
                // Enter effect: flash or something fancy
                self.tx.send("\n".to_string()).unwrap();
                // For "flash", we can send a special message, but for simplicity, just newline
            }
            b'\r' => self.tx.send("\r".to_string()).unwrap(),
            b'\t' => self.tx.send("\t".to_string()).unwrap(),
            b'\x08' => self.tx.send("\x08".to_string()).unwrap(), // Backspace
            _ => {}
        }
    }

    fn hook(&mut self, _params: &Params, _intermediates: &[u8], _ignore: bool, _c: char) {}
    fn put(&mut self, _byte: u8) {}
    fn unhook(&mut self) {}
    fn osc_dispatch(&mut self, _params: &[&[u8]], _bell_terminated: bool) {}
    fn csi_dispatch(&mut self, _params: &Params, _intermediates: &[u8], _ignore: bool, c: char) {
        // Handle some CSI for cursor, etc., but simplified
        if c == 'J' {
            self.tx.send("CLEAR".to_string()).unwrap(); // Special for clear screen
        }
    }
    fn esc_dispatch(&mut self, _intermediates: &[u8], _ignore: bool, _byte: u8) {}
}

fn main() -> Result<()> {
    // Setup crossterm
    let mut stdout = io::stdout();
    enable_raw_mode()?;
    execute!(stdout, EnterAlternateScreen, Hide)?;

    // Set "hacker" style: green text on black background
    execute!(
        stdout,
        SetForegroundColor(Color::Green),
        SetBackgroundColor(Color::Black)
    )?;

    // Channels for communication
    let (tx, rx) = channel::<String>();

    // Setup PTY with zsh
    let pty_system = native_pty_system();
    let pty = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .context("Failed to open PTY")?;

    let mut cmd = CommandBuilder::new("zsh");
    cmd.cwd(std::env::current_dir()?);
    let mut child = cmd.spawn(&pty.pty).context("Failed to spawn zsh")?;

    let mut reader = BufReader::new(pty.master.try_clone_reader()?);
    let writer = Arc::new(Mutex::new(pty.master.try_clone_writer()?));

    // Thread for reading from PTY and parsing with VTE
    let writer_clone = writer.clone();
    thread::spawn(move || {
        let mut parser = Parser::new();
        let handler = HackerHandler { tx };
        let mut buf = [0; 1024];
        loop {
            let n = reader.read(&mut buf).unwrap_or(0);
            if n == 0 {
                break;
            }
            for &byte in &buf[0..n] {
                parser.advance(&mut handler, byte);
            }
        }
    });

    // Thread for rendering with effects
    thread::spawn(move || {
        let mut stdout = io::stdout();
        while let Ok(msg) = rx.recv() {
            if msg == "CLEAR" {
                execute!(stdout, crossterm::terminal::Clear(crossterm::terminal::ClearType::All)).unwrap();
                execute!(stdout, MoveTo(0, 0)).unwrap();
            } else {
                // Typing effect: print char by char with small delay
                for c in msg.chars() {
                    execute!(stdout, Print(c)).unwrap();
                    stdout.flush().unwrap();
                    sleep(Duration::from_millis(5)); // Small delay for "hacker typing" effect
                }
            }
        }
    });

    // Input loop
    loop {
        if let Ok(Event::Key(KeyEvent { code, .. })) = event::read() {
            let mut writer = writer.lock().unwrap();
            match code {
                KeyCode::Char(c) => {
                    writer.write_all(c.to_string().as_bytes())?;
                }
                KeyCode::Enter => {
                    writer.write_all(b"\n")?;
                    // Additional enter effect: maybe a "glitch" but simplified
                }
                KeyCode::Backspace => {
                    writer.write_all(b"\x7f")?; // Delete
                }
                KeyCode::Esc => {
                    break;
                }
                _ => {}
            }
            writer.flush()?;
        }

        if child.try_wait()?.is_some() {
            break;
        }
    }

    // Cleanup
    disable_raw_mode()?;
    execute!(io::stdout(), LeaveAlternateScreen, Show, ResetColor)?;
    Ok(())
}
