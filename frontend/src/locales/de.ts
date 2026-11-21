import type { LocaleModule, Translations } from './locale';

const de: Translations = {
  settings: 'Einstellungen', appearance: 'Darstellung', terminal: 'Terminal', shortcuts: 'Tastenkürzel', about: 'Über',
  language: 'Sprache', theme: 'Farbschema', customTheme: 'Eigenes Schema', editTheme: 'Farben bearbeiten', resetTheme: 'Zurücksetzen',
  opacity: 'Fenstertransparenz', blur: 'Hintergrundunschärfe', fontSize: 'Schriftgröße', fontFamily: 'Schriftart',
  padding: 'Terminal-Innenabstand', cursorStyle: 'Cursorstil', cursorBlink: 'Cursor blinkt', shell: 'Shell',
  scrollback: 'Verlaufszeilen', restoreSession: 'Tabs beim Start wiederherstellen', configFile: 'Konfigurationsdatei', resetKey: 'Zurücksetzen',
  pressKeys: 'Tasten drücken…', shortcutsHint: 'Kürzel anklicken und neue Tastenkombination drücken. Esc bricht ab.',
  newTab: 'Neuer Tab', newTabHere: 'Neuer Tab mit Optionen…', closeTab: 'Tab schließen', closeOthers: 'Andere Tabs schließen',
  duplicateTab: 'Tab duplizieren', renameTab: 'Tab umbenennen', copy: 'Kopieren', paste: 'Einfügen', search: 'Suchen',
  splitRight: 'Nach rechts teilen', splitDown: 'Nach unten teilen', closePane: 'Bereich schließen', nextTab: 'Nächster Tab', prevTab: 'Vorheriger Tab',
  nextPane: 'Nächster Bereich', prevPane: 'Vorheriger Bereich',
  workingDir: 'Arbeitsverzeichnis', envVars: 'Umgebungsvariablen (SCHLÜSSEL=WERT pro Zeile)', open: 'Öffnen', cancel: 'Abbrechen',
  ready: 'Bereit', searchPlaceholder: 'Im Terminal suchen…', noMatches: 'Keine Treffer', matches: 'Treffer',
  errConfigLoad: 'Konfiguration konnte nicht geladen werden', errConfigSave: 'Konfiguration konnte nicht gespeichert werden', errSession: 'Sitzung konnte nicht gespeichert werden',
  errTerminal: 'Terminalfehler', errClipboard: 'Zwischenablage nicht verfügbar', copied: 'In die Zwischenablage kopiert',
  aboutText: 'Ein Terminalemulator für HackerOS. Backend in H#, Fenster und Rendering über Silver, Oberfläche in TypeScript + Solid.js.',
  close: 'Schließen', minimize: 'Minimieren', maximize: 'Maximieren',
};

const locale: LocaleModule = { code: 'de', name: 'Deutsch', flag: '🇩🇪', translations: de };
export default locale;
