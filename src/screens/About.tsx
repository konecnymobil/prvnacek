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
          ) a písmo Playwrite CZ © 2023 The Playwrite Project Authors (TypeTogether), SIL Open Font License 1.1 (
          <a href={`${base}licenses/OFL-PlaywriteCZ.txt`} target="_blank" rel="noreferrer">text licence</a>
          ). Obrázky slov LAMA, MASO, LUPA, PILA, MAPA a OSEL: Twemoji © 2014–2021 Twitter, Inc. a © 2022–dosud Jason Sofonia, Justine De Caires a přispěvatelé projektu jdecked/twemoji, licence CC BY 4.0 (
          <a href={`${base}licenses/LICENSE-GRAPHICS.txt`} target="_blank" rel="noreferrer">text licence</a>
          ), bez úprav. Zvuky: syntetický hlas Microsoft Azure (cs-CZ-VlastaNeural). Ostatní obrázky a texty © projekt Prvňáček.
        </p>
      </section>
    </main>
  );
}
