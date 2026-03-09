use anyhow::Result;
use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

pub struct PtyReader { pub inner: Box<dyn Read + Send> }

pub struct PtyWriter {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

impl PtyWriter {
    pub fn write(&mut self, data: &[u8]) -> Result<()> {
        self.writer.write_all(data)?; self.writer.flush()?; Ok(())
    }
    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<()> {
        self.master.resize(PtySize { rows, cols, pixel_width:0, pixel_height:0 })?; Ok(())
    }
}

pub fn spawn(shell: &str, cols: u16, rows: u16)
-> Result<(PtyReader, Arc<Mutex<PtyWriter>>)>
{
    let sys  = native_pty_system();
    let pair = sys.openpty(PtySize { rows, cols, pixel_width:0, pixel_height:0 })?;

    let mut cmd = CommandBuilder::new(shell);
    cmd.env("TERM",        "xterm-256color");
    cmd.env("TERM_PROGRAM","NeonTerm");
    cmd.env("COLORTERM",   "truecolor");
    cmd.env("LANG",        "en_US.UTF-8");
    cmd.env("LC_ALL",      "en_US.UTF-8");

    let _child  = pair.slave.spawn_command(cmd)?;
    let reader  = pair.master.try_clone_reader()?;
    let writer  = pair.master.take_writer()?;

    Ok((
        PtyReader { inner: reader },
        Arc::new(Mutex::new(PtyWriter { master: pair.master, writer })),
    ))
}
