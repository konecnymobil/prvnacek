import type { Content } from '../content/load';
import type { Screen } from '../App';

export default function About({ content, go }: { content: Content | null; go: (s: Screen) => void }) {
  const base = import.meta.env.BASE_URL;
  return (
    <main className="screen about">
      <header className="topbar">
        <button className="back" onClick={() => go('home')} aria-label="Zpět">
          ‹ Zpět
        </button>
        <h1>O aplikaci</h1>
      </header>
      <section className="card">
        <p>Prvňáček – čtení pro prvňáčky. Data o pokroku a vlastní nahrávky zůstávají jen v tomto zařízení.</p>
        {content && <p className="muted">Verze obsahu: {content.version}</p>}
        <h2>Licence</h2>
        <p data-testid="attribution">
          Písmo Andika © SIL Global, SIL Open Font License 1.1 (
          <a href={`${base}licenses/OFL.txt`} target="_blank" rel="noreferrer">
            text licence
          </a>
          ). Zvuky: syntetický hlas Microsoft Azure (cs-CZ-VlastaNeural). Ostatní obrázky a texty © projekt Prvňáček.
        </p>
      </section>
    </main>
  );
}
