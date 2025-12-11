const { app, BrowserWindow, ipcMain, Menu, globalShortcut } = require('electron');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const fs = require('fs');

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
    backgroundColor: '#121212', // Very dark background
    title: 'Hacker Term',
    icon: path.join(__dirname, 'icon.png'), // Assume you have an icon
    frame: true, // For better window management
    titleBarStyle: 'hiddenInset', // Modern look
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (ptyProcess) ptyProcess.kill();
  });

  // Determine shell for Linux: prefer zsh, fallback to bash
  let shell = process.env.SHELL || '/bin/bash';
  if (os.platform() !== 'win32' && fs.existsSync('/bin/zsh')) {
    shell = '/bin/zsh';
  }

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

  // Update window title with shell output if needed (e.g., for pwd)
  ptyProcess.on('data', (data) => {
    // Simple title update logic (can be improved)
    if (data.includes('\u001b]0;')) {
      const titleMatch = data.match(/\u001b]0;(.*?)\u0007/);
      if (titleMatch) {
        mainWindow.setTitle(titleMatch[1]);
      }
    }
  });

  // Global shortcuts
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });
  globalShortcut.register('CommandOrControl+R', () => {
    mainWindow.reload();
  });
}

app.whenReady().then(() => {
  createWindow();

  // App menu for better UX
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
});

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

// Handle paste from main (for context menu)
ipcMain.on('terminal.paste', () => {
  const clipboard = require('electron').clipboard;
  ptyProcess.write(clipboard.readText());
});
