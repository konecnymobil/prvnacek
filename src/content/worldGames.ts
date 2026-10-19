import { useEffect, useState } from 'react';
/** Prvoukové minihry z content/world/games.json (A-17, A-19, A-20). */
export interface WorldGamesFile {
  mp1: {
    boxes: { id: string; icon: string; label: string; audioId: string }[];
    items: { id: string; emoji: string; label: string; box: string; audioId: string }[];
    levels: { id: string; boxIds: string[]; unlock: string | null }[];
    roundRule: string;
  };
  mp2: { sequences: { id: string; steps: string[]; narrationAudioId: string }[]; roundRule: string };
  mp3: { taskTypes: { id: 'crossing' | 'look' | 'light'; promptAudioId: string; okAudioId?: string; stepAudioIds?: string[]; buttonAudioIds?: { go: string; wait: string }; feedbackAudioIds?: { red: string; green: string }; text: string }[]; roundRule: string };
}

let cache: Promise<WorldGamesFile> | null = null;
export function loadWorldGames(): Promise<WorldGamesFile> {
  cache ??= fetch(`${import.meta.env.BASE_URL}content/world/games.json`).then((r) => { if (!r.ok) throw new Error(`world/games.json: ${r.status}`); return r.json() as Promise<WorldGamesFile>; });
  return cache;
}
export function useWorldGames() {
  const [g, setG] = useState<WorldGamesFile | null>(null);
  useEffect(() => { void loadWorldGames().then(setG); }, []);
  return g;
}
