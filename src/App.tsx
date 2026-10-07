import { useEffect, useState } from 'react';
import { loadContent, type Content } from './content/load';
import { requestPersistentStorage } from './storage/db';
import Home from './screens/Home';
import SoundTest from './screens/SoundTest';
import About from './screens/About';

/** Obrazovky se přepínají jen ve stavu aplikace – URL se nemění (žádný hash ani history routing,
 *  iOS by jinak mohl resetovat oprávnění mikrofonu). */
export type Screen = 'home' | 'soundTest' | 'about';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    loadContent().then(setContent, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    requestPersistentStorage().then(setPersisted);
  }, []);

  return (
    <div className="app" data-screen={screen}>
      {screen === 'home' && <Home content={content} error={error} go={setScreen} />}
      {screen === 'soundTest' && <SoundTest content={content} persisted={persisted} go={setScreen} />}
      {screen === 'about' && <About content={content} go={setScreen} />}
    </div>
  );
}
