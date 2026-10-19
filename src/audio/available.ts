/** Které zvuky opravdu existují (audio/tts/index.json, je v offline cache). Hry s chybějícími klipy se samy zamknou
 *  a odemknou se, jakmile klipy přibudou v obsahu. */
import { useEffect, useState } from 'react';

let cache: Promise<Set<string>> | null = null;
export function audioIndex(): Promise<Set<string>> {
  cache ??= fetch(`${import.meta.env.BASE_URL}audio/tts/index.json`)
    .then((r) => (r.ok ? r.json() : { sounds: [] }))
    .then((d: { sounds?: { audioId: string }[] }) => new Set((d.sounds ?? []).map((s) => s.audioId)))
    .catch(() => new Set<string>());
  return cache;
}
/** null = ještě se načítá. */
export function useAudioIndex(): Set<string> | null {
  const [s, setS] = useState<Set<string> | null>(null);
  useEffect(() => { let on = true; void audioIndex().then((x) => on && setS(x)); return () => { on = false; }; }, []);
  return s;
}
export const hasAll = (idx: Set<string> | null, ids: string[]) => !!idx && ids.every((id) => idx.has(id));
