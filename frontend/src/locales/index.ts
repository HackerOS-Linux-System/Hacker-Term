import { ALL_LOCALES } from './_all';
import type { Translations } from './locale';

export type { Translations, LocaleModule } from './locale';
export const LOCALES = ALL_LOCALES;
export const FALLBACK = ALL_LOCALES.find((l) => l.code === 'en')!;

export function translationsFor(code: string): Translations {
  return (ALL_LOCALES.find((l) => l.code === code) ?? FALLBACK).translations;
}
