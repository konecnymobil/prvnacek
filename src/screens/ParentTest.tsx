import { awardSticker } from '../album/album';
import { GlyphText, useTaskForm } from '../components/Glyphs';
import { useMemo, useState } from 'react';
import type { Content } from '../content/load';
import type { ErrorReasonId, Lesson, TestItem } from '../content/types';
import { evaluateTest } from '../content/types';
import type { Screen } from '../App';
import { buildTest } from '../parent/testBuilder';
import { approveLesson, saveTestResult } from '../storage/db';

interface Res { correct: boolean; reason: ErrorReasonId | null }

/** Živý závěrečný test: dítě čte nahlas, rodič ťuká ✓/✗. Zpět = vrácení posledního hodnocení. */
export default function ParentTest({ content, lesson, go }: { content: Content; lesson: Lesson; go: (s: Screen) => void }) {
  const rules = content.testRules;
  const orderId = content.defaultOrderId;
  const order = content.orders[orderId];
  const bp = rules.blueprints.find((b) => b.orderId === orderId && b.lessonId === lesson.id);
  const [seed, setSeed] = useState(0);
  const items = useMemo<TestItem[]>(() => (bp ? buildTest(content, bp) : []), [content, bp, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const [started, setStarted] = useState(false);
  const [results, setResults] = useState<Res[]>([]);
  const [askReason, setAskReason] = useState(false);
  const [paused, setPaused] = useState(false);
  const [approved, setApproved] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false); // A-28: potvrzení schválení bez doporučení
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useTaskForm(`${seed}:${results.length}`); // jedna forma na položku zkoušky

  if (!bp) {
    return (
      <main className="screen parent"><button className="back" onClick={() => go('parent')}>‹ Zpět</button><p className="notice is-error">Pro tuto lekci chybí zkouška v obsahu.</p></main>
    );
  }

  const idx = results.length;
  const done = started && idx >= items.length;
  const item = items[idx];
  const typeInfo = item ? rules.itemTypes.find((t) => t.id === item.type) : undefined;
  const reviewKindLabel = item?.reviewKind === 'word' ? 'slovo' : item?.reviewKind === 'syllable' ? 'slabika' : item?.reviewKind === 'letter' ? 'písmeno' : '';

  const answer = (correct: boolean, reason: ErrorReasonId | null = null) => {
    setAskReason(false);
    setResults((r) => [...r, { correct, reason }]);
  };
  const undo = () => {
    if (askReason) return setAskReason(false);
    setSaved(false);
    setApproved(null);
    setResults((r) => r.slice(0, -1));
  };

  const evalRes = done
    ? evaluateTest(results.map((r, i) => ({ correct: r.correct, countsAsNewLetter: items[i].containsNewLetter })), { minRatio: rules.passRule.minRatio, maxNewLetterErrors: bp.maxNewLetterErrors })
    : null;

  const persist = async () => {
    if (!evalRes || saved) return;
    try {
      await saveTestResult(orderId, {
        at: Date.now(), lessonId: lesson.id, ...evalRes,
        errors: results.flatMap((r, i) => (r.correct ? [] : [{ text: items[i].text, type: items[i].type, reason: r.reason, refId: items[i].refId, reviewKind: items[i].reviewKind }])),
      });
      setSaved(true);
      void awardSticker('snaha', { refId: lesson.id }).catch(() => {});
    } catch {
      setSaveErr('Výsledek zkoušky se nepodařilo uložit do iPadu.');
    }
  };

  const approve = async () => {
    const next = order.lessons.find((l) => l.index === lesson.index + 1)?.id ?? null;
    try {
      await persist();
      await approveLesson(orderId, lesson.id, next, 'test');
      void awardSticker('lekce', { letter: content.letterById.get(lesson.primaryLetterId)?.upper, refId: lesson.id }).catch(() => {});
      const nl = next ? order.lessons.find((l) => l.id === next) : null;
      setApproved(nl ? `Schváleno ✓ Odemčena lekce ${nl.index}: ${nl.title}.` : 'Schváleno ✓ To byla poslední lekce.');
    } catch {
      setSaveErr('Schválení se nepodařilo uložit do iPadu. Zkus to znovu.');
    }
  };

  if (!started) {
    return (
      <main className="screen parent" data-testid="test-intro">
        <header className="topbar"><button className="back" onClick={() => go('parent')}>‹ Zpět</button><h1>Zkouška – lekce {lesson.index}: {lesson.title}</h1></header>
        <section className="card">
          <p>{items.length} položek. Dítě čte nahlas, vy jen hodnotíte ✓ nebo ✗.</p>
          <ul>{rules.parentGuideShort.map((t) => <li key={t}>{t}</li>)}</ul>
          {bp.compromiseNote && <p className="small muted">{bp.compromiseNote}</p>}
          <button className="kbtn kbtn-primary kbtn-xl" data-testid="test-start" onClick={() => setStarted(true)}>Začít zkoušku</button>
        </section>
      </main>
    );
  }

  if (done && evalRes) {
    const errors = results.flatMap((r, i) => (r.correct ? [] : [{ item: items[i], reason: r.reason }]));
    return (
      <main className="screen parent" data-testid="test-result" data-recommend={evalRes.recommendApprove}>
        <header className="topbar"><h1>Výsledek zkoušky</h1></header>
        <section className="card">
          <p className="big" data-testid="test-score">{evalRes.score} / {evalRes.total}</p>
          <p data-testid="test-verdict">
            {evalRes.recommendApprove ? '🟢 Podle pravidel doporučeno schválit.' : 'Podle pravidel zatím nedoporučeno schválit – doporučujeme procvičit a zkusit další den.'}
          </p>
          <p className="small muted">{rules.passRule.text}</p>
          {errors.length > 0 && (
            <ul data-testid="test-errors">
              {errors.map((e, i) => (
                <li key={i}>{e.item.text} – {rules.errorReasons.find((r) => r.id === e.reason)?.label ?? 'bez důvodu'}</li>
              ))}
            </ul>
          )}
          {saveErr && <p className="notice is-error" role="alert">{saveErr}</p>}
          {approved ? <p className="notice" data-testid="approved-msg">{approved}</p> : (
            confirming ? (
              <div className="dlg-back" onKeyDown={(e) => e.key === 'Escape' && setConfirming(false)}>
                <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="approve-confirm-title" data-testid="approve-confirm">
                  <h2 id="approve-confirm-title">Opravdu odemknout?</h2>
                  <p>Aplikace by ještě chvíli procvičovala. Rozhodnutí je na vás – když lekci odemknete, procvičování písmene {lesson.title} zůstane v opakování.</p>
                  <div className="row">
                    <button className="kbtn" autoFocus data-testid="approve-confirm-no" onClick={() => setConfirming(false)}>Ještě počkáme</button>
                    <button className="kbtn kbtn-primary" data-testid="approve-confirm-yes" onClick={() => void approve()}>Odemknout</button>
                  </div>
                </div>
              </div>
            ) : (
              <button className="kbtn kbtn-primary kbtn-xl" data-testid="approve" onClick={() => (evalRes.recommendApprove ? void approve() : setConfirming(true))}>✓ Schválit lekci a odemknout další</button>
            )
          )}
          <div className="row">
            <button className="kbtn" onClick={undo} data-testid="test-undo">↶ Zpět (opravit poslední)</button>
            <button className="kbtn" onClick={() => { void persist(); setResults([]); setStarted(false); setApproved(null); setSaved(false); setSeed((s) => s + 1); }}>Zkusit znovu</button>
            <button className="kbtn" onClick={() => { void persist(); go('parent'); }} data-testid="test-exit">Hotovo</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="screen parent test-run" data-testid="test-run" data-index={idx}>
      <header className="topbar">
        <button className="back" onClick={() => go('parent')}>‹ Ukončit</button>
        <h1 data-testid="test-progress">{idx + 1} / {items.length}</h1>
        <button className="kbtn" onClick={() => setPaused(true)} data-testid="test-pause">⏸ Pauza</button>
      </header>
      {paused ? (
        <section className="card" data-testid="test-paused">
          <p>Zkouška je pozastavená.</p>
          <button className="kbtn kbtn-primary kbtn-xl" onClick={() => setPaused(false)} data-testid="test-resume">▶ Pokračovat</button>
        </section>
      ) : (
        <>
          <section className="card test-item">
            <p className="small muted">{typeInfo?.label}{reviewKindLabel ? ` (${reviewKindLabel})` : ''}</p>
            <p className="test-text" data-testid="test-text" data-type={item.type}><GlyphText text={item.text} form={form} /></p>
            <p className="small muted">{typeInfo?.correctWhen}</p>
          </section>
          {askReason ? (
            <section className="card" data-testid="reason-pick">
              <p>Proč to nebylo správně?</p>
              <div className="row">
                {rules.errorReasons.map((r) => (
                  <button key={r.id} className="kbtn kbtn-xl" onClick={() => answer(false, r.id)} data-reason={r.id} title={r.hint}>{r.label}</button>
                ))}
                <button className="kbtn" onClick={() => answer(false, null)} data-reason="none">bez důvodu</button>
              </div>
            </section>
          ) : (
            <div className="row">
              <button className="kbtn kbtn-xl rate-ok" onClick={() => answer(true)} data-testid="rate-ok" aria-label="Správně">✓</button>
              <button className="kbtn kbtn-xl rate-bad" onClick={() => setAskReason(true)} data-testid="rate-bad" aria-label="Chyba">✗</button>
            </div>
          )}
          <div className="row">
            <button className="kbtn" onClick={undo} disabled={idx === 0 && !askReason} data-testid="test-undo">↶ Zpět</button>
          </div>
        </>
      )}
    </main>
  );
}
