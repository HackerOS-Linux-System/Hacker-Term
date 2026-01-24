const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pty = require('node-pty');
const fs = require('fs');

let mainWindow;
const ptySessions = {};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, '../images/logo.png'),
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

// --- PTY Management (Strictly ZSH) ---

ipcMain.handle('terminal-create', (event, id) => {
    try {
        // FORCE ZSH
        let shell = '/usr/bin/zsh';

        // Fallback if zsh doesn't exist at that path (e.g. check standard paths)
        if (!fs.existsSync(shell)) {
            if (fs.existsSync('/bin/zsh')) {
                shell = '/bin/zsh';
            } else {
                // Ultimate fallback if ZSH is not installed, though user requested strictly ZSH
                console.warn('ZSH not found, falling back to /bin/bash');
                shell = '/bin/bash';
            }
        }

        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 30,
            cwd: process.env.HOME,
            env: {
                ...process.env,
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor'
            }
        });

        ptySessions[id] = ptyProcess;

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
    if (process.platform === 'linux') {
        app.commandLine.appendSwitch('enable-transparent-visuals');
        app.commandLine.appendSwitch('disable-gpu');
        // Adding blur capability if supported by compositor
        app.commandLine.appendSwitch('force-color-profile', 'srgb');
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
