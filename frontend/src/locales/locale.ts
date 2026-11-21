import type { en } from './en';
export type Translations = typeof en;
export interface LocaleModule { code: string; name: string; flag: string; translations: Translations }
