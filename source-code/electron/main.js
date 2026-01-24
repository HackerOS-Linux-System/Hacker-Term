const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pty = require('node-pty');

let mainWindow;
const ptySessions = {};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 600,
        minHeight: 400,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, '../images/logo.svg'),
                                   webPreferences: {
                                       nodeIntegration: false,
                                   contextIsolation: true,
                                   preload: path.join(__dirname, 'preload.js'),
                                   },
    });

    const startUrl = process.env.npm_lifecycle_event === 'start' || process.env.npm_lifecycle_event === 'electron:start'
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    ipcMain.on('window-minimize', () => mainWindow.minimize());
    ipcMain.on('window-maximize', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });
    ipcMain.on('window-close', () => mainWindow.close());

    mainWindow.on('closed', () => (mainWindow = null));
}

// --- PTY Management (Linux Focused) ---

ipcMain.handle('terminal-create', (event, id, customShell) => {
    try {
        // 1. Determine Shell
        let shell = customShell;

        // Default to bash or zsh if not provided
        if (!shell || shell.trim() === '') {
            shell = process.env.SHELL || '/bin/bash';
        }

        // 2. Create PTY
        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 30,
            cwd: process.env.HOME,
            env: process.env
        });

        ptySessions[id] = ptyProcess;

        // 3. Handle Data
        ptyProcess.on('data', (data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal-incoming-data', id, data);
            }
        });

        ptyProcess.on('exit', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal-exit', id);
            }
            delete ptySessions[id];
        });

        return shell;
    } catch (error) {
        console.error('Failed to create terminal:', error);
        // Fallback to a safe shell if the requested one fails
        return 'Error: ' + error.message;
    }
});

ipcMain.on('terminal-write', (event, id, data) => {
    if (ptySessions[id]) {
        ptySessions[id].write(data);
    }
});

ipcMain.on('terminal-resize', (event, id, cols, rows) => {
    if (ptySessions[id]) {
        try {
            ptySessions[id].resize(cols, rows);
        } catch (e) {
            // ignore
        }
    }
});

ipcMain.on('terminal-dispose', (event, id) => {
    if (ptySessions[id]) {
        ptySessions[id].kill();
        delete ptySessions[id];
    }
});

app.whenReady().then(() => {
    // Linux transparency flags
    if (process.platform === 'linux') {
        app.commandLine.appendSwitch('enable-transparent-visuals');
        app.commandLine.appendSwitch('disable-gpu');
        // Sometimes 'disable-gpu' helps with transparency artifacts on Linux
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
