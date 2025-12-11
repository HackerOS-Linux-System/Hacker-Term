const { app, BrowserWindow, ipcMain } = require('electron');
const pty = require('node-pty');
const os = require('os');
const path = require('path');

let mainWindow;
let ptyProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#000000', // Black background for hacker theme
    title: 'Hacker Term',
    icon: path.join(__dirname, 'icon.png'), // Assume you have an icon
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (ptyProcess) ptyProcess.kill();
  });

  // Determine shell based on OS
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'zsh'; // Prefer zsh on non-Windows, fallback to bash if needed

  // Spawn PTY process
  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env,
  });

  // Handle data from PTY
  ptyProcess.on('data', (data) => {
    mainWindow.webContents.send('terminal.incomingData', data);
  });

  // Handle resize
  ipcMain.on('terminal.resize', (event, size) => {
    ptyProcess.resize(size.cols, size.rows);
  });

  // Handle keystrokes
  ipcMain.on('terminal.keystroke', (event, key) => {
    ptyProcess.write(key);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
