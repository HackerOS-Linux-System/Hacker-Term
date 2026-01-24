const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
                                maximize: () => ipcRenderer.send('window-maximize'),
                                close: () => ipcRenderer.send('window-close'),

                                // Terminal API - Added 'shell' argument
                                createTerminal: (id, shell) => ipcRenderer.invoke('terminal-create', id, shell),
                                onTerminalData: (callback) => ipcRenderer.on('terminal-incoming-data', (event, id, data) => callback(id, data)),
                                writeTerminal: (id, data) => ipcRenderer.send('terminal-write', id, data),
                                resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal-resize', id, cols, rows),
                                disposeTerminal: (id) => ipcRenderer.send('terminal-dispose', id),
                                onTerminalExit: (callback) => ipcRenderer.on('terminal-exit', (event, id) => callback(id)),
});
