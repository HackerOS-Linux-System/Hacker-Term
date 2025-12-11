const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { WebLinksAddon } = require('xterm-addon-web-links');
const { Menu, clipboard } = require('electron').remote; // For context menu

document.addEventListener('DOMContentLoaded', () => {
  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block', // Warp-like block cursor
    fontFamily: "'Fira Code', monospace", // Elegant font
    fontSize: 14,
    lineHeight: 1.2,
    theme: {
      background: '#121212', // Very dark background
      foreground: '#E0E0E0', // Light grey for text
      cursor: '#A0A0FF', // Pastel blue cursor
      cursorAccent: '#FFFFFF',
      selection: 'rgba(160, 160, 255, 0.3)', // Pastel selection
      black: '#333333',
      red: '#FF9999', // Pastel red
      green: '#99FF99', // Pastel green
      yellow: '#FFFF99', // Pastel yellow
      blue: '#9999FF', // Pastel blue
      magenta: '#FF99FF', // Pastel magenta
      cyan: '#99FFFF', // Pastel cyan
      white: '#E0E0E0',
      brightBlack: '#666666',
      brightRed: '#FFCCCC',
      brightGreen: '#CCFFCC',
      brightYellow: '#FFFFCC',
      brightBlue: '#CCCCFF',
      brightMagenta: '#FFCCFF',
      brightCyan: '#CCFFFF',
      brightWhite: '#FFFFFF',
    },
    allowTransparency: true, // For elegant shading
    scrollback: 10000,
    smoothScrollDuration: 150, // Better smooth scrolling
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

  const terminalContainer = document.getElementById('terminal');
  term.open(terminalContainer);

  // Fit terminal to container
  fitAddon.fit();
  window.addEventListener('resize', () => fitAddon.fit());

  // Send resize to main process
  api.send('terminal.resize', { cols: term.cols, rows: term.rows });

  // Handle incoming data with fade-in animation
  api.receive('terminal.incomingData', (data) => {
    // Animate incoming data: fade in
    term.options.disableStdin = true; // Briefly disable input for animation
    term.write(data);
    setTimeout(() => {
      term.options.disableStdin = false;
    }, 100); // Short delay for smooth feel
  });

  // Improved typing animation: Glow and fade for each key
  term.onKey(({ key, domEvent }) => {
    // Create overlay for animation
    const charElement = document.createElement('span');
    charElement.textContent = key.replace(/\r?\n|\r/g, '⏎'); // Show enter as symbol
    charElement.classList.add('typing-animation');
    const rect = terminalContainer.getBoundingClientRect();
    charElement.style.left = `${Math.random() * rect.width}px`;
    charElement.style.top = `${Math.random() * rect.height}px`;
    document.body.appendChild(charElement);
    setTimeout(() => charElement.remove(), 600);

    api.send('terminal.keystroke', key);
  });

  // Keyboard shortcuts in renderer
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 'c':
          if (term.hasSelection()) {
            clipboard.writeText(term.getSelection());
          } else {
            api.send('terminal.keystroke', '\x03'); // Ctrl+C interrupt
          }
          break;
        case 'v':
          api.send('terminal.paste');
          break;
        case 'a':
          term.selectAll();
          break;
      }
    }
  });

  // Right-click context menu
  terminalContainer.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const menu = Menu.buildFromTemplate([
      {
        label: 'Copy',
        accelerator: 'CmdOrCtrl+C',
        click: () => {
          if (term.hasSelection()) {
            clipboard.writeText(term.getSelection());
          }
        }
      },
      {
        label: 'Paste',
        accelerator: 'CmdOrCtrl+V',
        click: () => api.send('terminal.paste')
      },
      { type: 'separator' },
      {
        label: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        click: () => term.selectAll()
      },
      {
        label: 'Clear',
        click: () => term.clear()
      },
      { type: 'separator' },
      {
        label: 'Zoom In',
        accelerator: 'CmdOrCtrl+=',
        click: () => {
          term.options.fontSize += 1;
          fitAddon.fit();
        }
      },
      {
        label: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        click: () => {
          term.options.fontSize = Math.max(8, term.options.fontSize - 1);
          fitAddon.fit();
        }
      },
      {
        label: 'Reset Zoom',
        click: () => {
          term.options.fontSize = 14;
          fitAddon.fit();
        }
      }
    ]);
    menu.popup({ window: require('electron').remote.getCurrentWindow() });
  });

  // Warp-like cursor animation via CSS
});
