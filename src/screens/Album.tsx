/** M4 Album nálepek (dítě). Bez počtů „4/12“, bez „chybí“, nic nejde ztratit. */
import { useEffect, useRef, useState } from 'react';
import type { Content } from '../content/load';
import { say, stopSay } from '../activities/common';
import { SETS, SOURCE_TEXT, SUBJECT_TABS, setSubject, type SubjectId, getOwned, markSeen, type OwnedSticker, type StickerDef, type StickerId } from '../album/album';

const urls = import.meta.glob('../assets/img/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const src = (id: StickerId) => (id.startsWith('L:') ? undefined : urls[`../assets/img/${id.slice(2)}.svg`]);
const FLY_DELAY = 1600;

function Sticker({ id, special, big }: { id: StickerId; special?: boolean; big?: boolean }) {
  return (
    <span className={`stk${special ? ' stk--special' : ''}${big ? ' stk--big' : ''}`}>
      {id.startsWith('L:') ? <span className="stk-letter">{id.slice(2)}</span> : id.startsWith('e:') ? <span className="stk-emoji">{id.slice(2)}</span> : <img src={src(id)} alt="" />}
    </span>
  );
}

export default function Album({ content, back, subject: initialSubject }: { content: Content; back: () => void; subject?: SubjectId }) {
  const [owned, setOwned] = useState<OwnedSticker[] | null>(null);
  const [subject, setSubjectTab] = useState<SubjectId>(initialSubject ?? 'cz-reading');
  const [tab, setTab] = useState(() => Math.max(0, SETS.findIndex((x) => setSubject(x) === (initialSubject ?? 'cz-reading'))));
  const [detail, setDetail] = useState<StickerDef | null>(null);
  const [fresh, setFresh] = useState<StickerId | null>(null); // nová nálepka uprostřed
  const [glow, setGlow] = useState<Set<string>>(new Set());
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void getOwned().then((o) => {
      setOwned(o);
      const unseen = o.filter((x) => !x.seen).map((x) => x.stickerId);
      if (unseen.length) {
        const last = unseen[unseen.length - 1];
        const si = SETS.findIndex((s) => s.items.some((i) => i.id === last));
        if (si >= 0) { setTab(si); setSubjectTab(setSubject(SETS[si])); }
        setFresh(last);
        const fly = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stk-fly-duration')) || 0;
        window.setTimeout(() => { setFresh(null); setGlow(new Set(unseen)); }, FLY_DELAY + fly);
        void markSeen();
      }
    });
    return () => stopSay();
  }, []);
  useEffect(() => {
    if (!detail) return;
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetail(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [detail]);

  const own = new Map((owned ?? []).map((o) => [o.stickerId, o]));
  const set = SETS[tab];
  const audioFor = (def: StickerDef): string | undefined => {
    if (def.id.startsWith('L:')) return content.letters.find((l) => l.upper === def.word)?.audioId;
    return content.words.find((w) => w.textLower === def.word)?.audioId;
  };
  const od = detail ? own.get(detail.id) : undefined;
  const da = detail ? audioFor(detail) : undefined;

  return (
    <main className="screen album" data-testid="album">
      <header className="topbar">
        <button className="back" onClick={back}>‹ Zpět</button>
        <div className="alb-subjects" role="tablist" aria-label="Předměty">
          {SUBJECT_TABS.filter((t) => SETS.some((x) => setSubject(x) === t.id)).map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === subject} aria-label={t.name} className={`kbtn alb-subj subj--${t.id === 'cz-reading' ? 'cti' : t.id === 'math' ? 'mat' : t.id === 'world' ? 'prv' : 'aj'}`} data-testid={`alb-subj-${t.id}`}
              onClick={() => { setSubjectTab(t.id); setTab(SETS.findIndex((x) => setSubject(x) === t.id)); }}>{t.icon}</button>
          ))}
        </div>
        <div className="alb-tabs" role="tablist">
          {SETS.map((s, i) => setSubject(s) !== subject ? null : (
            <button key={s.id} role="tab" aria-selected={i === tab} className="kbtn alb-tab" data-testid={`alb-tab-${s.id}`} onClick={() => setTab(i)}>
              {s.icon.startsWith('L:') ? <span className="stk-letter sm">{s.icon.slice(2)}</span> : s.icon.startsWith('e:') ? <span className="stk-emoji sm">{s.icon.slice(2)}</span> : <img src={src(s.icon)} alt="" />}
              {s.name}
            </button>
          ))}
        </div>
      </header>
      <section className="alb-page" role="tabpanel" aria-label={set.name}>
        <div className={`alb-grid${set.special ? ' is-special' : ''}`}>
          {owned && set.items.map((it) => {
            const o = own.get(it.id);
            const state = o ? (glow.has(it.id) ? 'is-own is-new' : 'is-own') : 'is-empty';
            return (
              <button key={it.id} className={`alb-slot ${state}${set.special ? ' is-special' : ''}`} data-sticker={it.id} data-state={o ? 'own' : 'empty'}
                aria-label={o ? it.word : 'prázdné místo'} disabled={!o} onClick={() => o && setDetail(it)}>
                {o && fresh !== it.id ? <Sticker id={it.id} special={it.special} />
                  : <span className="stk-empty">{set.special && <span className="stk-letter ghost">{it.word}</span>}</span>}
              </button>
            );
          })}
        </div>
      </section>
      <div className="alb-new" hidden={!fresh} aria-live="polite" data-testid="alb-new">
        {fresh && <><p className="alb-new-t">Nová nálepka do alba!</p><Sticker id={fresh} special={fresh.startsWith('L:')} big /></>}
      </div>
      {detail && (
        <div className="alb-detail" role="dialog" aria-modal="true" aria-label={detail.word} data-testid="alb-detail" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="alb-detail-card">
            <Sticker id={detail.id} special={detail.special} big />
            <h2>{detail.word}</h2>
            {da && <button className="kbtn" onClick={() => void say([da])} aria-label="Přečti">🔊</button>}
            {od && <p>Získáno {SOURCE_TEXT[od.source]} · {new Date(od.earnedAt).toLocaleDateString('cs-CZ')}</p>}
            <button ref={closeRef} className="kbtn" onClick={() => setDetail(null)} aria-label="Zavřít" data-testid="alb-close">✕</button>
          </div>
        </div>
      )}
    </main>
  );
}
