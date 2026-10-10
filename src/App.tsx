import { useEffect, useState } from 'react';
import { loadContent, type Content } from './content/load';
import { requestPersistentStorage } from './storage/db';
import Home from './screens/Home';
import SoundTest from './screens/SoundTest';
import About from './screens/About';
import LessonMenu from './screens/LessonMenu';
import LetterActivity from './screens/LetterActivity';
import ReadSyllable from './screens/ReadSyllable';
import ReadWord from './screens/ReadWord';
import SyllableActivity from './screens/SyllableActivity';
import ParentGate from './screens/ParentGate';
import ParentHome from './screens/ParentHome';
import ParentTest from './screens/ParentTest';
import ComposeWord from './screens/ComposeWord';
import Sounds from './screens/Sounds';
import { ScriptProvider, indexContent } from './components/Glyphs';

/** Obrazovky se přepínají jen ve stavu aplikace – URL se nemění (žádný hash ani history routing,
 *  iOS by jinak mohl resetovat oprávnění mikrofonu). */
export type Screen = 'home' | 'soundTest' | 'about' | 'lesson' | 'letterActivity' | 'syllableActivity' | 'readSyllable' | 'readWord' | 'composeWord' | 'parentGate' | 'parent' | 'parentTest' | 'sounds';

export default function App() {
  return <ScriptProvider><AppInner /></ScriptProvider>;
}

function AppInner() {
  const [screen, setScreen] = useState<Screen>('home');
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    loadContent().then((c) => { indexContent(c); setContent(c); }, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    requestPersistentStorage().then(setPersisted);
  }, []);

  const lesson = content && lessonId ? content.orders[content.defaultOrderId].lessons.find((l) => l.id === lessonId) : undefined;

  return (
    <div className="app" data-screen={screen}>
      {screen === 'home' && <Home content={content} error={error} go={setScreen} openLesson={(id) => { setLessonId(id); setScreen('lesson'); }} />}
      {screen === 'soundTest' && <SoundTest content={content} persisted={persisted} go={setScreen} />}
      {lesson && content && screen === 'lesson' && <LessonMenu content={content} lesson={lesson} go={setScreen} />}
      {lesson && content && screen === 'letterActivity' && <LetterActivity content={content} lesson={lesson} back={() => setScreen('lesson')} />}
      {lesson && content && screen === 'syllableActivity' && <SyllableActivity content={content} lesson={lesson} back={() => setScreen('lesson')} />}
      {lesson && content && screen === 'readSyllable' && <ReadSyllable content={content} lesson={lesson} back={() => setScreen('lesson')} />}
      {lesson && content && screen === 'readWord' && <ReadWord content={content} lesson={lesson} back={() => setScreen('lesson')} />}
      {lesson && content && screen === 'composeWord' && <ComposeWord content={content} lesson={lesson} back={() => setScreen('lesson')} />}
      {screen === 'parentGate' && <ParentGate go={setScreen} onPass={() => setScreen('parent')} />}
      {content && screen === 'parent' && <ParentHome content={content} go={setScreen} startTest={(id) => { setLessonId(id); setScreen('parentTest'); }} />}
      {lesson && content && screen === 'parentTest' && <ParentTest content={content} lesson={lesson} go={setScreen} />}
      {content && screen === 'sounds' && <Sounds content={content} go={setScreen} />}
      {screen === 'about' && <About content={content} go={setScreen} />}
    </div>
  );
}
