/** Prvouka a Angličtina: zatím jen minihry (lekce přijdou později). Prvouka bez zámků (rozhodnutí Jiří). */
import { useState } from 'react';
import SubjGame, { SUBJ_GAMES, type SubjGameId } from '../games/WorldEnglishGames';

export default function SubjectGames({ subject, back, openAlbum }: { subject: 'world' | 'english'; back: () => void; openAlbum: () => void }) {
  const [game, setGame] = useState<SubjGameId | null>(null);
  if (game) return <SubjGame id={game} back={() => setGame(null)} openAlbum={openAlbum} />;
  const w = subject === 'world';
  return (
    <main className={`screen activity ${w ? 'subj--prv' : 'subj--aj'}`} data-testid={`subject-${subject}`}>
      <header className="topbar row"><button className="kbtn" onClick={back}>‹ Zpět</button><h1>{w ? '🌳 Prvouka' : '🐶 Angličtina'}</h1></header>
      <h2>🎲 Hry</h2>
      <div className="subj-games">
        {SUBJ_GAMES.filter((g) => g.subject === subject).map((g) => <button key={g.id} className="game-tile" data-game={g.id} onClick={() => setGame(g.id)}><span className="game-icon">{g.icon}</span><span>{g.name}</span></button>)}
      </div>
    </main>
  );
}
