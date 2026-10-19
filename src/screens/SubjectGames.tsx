/** Prvouka a Angličtina: zatím jen minihry (lekce přijdou později). Prvouka bez zámků (rozhodnutí Jiří). */
import { useState } from 'react';
import SubjGame, { SUBJ_GAMES, enGameNeeds, type SubjGameId } from '../games/WorldEnglishGames';
import { hasAll, useAudioIndex } from '../audio/available';

export default function SubjectGames({ subject, back, openAlbum }: { subject: 'world' | 'english'; back: () => void; openAlbum: () => void }) {
  const [game, setGame] = useState<SubjGameId | null>(null);
  const [soon, setSoon] = useState(false);
  const idx = useAudioIndex();
  if (game) return <SubjGame id={game} back={() => setGame(null)} openAlbum={openAlbum} />;
  const w = subject === 'world';
  return (
    <main className={`screen activity ${w ? 'subj--prv' : 'subj--aj'}`} data-testid={`subject-${subject}`}>
      <header className="topbar row"><button className="kbtn" onClick={back}>‹ Zpět</button><h1>{w ? '🌳 Prvouka' : '🐶 Angličtina'}</h1></header>
      <h2>🎲 Hry</h2>
      <div className="subj-games">
        {SUBJ_GAMES.filter((g) => g.subject === subject).map((g) => {
          const open = hasAll(idx, enGameNeeds(g.id));
          return (
            <button key={g.id} className={`game-tile${open ? '' : ' is-locked'}`} data-game={g.id} data-locked={open ? 'false' : 'true'} onClick={() => (open ? setGame(g.id) : setSoon(true))}>
              <span className="game-icon">{open ? g.icon : '🔒'}</span><span>{g.name}</span>{!open && <span className="small" data-testid="game-soon">Brzy</span>}
            </button>
          );
        })}
      </div>
      {soon && <p className="notice" role="status" data-testid="game-lock-hint">🔒 Tahle hra přijde brzy – čekáme na nahrávky.</p>}
    </main>
  );
}
