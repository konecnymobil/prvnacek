/** Dlaždice her: 1. klepnutí řekne název hry (a dlaždici označí), 2. klepnutí hru otevře – jako výběr předmětu (UX P2-13). */
import { useState } from 'react';
import { say } from '../activities/common';

export const GAME_NAME_AUDIO: Record<string, string> = {
  ztratilo: 'snd-p-game-ztratilo', detektiv: 'snd-p-game-detektiv', bublinky: 'snd-p-game-bublinky', domecky: 'snd-p-game-domecky', obchod: 'snd-p-game-obchod',
  mm1: 'snd-m-p-game-krmeni', mm2: 'snd-m-p-game-kolik', mm3: 'snd-m-p-game-cesticka',
  mp1: 'snd-pv-p-game-uklizime', mp2: 'snd-pv-p-game-drive', mp3: 'snd-pv-p-game-cesta',
  me1: 'snd-en-p-game-megaboxy', me2: 'snd-en-p-game-colour',
};
export function useTileTap() {
  const [selected, setSelected] = useState<string | null>(null);
  const tap = (id: string, open: () => void) => {
    if (selected === id) { open(); return; }
    setSelected(id);
    const a = GAME_NAME_AUDIO[id];
    if (a) void say([a]);
  };
  return { selected, tap };
}
