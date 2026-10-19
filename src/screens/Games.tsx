/** Hry (HANDOFF 10): seznam 5 miniher a společný běh kola (engine podle design/js/minihry.js). */
import { useEffect, useMemo, useState } from 'react';
import Mascot from '../activities/Mascot';
import Glyphs, { useTaskForm } from '../components/Glyphs';
import type { Content } from '../content/load';
import type { Forms } from '../content/types';
import { say, stopSay } from '../activities/common';
import { useAutoAdvance } from '../activities/autoAdvance';
import { awardSticker } from '../album/album';
import { getLessonStatesMap, getSetting, setSetting, type LessonState } from '../storage/db';
import { GAMES, gameById, maxLessonIndex, type GameId, type GameTask } from '../games/games';

export const GAMES_KEY = 'games:rounds';
export interface RoundResult { gameId: GameId; startedAt: string; finishedAt: string; tasks: { id: string; tries: number; hintUsed: boolean }[]; stickerId: string | null }

export default function Games({ content, back }: { content: Content; back: () => void }) {
  const [states, setStates] = useState<Record<string, LessonState | undefined> | null>(null);
  const [game, setGame] = useState<GameId | null>(null);
  const [hint, setHint] = useState('');
  useEffect(() => { getLessonStatesMap().then(setStates, () => setStates({})); return () => stopSay(); }, []);
  if (!states) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  const idx = maxLessonIndex(content, states);
  if (game) return <Round key={game} content={content} game={game} idx={idx} back={() => setGame(null)} />;
  const lessons = content.orders[content.defaultOrderId].lessons;
  return (
    <main className="screen activity games" data-testid="games">
      <header className="topbar row"><button className="kbtn" onClick={back}>Zpět</button><h1>Hry</h1></header>
      <div className="game-tiles">
        {GAMES.map((g) => {
          const min = g.minLesson(content);
          const open = min !== null && min <= idx;
          const letter = min !== null ? lessons.find((l) => l.index === min)?.title.split(' ')[0] : null;
          return (
            <button key={g.id} className={`game-tile${open ? '' : ' is-locked'}`} data-game={g.id} data-locked={open ? 'false' : 'true'}
              onClick={() => { if (open) { setGame(g.id); return; } setHint(letter ? `Tahle hra přijde s písmenkem ${letter}.` : 'Tahle hra přijde později.'); const L = min !== null ? lessons.find((l) => l.index === min) : undefined; const la = L ? content.letterById.get(L.primaryLetterId)?.audioId : undefined; void say(['snd-p-mh-locked', ...(la ? [la] : [])]); }}>
              <span className="game-icon">{g.icon}</span><span>{g.name}</span>{!open && <span aria-hidden>🔒</span>}
            </button>
          );
        })}
      </div>
      {hint && <p className="notice" role="status" data-testid="game-lock-hint">🔒 {hint}</p>}
    </main>
  );
}

const gapForms = (f: Forms, i: number): Forms => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, i) + '_' + v.slice(i + 1) : v])) as Forms;

function Round({ content, game, idx, back }: { content: Content; game: GameId; idx: number; back: () => void }) {
  const def = gameById(game);
  const tasks = useMemo(() => def.build(content, idx), [def, content, idx]);
  const [i, setI] = useState(0);
  const [tries, setTries] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hintOn, setHintOn] = useState(false);
  const [calm, setCalm] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [picked, setPicked] = useState<boolean>(false); // domečky: vybraná karta
  const [log, setLog] = useState<RoundResult['tasks']>([]);
  const [msg, setMsg] = useState('');
  const [started] = useState(() => new Date().toISOString());
  const t: GameTask | undefined = tasks[i];
  const done = i >= tasks.length;
  const form = useTaskForm(i);
  const auto = useAutoAdvance();
  auto.target.current = () => { setI((n) => n + 1); setTries(0); setStreak(0); setHintOn(false); setCalm(false); setSolved(false); setPicked(false); setMsg(''); };

  useEffect(() => { if (t) void say([...(i === 0 ? [`snd-p-game-${game}`] : []), ...t.prompt]); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSay(), []);
  useEffect(() => {
    if (!done || !tasks.length) return;
    void (async () => {
      const stickerId = await awardSticker('hra', { refId: game }).catch(() => null);
      const r: RoundResult = { gameId: game, startedAt: started, finishedAt: new Date().toISOString(), tasks: log, stickerId };
      await setSetting(GAMES_KEY, [...((await getSetting<RoundResult[]>(GAMES_KEY)) ?? []), r]);
    })().catch(() => {});
    void say(['snd-fx-tada', 'snd-p-mh-sticker-set']);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string) => {
    if (!t || solved) return;
    if (game === 'domecky' && !picked) { setPicked(true); }
    if (id === t.answer) {
      setSolved(true); setMsg(['Výborně!', 'Správně!', 'To je ono!', 'Dobře čteš!'][i % 4]);
      setLog((l) => [...l, { id: t.id, tries: tries + 1, hintUsed: hintOn }]);
      const praise = content.promptById.get(`p-praise-${(i % 6) + 1}`);
      auto.schedule(say(['snd-fx-ok', ...(praise ? [praise.audioId] : []), ...t.ok]));
    } else {
      setTries((n) => n + 1); setStreak((n) => n + 1); setWrong(id); setTimeout(() => setWrong(null), 700);
      if (streak + 1 >= 3) { setCalm(true); setStreak(0); setMsg('Zastavíme se a zkusíme to spolu.'); void say(['snd-fx-try', 'snd-p-mh-calm']); }
      else { setMsg('Skoro! Zkus to znovu.'); void say(['snd-fx-try', 'snd-p-retry-2']); }
    }
  };

  if (!tasks.length) return <main className="screen activity"><button className="kbtn" onClick={back}>Zpět</button><p className="notice">Na tuhle hru zatím není dost slov.</p></main>;
  if (done) return (
    <main className="screen activity game-end" data-testid="game-end">
      <Mascot mood="radost" /><h1>Nálepka do alba!</h1><p>Máš novou nálepku do sady!</p>
      <button className="kbtn kbtn-primary kbtn-xl" data-testid="game-back" onClick={back}>➜ Další hry</button>
    </main>
  );

  const highlight = (calm || (hintOn && game === 'bublinky')) ? t.answer : null;
  const optCls = (id: string) => `kbtn game-opt${wrong === id ? ' is-wrong' : ''}${solved && id === t.answer ? ' is-correct' : ''}${highlight === id ? ' is-hint' : ''}`;
  return (
    <main className={`screen activity game game-${game}`} data-testid="game-round" data-game={game} data-index={i} data-answer-hint={undefined}>
      <header className="topbar row">
        <button className="kbtn" onClick={back}>Zpět</button>
        <div className="progress" data-testid="game-dots">{tasks.map((_, k) => <i key={k} className={k < i ? 'done' : k === i ? 'now' : ''} />)}</div>
        {tries > 0 && <button className="kbtn game-hint" data-testid="game-hint" aria-label="Nápověda" onClick={() => { setHintOn(true); void say(t.hint); }}>🔍</button>}
        {<button className="kbtn" aria-label="Zopakuj zadání" onClick={() => void say(t.prompt)}>🔊</button>}
      </header>
      <div className="game-stage">
        <div className="game-mascot"><Mascot mood={solved ? 'radost' : tries ? 'premysli' : 'povzbuzeni'} /><p className="bubble" data-testid="game-msg">{msg || def.text}</p></div>
        {game === 'ztratilo' && t.show && <div className="game-word" data-testid="game-target">{hintOn && t.img && <img className="game-pale" src={t.img} alt="" />}<Glyphs forms={solved ? t.show : gapForms(t.show, t.gapIndex!)} form={form} /></div>}
        {game === 'detektiv' && t.show && <div className="game-lupa" data-testid="game-target">🔍 <Glyphs forms={t.show} form={form} /></div>}
        {game === 'obchod' && t.show && <div className="game-list" data-testid="game-target"><small>Nákupní lístek</small><Glyphs forms={t.show} form={form} /></div>}
        {game === 'domecky' && t.img && <button className={`game-card${picked ? ' is-picked' : ''}`} data-testid="game-card" data-word={t.word} onClick={() => { setPicked(true); if (t.word) void say([t.word]); }}><img src={t.img} alt="obrázek" /></button>}
        <div className={`game-opts${game === 'bublinky' ? ` sky${hintOn ? ' is-paused' : ''}` : ''}`}>
          {t.options.map((o, k) => (
            <button key={o.id} className={optCls(o.id) + (game === 'domecky' ? ' house' : game === 'bublinky' ? ' bubble-opt' : '')} data-opt={o.id} style={game === 'bublinky' ? { animationDelay: `${k * -1.1}s` } : undefined}
              onClick={(e) => { (e.currentTarget as HTMLElement).blur(); choose(o.id); }} aria-label={o.img ? 'zboží' : undefined}>
              {game === 'domecky' && <span className="roof" aria-hidden>⌂</span>}
              {o.img ? <img src={o.img} alt="" /> : o.forms ? <Glyphs forms={o.forms} form={game === 'domecky' || game === 'detektiv' ? form : form} /> : o.id}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
