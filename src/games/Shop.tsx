/** Slabikový obchod (obsah shop.json, 2026-10-19.9): lístek se 3 slovy, 5 obrázků (3 z lístku + 2 podobné).
 *  Správný obrázek jde do košíku a řádek lístku se odškrtne, špatný se vrátí na místo. Po 2. chybě se rozsvítí
 *  a zazní slovo, které ještě v košíku není. Kolo končí, když jsou v košíku všechna 3. */
import { useEffect, useMemo, useState } from 'react';
import Mascot from '../activities/Mascot';
import Glyphs, { useTaskForm } from '../components/Glyphs';
import type { Content } from '../content/load';
import { wordImageUrl } from '../content/images';
import kosik from '../assets/img/kosik.svg';
import { say, stopSay } from '../activities/common';
import { shuffle } from '../activities/fresh';
import { awardSticker } from '../album/album';
import { getSetting, setSetting } from '../storage/db';
import { pickShopSet } from './games';

const GAMES_KEY = 'games:rounds'; // stejné jako Games.tsx (týdenní souhrn)
const PRAISE = ['Výborně!', 'Správně!', 'To je ono!'];

export default function ShopRound({ content, idx, back }: { content: Content; idx: number; back: () => void }) {
  const [pick] = useState(() => pickShopSet(content, idx));
  const instr = content.shop?.instructionAudioId ?? 'snd-p-mh-obchod-listek';
  const list = useMemo(() => (pick ? pick.set.listWordIds.map((id) => content.wordById.get(id)!) : []), [pick, content]);
  const pics = useMemo(() => (pick ? shuffle([...pick.set.listWordIds, ...pick.set.distractorWordIds]).map((id) => content.wordById.get(id)!) : []), [pick, content]);
  const [basket, setBasket] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [miss, setMiss] = useState(0); // chyby od posledního správného
  const [tries, setTries] = useState<Record<string, number>>({});
  const [hintFor, setHintFor] = useState<string | null>(null);
  const [hinted, setHinted] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [started] = useState(() => new Date().toISOString());
  const form = useTaskForm(pick?.set.id);
  const done = list.length > 0 && basket.length === list.length;
  const next = list.find((w) => !basket.includes(w.id));

  useEffect(() => { if (pick) void say(['snd-p-game-obchod', instr]); return () => stopSay(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!done) return;
    void (async () => {
      const stickerId = await awardSticker('hra', { refId: 'obchod' }).catch(() => null);
      const r = { gameId: 'obchod', startedAt: started, finishedAt: new Date().toISOString(), setId: pick!.set.id, tasks: list.map((w) => ({ id: w.id, tries: tries[w.id] ?? 1, hintUsed: hinted.has(w.id) })), stickerId };
      await setSetting(GAMES_KEY, [...((await getSetting<unknown[]>(GAMES_KEY)) ?? []), r]);
    })().catch(() => {});
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const showHint = () => { if (!next) return; setHintFor(next.id); setHinted((s) => new Set(s).add(next.id)); void say([next.audioId]); };
  const choose = (id: string) => {
    if (done || basket.includes(id) || !next) return;
    if (list.some((w) => w.id === id)) {
      const w = content.wordById.get(id)!;
      setTries((t) => ({ ...t, [id]: (t[id] ?? 0) + 1 }));
      const nb = [...basket, id];
      setBasket(nb); setMiss(0); setHintFor(null);
      if (nb.length === list.length) { setMsg('Máš všechno!'); void say(['snd-fx-ok', w.audioId, 'snd-fx-tada', 'snd-p-mh-sticker-set']); }
      else { setMsg(PRAISE[nb.length % PRAISE.length]); void say(['snd-fx-ok', w.audioId]); }
    } else {
      setTries((t) => ({ ...t, [next.id]: (t[next.id] ?? 0) + 1 }));
      setWrong(id); setTimeout(() => setWrong(null), 700);
      const m = miss + 1; setMiss(m);
      setMsg('Skoro! Tohle na lístku není.');
      if (m >= 2) { setHintFor(next.id); setHinted((s) => new Set(s).add(next.id)); void say(['snd-fx-try', next.audioId]); }
      else void say(['snd-fx-try', 'snd-p-retry-2']);
    }
  };

  if (!pick) return <main className="screen activity"><button className="kbtn" onClick={back}>Zpět</button><p className="notice">Na tuhle hru zatím není dost slov.</p></main>;
  return (
    <main className="screen activity game game-obchod" data-testid="game-round" data-game="obchod" data-set={pick.set.id} data-older={pick.older ? 'true' : 'false'} data-index={basket.length}>
      <header className="topbar row">
        <button className="kbtn" onClick={back}>Zpět</button>
        <div className="progress" data-testid="game-dots">{list.map((w) => <i key={w.id} className={basket.includes(w.id) ? 'done' : ''} />)}</div>
        {Object.keys(tries).length > 0 && !done && <button className="kbtn game-hint" data-testid="game-hint" aria-label="Nápověda" onClick={showHint}>🔍</button>}
        <button className="kbtn" aria-label="Zopakuj zadání" onClick={() => void say([instr])}>🔊</button>
      </header>
      <div className="game-stage shop-stage">
        <div className="game-mascot"><Mascot mood={done ? 'radost' : miss ? 'premysli' : 'povzbuzeni'} /><p className="bubble" data-testid="game-msg">{msg || 'Přečti lístek a dej zboží do košíku.'}</p></div>
        <div className="shop-top">
          <div className="game-list shop-list" data-testid="shop-list">
            <small>Nákupní lístek</small>
            <ol aria-label="Nákupní lístek">
            {list.map((w) => (
              <li key={w.id} data-word={w.id} data-done={basket.includes(w.id) ? 'true' : 'false'} className={`${basket.includes(w.id) ? 'is-done' : ''}${hintFor === w.id ? ' is-hint' : ''}`}>
                <Glyphs forms={w.forms} form={form} />{basket.includes(w.id) && <span className="tick" aria-hidden> ✓</span>}
              </li>
            ))}
            </ol>
          </div>
          <div className="shop-basket" data-testid="shop-basket">
            <img className="shop-kosik" src={kosik} alt="košík" />
            <div className="shop-in">{basket.map((id) => <img key={id} data-word={id} src={wordImageUrl(content.wordById.get(id)!)!} alt="" />)}</div>
          </div>
        </div>
        {done ? (
          <div className="game-end" data-testid="game-end">
            <h1>Nálepka do alba!</h1><p>Máš novou nálepku do sady!</p>
            <button className="kbtn kbtn-primary kbtn-xl" data-testid="game-back" onClick={back}>➜ Další hry</button>
          </div>
        ) : (
          <div className="game-opts">
            {pics.filter((w) => !basket.includes(w.id)).map((w) => (
              <button key={w.id} className={`kbtn game-opt${wrong === w.id ? ' is-wrong' : ''}`} data-opt={w.id} aria-label="zboží"
                onClick={(e) => { (e.currentTarget as HTMLElement).blur(); choose(w.id); }}>
                <img src={wordImageUrl(w)!} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
