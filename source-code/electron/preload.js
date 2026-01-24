const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
                                maximize: () => ipcRenderer.send('window-maximize'),
                                close: () => ipcRenderer.send('window-close'),

                                // Terminal API - Removed 'shell' argument (enforced in main)
                                createTerminal: (id) => ipcRenderer.invoke('terminal-create', id),
                                onTerminalData: (callback) => ipcRenderer.on('terminal-incoming-data', (event, id, data) => callback(id, data)),
                                writeTerminal: (id, data) => ipcRenderer.send('terminal-write', id, data),
                                resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal-resize', id, cols, rows),
                                disposeTerminal: (id) => ipcRenderer.send('terminal-dispose', id),
                                onTerminalExit: (callback) => ipcRenderer.on('terminal-exit', (event, id) => callback(id)),
});
