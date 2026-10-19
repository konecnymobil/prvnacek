/** Načtení content/math/lessons.json (A-06, A-08, A-31). */
import { useEffect, useState } from 'react';
import type { MathLessonsFile } from './math';
let cache: Promise<MathLessonsFile> | null = null;
export function loadMathLessons(): Promise<MathLessonsFile> {
  cache ??= fetch(`${import.meta.env.BASE_URL}content/math/lessons.json`).then((r) => { if (!r.ok) throw new Error(`math/lessons.json: ${r.status}`); return r.json() as Promise<MathLessonsFile>; })
    .then((f) => ({ ...f, lessons: [...f.lessons].sort((a, b) => a.index - b.index) }));
  cache.catch(() => { cache = null; });
  return cache;
}
export function useMathLessons() {
  const [f, setF] = useState<MathLessonsFile | null>(null);
  useEffect(() => { void loadMathLessons().then(setF, () => {}); }, []);
  return f;
}

