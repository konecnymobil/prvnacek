/** Prvouka a Angličtina: zatím jen minihry (lekce přijdou později). Prvouka bez zámků (rozhodnutí Jiří). */
import HomeButton from '../components/HomeButton';
import { useState } from 'react';
import { useTileTap } from '../games/tileTap';
import pejsek from '../assets/subject/pejsek.svg';
import SubjGame, { SUBJ_GAMES, type SubjGameId } from '../games/WorldEnglishGames';

export default function SubjectGames({ subject, back, openAlbum }: { subject: 'world' | 'english'; back: () => void; openAlbum: () => void }) {
  const [game, setGame] = useState<SubjGameId | null>(null);
  const tiles = useTileTap();
  if (game) return <SubjGame id={game} back={() => setGame(null)} openAlbum={openAlbum} />;
  const w = subject === 'world';
  return (
    <main className={`screen activity ${w ? 'subj--prv' : 'subj--aj'}`} data-testid={`subject-${subject}`}>
      <header className="topbar row"><HomeButton onClick={back} /><h1>{w ? '🌳 Prvouka' : <><img className="subj-dog" src={pejsek} alt="" /> Angličtina</>}</h1></header>
      <h2>🎲 Hry</h2>
      <div className="subj-games">
        {SUBJ_GAMES.filter((g) => g.subject === subject).map((g) => <button key={g.id} className={`game-tile${tiles.selected === g.id ? ' is-selected' : ''}`} data-game={g.id} onClick={() => tiles.tap(g.id, () => setGame(g.id))}><span className="game-icon">{g.icon}</span><span>{g.name}</span></button>)}
      </div>
    </main>
  );
}
