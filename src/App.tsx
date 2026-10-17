import { useEffect, useState } from 'react';
import { loadContent, type Content } from './content/load';
import { requestPersistentStorage } from './storage/db';
import Home from './screens/Home';
import SoundTest from './screens/SoundTest';
import About from './screens/About';
import { PICKED_KEY, ProfilePicker } from './screens/Profiles';
import { getDb } from './storage/db';
import { listProfiles } from './storage/profiles';
import DataPolicy from './screens/DataPolicy';
import LessonMenu from './screens/LessonMenu';
import LetterActivity from './screens/LetterActivity';
import ReadSyllable from './screens/ReadSyllable';
import ReadWord from './screens/ReadWord';
import SyllableActivity from './screens/SyllableActivity';
import ParentGate from './screens/ParentGate';
import ParentHome from './screens/ParentHome';
import ParentTest from './screens/ParentTest';
import ComposeWord from './screens/ComposeWord';
import Pexeso from './screens/Pexeso';
import Review from './screens/Review';
import Sounds from './screens/Sounds';
import Album from './screens/Album';
import MathScreen from './screens/MathScreen';
import Games from './screens/Games';
import type { SubjectId } from './album/album';
import WeeklySummary from './screens/WeeklySummary';
import { ScriptProvider, indexContent } from './components/Glyphs';

/** Obrazovky se přepínají jen ve stavu aplikace – URL se nemění (žádný hash ani history routing,
 *  iOS by jinak mohl resetovat oprávnění mikrofonu). */
export type Screen = 'home' | 'soundTest' | 'about' | 'lesson' | 'letterActivity' | 'syllableActivity' | 'readSyllable' | 'readWord' | 'composeWord' | 'review' | 'pexeso' | 'parentGate' | 'parent' | 'parentTest' | 'sounds' | 'album' | 'weeklySummary' | 'dataPolicy' | 'dataPolicyAbout' | 'profiles' | 'math' | 'games';

export default function App() {
  return <ScriptProvider><AppInner /></ScriptProvider>;
}

function AppInner() {
  const [screen, setScreen] = useState<Screen>('home');
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [albumSubject, setAlbumSubject] = useState<SubjectId | undefined>(undefined);
  const openAlbum = (s: SubjectId) => { setAlbumSubject(s); setScreen('album'); };
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    // obsah se ukáže až po migraci profilů a otevření DB dítěte → nic nečte data dřív, než jsou připravená
    Promise.all([loadContent(), getDb().catch(() => null)]).then(([c]) => { indexContent(c); setContent(c); }, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    requestPersistentStorage().then(setPersisted);
    // víc dětí → úvodní obrazovka „Kdo si bude hrát?“ (jednou za spuštění)
    void getDb().then(() => listProfiles()).then((l) => { if (l.length > 1 && !sessionStorage.getItem(PICKED_KEY)) setScreen('profiles'); }).catch(() => {});
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
      {content && screen === 'review' && <Review content={content} back={() => setScreen('home')} />}
      {content && screen === 'pexeso' && <Pexeso content={content} back={() => setScreen('home')} />}
      {content && screen === 'weeklySummary' && <WeeklySummary content={content} go={setScreen} />}
      {screen === 'parentGate' && <ParentGate go={setScreen} onPass={() => setScreen('parent')} />}
      {content && screen === 'parent' && <ParentHome content={content} go={setScreen} startTest={(id) => { setLessonId(id); setScreen('parentTest'); }} />}
      {lesson && content && screen === 'parentTest' && <ParentTest content={content} lesson={lesson} go={setScreen} />}
      {content && screen === 'sounds' && <Sounds content={content} go={setScreen} />}
      {content && screen === 'album' && <Album key={albumSubject ?? 'r'} content={content} subject={albumSubject} back={() => { setAlbumSubject(undefined); setScreen('home'); }} />}
      {screen === 'math' && <MathScreen back={() => setScreen('home')} openAlbum={() => openAlbum('math')} />}
      {content && screen === 'games' && <Games content={content} back={() => setScreen('home')} />}
      {screen === 'about' && <About content={content} go={setScreen} />}
      {screen === 'profiles' && <ProfilePicker go={setScreen} />}
      {screen === 'dataPolicy' && <DataPolicy go={setScreen} back="parent" />}
      {screen === 'dataPolicyAbout' && <DataPolicy go={setScreen} back="about" />}
    </div>
  );
}
