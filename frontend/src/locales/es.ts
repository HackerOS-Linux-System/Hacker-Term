import type { LocaleModule, Translations } from './locale';

const es: Translations = {
  settings: 'Ajustes', appearance: 'Apariencia', terminal: 'Terminal', shortcuts: 'Atajos', about: 'Acerca de',
  language: 'Idioma', theme: 'Tema de color', customTheme: 'Tema propio', editTheme: 'Editar colores', resetTheme: 'Restablecer',
  opacity: 'Opacidad de la ventana', blur: 'Desenfoque de fondo', fontSize: 'Tamaño de fuente', fontFamily: 'Familia de fuente',
  padding: 'Margen del terminal', cursorStyle: 'Estilo del cursor', cursorBlink: 'Parpadeo del cursor', shell: 'Shell',
  scrollback: 'Líneas de historial', restoreSession: 'Restaurar pestañas al iniciar', configFile: 'Archivo de configuración', resetKey: 'Restablecer',
  pressKeys: 'Pulsa las teclas…', shortcutsHint: 'Haz clic en un atajo y pulsa la nueva combinación. Esc cancela.',
  newTab: 'Nueva pestaña', newTabHere: 'Nueva pestaña con opciones…', closeTab: 'Cerrar pestaña', closeOthers: 'Cerrar las demás',
  duplicateTab: 'Duplicar pestaña', renameTab: 'Renombrar pestaña', copy: 'Copiar', paste: 'Pegar', search: 'Buscar',
  splitRight: 'Dividir a la derecha', splitDown: 'Dividir hacia abajo', closePane: 'Cerrar panel', nextTab: 'Pestaña siguiente', prevTab: 'Pestaña anterior',
  nextPane: 'Panel siguiente', prevPane: 'Panel anterior',
  workingDir: 'Directorio de trabajo', envVars: 'Variables de entorno (CLAVE=VALOR por línea)', open: 'Abrir', cancel: 'Cancelar',
  ready: 'Listo', searchPlaceholder: 'Buscar en el terminal…', noMatches: 'Sin resultados', matches: 'resultados',
  errConfigLoad: 'No se pudo cargar la configuración', errConfigSave: 'No se pudo guardar la configuración', errSession: 'No se pudo guardar la sesión',
  errTerminal: 'Error del terminal', errClipboard: 'Portapapeles no disponible', copied: 'Copiado al portapapeles',
  aboutText: 'Un emulador de terminal para HackerOS. Backend en H#, ventana y renderizado con Silver, interfaz en TypeScript + Solid.js.',
  close: 'Cerrar', minimize: 'Minimizar', maximize: 'Maximizar',
};

const locale: LocaleModule = { code: 'es', name: 'Español', flag: '🇪🇸', translations: es };
export default locale;
