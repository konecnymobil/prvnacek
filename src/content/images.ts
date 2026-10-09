import type { Word } from './types';

const urls = import.meta.glob('../assets/img/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byFile = (f: string): string | undefined => urls[`../assets/img/${f}.svg`];

/** imageId z obsahu → soubor v src/assets/img (Twemoji CC BY 4.0 podle kódu, nebo vlastní SVG projektu).
 *  Slova bez obrázku tu prostě nejsou a aktivita je přeskočí; nový obrázek = jeden řádek zde + soubor. */
const IMAGE_FILES: Record<string, string> = {
  'img-w-lama': '1f999',
  'img-w-maso': '1f969',
  'img-w-lupa': '1f50d',
  'img-w-pila': '1fa9a',
  'img-w-mapa': '1f5fa',
  'img-w-osel': '1facf',
  'img-w-sele': 'sele',
  'img-w-maama': 'mama',
  'img-w-pole': 'pole',
};

export function wordImageUrl(w: Word): string | null {
  const f = w.imageId ? IMAGE_FILES[w.imageId] : undefined;
  return (f && byFile(f)) || null;
}
