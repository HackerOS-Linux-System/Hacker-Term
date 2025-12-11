const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { WebLinksAddon } = require('xterm-addon-web-links');

document.addEventListener('DOMContentLoaded', () => {
  const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'monospace',
    fontSize: 14,
    theme: {
      background: '#000000', // Black background
      foreground: '#00FF00', // Green text for hacker theme
      cursor: '#00FF00',
      selection: 'rgba(0, 255, 0, 0.3)',
    },
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

  term.open(document.getElementById('terminal'));

  // Fit terminal to container
  fitAddon.fit();
  window.addEventListener('resize', () => fitAddon.fit());

  // Send resize to main process
  api.send('terminal.resize', { cols: term.cols, rows: term.rows });

  // Handle incoming data
  api.receive('terminal.incomingData', (data) => {
    term.write(data);
  });

  // Handle key input with animation (inspired by Hyper)
  term.onKey(({ key, domEvent }) => {
    // Add typing animation: briefly highlight the character
    const charElement = document.createElement('span');
    charElement.textContent = key;
    charElement.style.color = '#00FF00';
    charElement.style.opacity = '0';
    charElement.style.transition = 'opacity 0.3s ease-in-out';
    document.body.appendChild(charElement); // Temporary overlay for animation
    setTimeout(() => {
      charElement.style.opacity = '1';
    }, 10);
    setTimeout(() => {
      charElement.remove();
    }, 300);

    api.send('terminal.keystroke', key);
  });

  // Warp-inspired features: smooth scrolling animation
  term.options.scrollback = 10000;
  term.options.smoothScrollDuration = 100; // Smooth scrolling

  // Termius style: Add some glow effects via CSS
});
