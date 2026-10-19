/** Sdílený běh kola miniher předmětů (v0.8, jako js/minihry.js): chyba = klidně + otřes, nápověda až po 1. pokusu,
 *  3 chyby po sobě → „zastavíme se“, konec = nálepka do sady předmětu a odkaz na jeho záložku v albu. */
import HomeButton from '../components/HomeButton';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Mascot from '../activities/Mascot';
import { say, stopSay } from '../activities/common';
import { awardSticker, type SubjectId } from '../album/album';
import { getSetting, setSetting } from '../storage/db';

export const SUBJ_GAMES_KEY = 'games:rounds';
const PRAISE = ['snd-p-praise-1', 'snd-p-praise-2', 'snd-p-praise-3', 'snd-p-praise-4', 'snd-p-praise-5'];
const PRAISE_TEXT = ['Výborně!', 'Správně!', 'Super!', 'Paráda!', 'To je ono!'];

export interface MiniApi { msg?: string; i: number; tries: number; hintOn: boolean; calm: boolean; solved: boolean; ok: (sounds?: string[], delay?: number) => void; no: (msg?: string, sounds?: string[]) => void; setMsg: (m: string) => void }

export function useMiniRound(count: number, gameId: string, subject: SubjectId) {
  const [i, setI] = useState(0);
  const [tries, setTries] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hintOn, setHintOn] = useState(false);
  const [calm, setCalm] = useState(false);
  const [solved, setSolved] = useState(false);
  const [msg, setMsg] = useState('');
  const [shake, setShake] = useState(false);
  const log = useRef<{ id: string; tries: number; hintUsed: boolean }[]>([]);
  const started = useRef(new Date().toISOString());
  const timer = useRef<number | undefined>(undefined);
  const done = i >= count;
  useEffect(() => () => { window.clearTimeout(timer.current); stopSay(); }, []);
  useEffect(() => {
    if (!done) return;
    void say(['snd-fx-tada', 'snd-p-mh-sticker-set']);
    void (async () => {
      const stickerId = await awardSticker('hra', { refId: gameId, subjectId: subject }).catch(() => null);
      const prev = (await getSetting<unknown[]>(SUBJ_GAMES_KEY)) ?? [];
      await setSetting(SUBJ_GAMES_KEY, [...prev, { gameId, subjectId: subject, startedAt: started.current, finishedAt: new Date().toISOString(), tasks: log.current, stickerId }]);
    })().catch(() => {});
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  const api: MiniApi = {
    i, tries, hintOn, calm, solved, setMsg, msg,
    ok: (sounds = [], delay = 1500) => {
      if (solved) return;
      setSolved(true); setMsg(PRAISE_TEXT[i % 5]);
      log.current.push({ id: String(i), tries: tries + 1, hintUsed: hintOn });
      void say(['snd-fx-ok', PRAISE[i % 5], ...sounds]);
      timer.current = window.setTimeout(() => { setI((n) => n + 1); setTries(0); setStreak(0); setHintOn(false); setCalm(false); setSolved(false); setMsg(''); }, delay);
    },
    no: (m, sounds) => {
      if (solved) return;
      setTries((n) => n + 1); setShake(true); window.setTimeout(() => setShake(false), 500);
      if (streak + 1 >= 3) { setCalm(true); setStreak(0); setMsg('Zastavíme se a zkusíme to spolu.'); void say(['snd-fx-try', 'snd-p-mh-calm']); }
      else { setStreak((n) => n + 1); setMsg(m ?? 'Skoro! Zkus to znovu.'); void say(['snd-fx-try', ...(sounds ?? ['snd-p-retry-2'])]); }
    },
  };
  return { api, done, shake, showHint: () => setHintOn(true) };
}

export function MiniShell({ nameAudio = [], title, subjCls, round, count, prompt, onHint, back, openAlbum, children, intro }: {
  nameAudio?: string[]; title: string; subjCls: string; round: ReturnType<typeof useMiniRound>; count: number; prompt: string[]; onHint?: () => void;
  back: () => void; openAlbum: () => void; children: ReactNode; intro: string;
}) {
  const { api, done, shake } = round;
  useEffect(() => { if (!done && prompt.length) void say(api.i === 0 ? [...nameAudio, ...prompt] : prompt); }, [api.i]); // eslint-disable-line react-hooks/exhaustive-deps
  if (done) return (
    <main className={`screen activity game-end ${subjCls}`} data-testid="game-end">
      <Mascot mood="radost" /><h1>Nálepka do alba!</h1><p>Máš novou nálepku do sady!</p>
      <div className="actions">
        <button className="kbtn kbtn-primary kbtn-xl" data-testid="game-album" onClick={openAlbum}>⭐ Album</button>
        <button className="kbtn kbtn-xl" data-testid="game-back" onClick={back}>➜ Další hry</button>
      </div>
    </main>
  );
  return (
    <main className={`screen activity game xg ${subjCls}`} data-testid="game-round" data-index={api.i}>
      <header className="topbar row">
        <HomeButton onClick={back} />
        <span className="small">{title}</span>
        <div className="progress" data-testid="game-dots">{Array.from({ length: count }, (_, k) => <i key={k} className={k < api.i ? 'done' : k === api.i ? 'now' : ''} />)}</div>
        {api.tries > 0 && onHint && <button className="kbtn game-hint" data-testid="game-hint" aria-label="Nápověda" onClick={() => { round.showHint(); onHint(); }}>🔍</button>}
        {prompt.length > 0 && <button className="kbtn" aria-label="Zopakuj zadání" onClick={() => void say(prompt)}>🔊</button>}
      </header>
      <div className="game-stage">
        <div className="game-mascot"><Mascot mood={api.solved ? 'radost' : api.tries ? 'premysli' : 'povzbuzeni'} /><p className="bubble" data-testid="game-msg">{api.msg ?? ''}{!api.msg && intro}</p></div>
        <div className={shake ? 'xg-shake' : ''}>{children}</div>
      </div>
    </main>
  );
}
