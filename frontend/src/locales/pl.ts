import type { LocaleModule, Translations } from './locale';

const pl: Translations = {
  settings: 'Ustawienia', appearance: 'Wygląd', terminal: 'Terminal', shortcuts: 'Skróty klawiszowe', about: 'O programie',
  language: 'Język', theme: 'Motyw kolorystyczny', customTheme: 'Własny motyw', editTheme: 'Edytuj kolory', resetTheme: 'Przywróć',
  opacity: 'Przezroczystość okna', blur: 'Rozmycie tła', fontSize: 'Rozmiar czcionki', fontFamily: 'Rodzina czcionek',
  padding: 'Marginesy terminala', cursorStyle: 'Styl kursora', cursorBlink: 'Mruganie kursora', shell: 'Powłoka',
  scrollback: 'Linie historii', restoreSession: 'Przywracaj karty przy starcie', configFile: 'Plik konfiguracyjny', resetKey: 'Przywróć',
  pressKeys: 'Naciśnij klawisze…', shortcutsHint: 'Kliknij skrót, potem naciśnij nową kombinację. Esc anuluje.',
  newTab: 'Nowa karta', newTabHere: 'Nowa karta z opcjami…', closeTab: 'Zamknij kartę', closeOthers: 'Zamknij pozostałe karty',
  duplicateTab: 'Duplikuj kartę', renameTab: 'Zmień nazwę karty', copy: 'Kopiuj', paste: 'Wklej', search: 'Szukaj',
  splitRight: 'Podziel w prawo', splitDown: 'Podziel w dół', closePane: 'Zamknij panel', nextTab: 'Następna karta', prevTab: 'Poprzednia karta',
  nextPane: 'Następny panel', prevPane: 'Poprzedni panel',
  workingDir: 'Katalog roboczy', envVars: 'Zmienne środowiskowe (KLUCZ=WARTOŚĆ w linii)', open: 'Otwórz', cancel: 'Anuluj',
  ready: 'Gotowy', searchPlaceholder: 'Szukaj w terminalu…', noMatches: 'Brak wyników', matches: 'wyników',
  errConfigLoad: 'Nie udało się wczytać konfiguracji', errConfigSave: 'Nie udało się zapisać konfiguracji', errSession: 'Nie udało się zapisać sesji',
  errTerminal: 'Błąd terminala', errClipboard: 'Schowek niedostępny', copied: 'Skopiowano do schowka',
  aboutText: 'Emulator terminala dla HackerOS. Backend w H#, okno i render: Silver, interfejs w TypeScript + Solid.js.',
  close: 'Zamknij', minimize: 'Minimalizuj', maximize: 'Maksymalizuj',
};

const locale: LocaleModule = { code: 'pl', name: 'Polski', flag: '🇵🇱', translations: pl };
export default locale;
