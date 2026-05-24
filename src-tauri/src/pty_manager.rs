use anyhow::{anyhow, Result};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub child: Box<dyn Child + Send + Sync>,
    pub writer: Box<dyn Write + Send>,
}

pub type PtyMap = Arc<Mutex<HashMap<String, PtySession>>>;

pub fn create_pty_map() -> PtyMap {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Spawn a new PTY session running zsh (fallback to bash).
/// Returns the session id. Data from the PTY is forwarded via `on_data` callback.
pub fn spawn_session<F>(
    id: String,
    cols: u16,
    rows: u16,
    map: PtyMap,
    on_data: F,
    on_exit: impl Fn(String) + Send + 'static,
) -> Result<()>
where
    F: Fn(String, String) + Send + 'static,
{
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| anyhow!("openpty failed: {}", e))?;

    // Determine shell
    let shell = if std::path::Path::new("/usr/bin/zsh").exists() {
        "/usr/bin/zsh".to_string()
    } else if std::path::Path::new("/bin/zsh").exists() {
        "/bin/zsh".to_string()
    } else {
        "/bin/bash".to_string()
    };

    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if let Ok(home) = std::env::var("HOME") {
        cmd.cwd(&home);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| anyhow!("spawn failed: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| anyhow!("take_writer failed: {}", e))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| anyhow!("clone_reader failed: {}", e))?;

    let session = PtySession {
        master: pair.master,
        child,
        writer,
    };

    {
        let mut lock = map.lock().unwrap();
        lock.insert(id.clone(), session);
    }

    // Reader thread — forwards PTY output to frontend
    let id_clone = id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    on_exit(id_clone.clone());
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    on_data(id_clone.clone(), data);
                }
            }
        }
    });

    Ok(())
}

pub fn write_to_session(map: &PtyMap, id: &str, data: &[u8]) -> Result<()> {
    let mut lock = map.lock().unwrap();
    if let Some(session) = lock.get_mut(id) {
        session.writer.write_all(data)?;
        session.writer.flush()?;
        Ok(())
    } else {
        Err(anyhow!("session {} not found", id))
    }
}

pub fn resize_session(map: &PtyMap, id: &str, cols: u16, rows: u16) -> Result<()> {
    let lock = map.lock().unwrap();
    if let Some(session) = lock.get(id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| anyhow!("resize failed: {}", e))?;
        Ok(())
    } else {
        Err(anyhow!("session {} not found", id))
    }
}

pub fn close_session(map: &PtyMap, id: &str) {
    let mut lock = map.lock().unwrap();
    lock.remove(id);
}
