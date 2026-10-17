import { useEffect, useState } from 'react';
import type { Screen } from '../App';
import { AVATARS, addProfile, avatarEmoji, deleteProfile, getActiveProfile, getSnapshot, listProfiles, setActiveProfile, updateProfile, type AvatarId, type ChildProfile } from '../storage/profiles';

export const PICKED_KEY = 'prvnacek:profilePicked';
/** Přepnutí dítěte: uloží aktivní profil a znovu načte appku (všechna data se pak čtou z DB nového dítěte). */
export async function switchProfile(id: string): Promise<void> {
  await setActiveProfile(id);
  sessionStorage.setItem(PICKED_KEY, '1');
  window.location.reload();
}

export function useProfiles(dep: unknown = null) {
  const [list, setList] = useState<ChildProfile[]>([]);
  const [active, setActive] = useState<ChildProfile | undefined>();
  const reload = async () => { const l = await listProfiles(); setList(l); setActive(await getActiveProfile()); };
  useEffect(() => { void reload(); }, [dep]); // eslint-disable-line react-hooks/exhaustive-deps
  return { list, active, reload };
}

/** Dítě: „Kdo si bude hrát?“ – velké dlaždice se zvířátkem, jméno malé (pro rodiče). Bez čtení. */
export function ProfilePicker({ go }: { go: (s: Screen) => void }) {
  const { list, active } = useProfiles();
  const pick = (p: ChildProfile) => { if (p.id === active?.id) { sessionStorage.setItem(PICKED_KEY, '1'); go('home'); } else void switchProfile(p.id); };
  return (
    <main className="screen profiles" data-testid="profile-picker">
      <h1 className="sr-only">Kdo si bude hrát?</h1>
      <div className="profile-tiles">
        {list.map((p) => (
          <button key={p.id} className={`tile profile-tile${p.id === active?.id ? ' is-active' : ''}`} data-testid="profile-tile" data-child={p.id} onClick={() => pick(p)} aria-label={`${p.name} (${AVATARS.find((a) => a.id === p.avatar)?.label ?? ''})`}>
            <span className="profile-emoji" aria-hidden="true">{avatarEmoji(p.avatar)}</span>
            <span className="profile-name small muted">{p.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

/** Rodič (za branou): děti v zařízení – přidat, přejmenovat, zvířátko, přepnout, smazat (2 kroky), snímek před migrací. */
export function ProfilesPanel({ refresh }: { refresh?: unknown }) {
  const { list, active, reload } = useProfiles(refresh);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>('zelva');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [snap, setSnap] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void getSnapshot().then((s) => setSnap(!!s)); }, []);

  const downloadSnap = async () => {
    const s = await getSnapshot();
    if (!s) return;
    const url = URL.createObjectURL(new Blob([s.json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `prvnacek-zaloha-pred-profily-${new Date(s.at).toISOString().slice(0, 10)}-v2.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <section className="card" data-testid="profiles-panel">
      <h2>Děti v tomto zařízení</h2>
      <ul className="profile-list">
        {list.map((p) => (
          <li key={p.id} data-testid="profile-row" data-child={p.id}>
            <span className="profile-emoji-sm" aria-hidden="true">{avatarEmoji(p.avatar)}</span>
            <input aria-label="Jméno dítěte" data-testid="profile-name" value={edits[p.id] ?? p.name} onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })} />
            <select aria-label="Zvířátko" data-testid="profile-avatar" value={p.avatar} onChange={(e) => void updateProfile(p.id, { avatar: e.target.value as AvatarId }).then(reload)}>
              {AVATARS.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.label}</option>)}
            </select>
            {edits[p.id] !== undefined && edits[p.id] !== p.name && <button className="kbtn" data-testid="profile-rename" onClick={() => void updateProfile(p.id, { name: edits[p.id] }).then(() => { setEdits({}); return reload(); })}>Uložit</button>}
            {p.id === active?.id ? <span className="muted small" data-testid="profile-active">(právě hraje)</span> : <button className="kbtn" data-testid="profile-switch-to" onClick={() => void switchProfile(p.id)}>Přepnout</button>}
            {list.length > 1 && (confirmDel === p.id ? (
              <span className="notice" role="alertdialog">
                Smaže se pokrok, nastavení, album i nahrávky dítěte „{p.name}“. Doporučujeme nejdřív stáhnout zálohu.{' '}
                <button className="kbtn" data-testid="profile-delete-yes" onClick={() => void deleteProfile(p.id).then(() => (p.id === active?.id ? window.location.reload() : reload()), (e: Error) => setErr(e.message)).finally(() => setConfirmDel(null))}>Ano, smazat</button>
                <button className="kbtn" onClick={() => setConfirmDel(null)}>Zrušit</button>
              </span>
            ) : <button className="kbtn" data-testid="profile-delete" onClick={() => setConfirmDel(p.id)}>Smazat…</button>)}
          </li>
        ))}
      </ul>
      <div className="row">
        <input aria-label="Jméno nového dítěte" placeholder="Jméno" data-testid="profile-new-name" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Zvířátko nového dítěte" data-testid="profile-new-avatar" value={avatar} onChange={(e) => setAvatar(e.target.value as AvatarId)}>
          {AVATARS.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.label}</option>)}
        </select>
        <button className="kbtn kbtn-primary" data-testid="profile-add" onClick={() => void addProfile(name, avatar).then(() => { setName(''); return reload(); })}>➕ Přidat dítě</button>
      </div>
      {err && <p className="notice is-error" role="alert">{err}</p>}
      {snap && <p><button className="kbtn" data-testid="snapshot-download" onClick={() => void downloadSnap()}>⬇ Záloha z doby před profily</button></p>}
    </section>
  );
}
