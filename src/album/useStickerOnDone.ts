import { useEffect, useRef } from 'react';
import { awardSticker, type StickerSource } from './album';

/** Jedna běžná nálepka při dokončení kola (done false → true). */
export function useStickerOnDone(source: StickerSource, done: boolean) {
  const given = useRef(false);
  useEffect(() => {
    if (!done) { given.current = false; return; }
    if (given.current) return;
    given.current = true;
    void awardSticker(source).catch(() => {});
  }, [done, source]);
}
