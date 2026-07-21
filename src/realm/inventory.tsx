// ============================================================
// PLAYER INVENTORY (Wave 10, Part C) — On person vs. Home base.
// Item EXISTENCE is Canonical (the DM grants it; it arrives in the
// snapshot). Item ARRANGEMENT is the player's own, stored in
// item_locations behind RLS, exactly like decoration. The Realm
// merges the two, defaulting to 'person' when no row exists — so
// nothing vanishes for a player who has never organised anything.
//
// Moving is frictionless on a phone: an always-there tap button per
// row (→ Home / → Person) PLUS drag-and-drop where it works well.
// The party stash (ownerId null) is shown read-only.
// ============================================================

import { useEffect, useState } from 'preact/hooks';
import type { PlayerView, PvItem } from '../tv/projection';
import type { RealmSession, ItemLocation } from '../backend/realm-client';
import { listItemLocations, setItemLocation } from '../backend/realm-client';
import { propById } from '../data/props';

export function InventoryPanel({ session, v }: { session: RealmSession; v: PlayerView }) {
  const [locs, setLocs] = useState<Record<string, ItemLocation>>({});
  const [err, setErr] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  // Placed props ride the inventory wire; they are furniture, not gear — never
  // the player's to carry, so they never appear here.
  const mine = (v.inventory ?? []).filter((it) => it.ownerId === session.characterId && !propById(it.emoji));
  const stash = (v.inventory ?? []).filter((it) => it.ownerId === null && !propById(it.emoji));

  useEffect(() => {
    let alive = true;
    listItemLocations(session.token)
      .then((m) => { if (alive) setLocs(m); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [session.token]);

  const locOf = (it: PvItem): ItemLocation => locs[it.id] ?? 'person';
  const move = async (it: PvItem, to: ItemLocation) => {
    if (locOf(it) === to) return;
    setLocs((m) => ({ ...m, [it.id]: to }));   // optimistic
    try { await setItemLocation(session.token, it.id, to); setErr(''); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const onPerson = mine.filter((it) => locOf(it) === 'person');
  const atHome = mine.filter((it) => locOf(it) === 'home');

  const Panel = ({ title, icon, to, items }: { title: string; icon: string; to: ItemLocation; items: PvItem[] }) => (
    <div
      class={`realm-inv-panel${dragId ? ' droppable' : ''}`}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => {
        e.preventDefault();
        const it = mine.find((x) => x.id === dragId);
        if (it) move(it, to);
        setDragId(null);
      }}
    >
      <div class="realm-inv-head">{icon} {title} <span class="realm-inv-count">{items.length}</span></div>
      <div class="realm-inv-items">
        {items.length === 0 && <div class="realm-journal-fine">Nothing here.</div>}
        {items.map((it) => (
          <div
            class="realm-inv-item"
            key={it.id}
            draggable
            onDragStart={() => setDragId(it.id)}
            onDragEnd={() => setDragId(null)}
          >
            <span class="realm-inv-emoji">{it.emoji}</span>
            <span class="realm-inv-name">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}</span>
            <button
              class="realm-inv-move"
              onClick={() => move(it, to === 'home' ? 'person' : 'home')}
            >{to === 'home' ? '→ Person' : '→ Home'}</button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div class="realm-inventory">
      {err && <div class="realm-login-error">{err}</div>}
      <div class="realm-inv-cols">
        <Panel title="On person" icon="🎒" to="home" items={onPerson} />
        <Panel title="Home base" icon="🏠" to="person" items={atHome} />
      </div>
      {stash.length > 0 && (
        <div class="realm-inv-stash">
          <div class="realm-inv-head">🎒 Party stash <span class="realm-inv-count">{stash.length}</span> <span class="realm-journal-fine">— shared, read-only</span></div>
          <div class="realm-inv-items">
            {stash.map((it) => (
              <div class="realm-inv-item readonly" key={it.id}>
                <span class="realm-inv-emoji">{it.emoji}</span>
                <span class="realm-inv-name">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p class="realm-journal-fine">Drag an item between panels, or tap → Home / → Person. Where your gear sits is yours alone — it survives signing out and back in.</p>
    </div>
  );
}
