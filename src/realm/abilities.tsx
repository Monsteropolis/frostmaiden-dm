// ============================================================
// PLAYER ABILITIES (Wave 10, Part B) — the spellbook.
// Class and level come from the DM's sheet (projected — B1); the
// player never sets either. Spells come from the 5e API's own
// per-class endpoint (offline-cached like the rest of the
// compendium — no bundled spell list). Known/prepared tags are
// the player's own, stored in character_spells behind RLS.
//
//   Class    — the spells this class learns, capped at what this
//              character level can cast, grouped by spell level.
//   All      — the whole library (Ben wants it available too).
//   Known    — the My-spellbook view: everything tagged known.
//
// Non-casters get a graceful state, not an empty list.
// ============================================================

import { useEffect, useState } from 'preact/hooks';
import type { PvPc } from '../tv/projection';
import type { RealmSession } from '../backend/realm-client';
import { listCharacterSpells, setSpellTag, SpellTag } from '../backend/realm-client';
import { getClassSpells, getApiList, getApiDetail, DetailBody, ApiListItem, ApiDetail } from '../lib/api';

// The eight standard spellcasting classes — used to pull the base class out of
// a free-text cls like "Fighter (Eldritch Knight)" or "Cleric of Lathander".
const CASTER_CLASSES = ['wizard', 'sorcerer', 'bard', 'cleric', 'druid', 'paladin', 'ranger', 'warlock'];

function classSlug(cls: string): string {
  const low = cls.toLowerCase();
  for (const c of CASTER_CLASSES) if (low.includes(c)) return c;
  return (low.match(/[a-z]+/) ?? [''])[0];
}

/** Full-caster cap: a level-L caster reaches spell level ceil(L/2), max 9. Used
 *  as the upper bound in the Class view (half-casters see a touch more than they
 *  can truly cast — a deliberate generous cap; the All view has no cap anyway). */
function maxSpellLevel(level: number): number {
  return Math.min(9, Math.max(1, Math.ceil(Math.max(1, level) / 2)));
}

const levelName = (lvl: number) => (lvl === 0 ? 'Cantrips' : `Level ${lvl}`);

type View = 'class' | 'all' | 'known';

export function AbilitiesPanel({ session, pc }: { session: RealmSession; pc: PvPc | null }) {
  const [view, setView] = useState<View>('class');
  const [q, setQ] = useState('');
  const [classList, setClassList] = useState<ApiListItem[] | null | 'loading'>('loading');
  const [allList, setAllList] = useState<ApiListItem[] | null | 'loading'>('loading');
  const [tags, setTags] = useState<Record<string, SpellTag>>({});
  const [tagErr, setTagErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const slug = pc ? classSlug(pc.cls) : '';
  const cap = maxSpellLevel(pc?.level ?? 1);

  useEffect(() => {
    let alive = true;
    getClassSpells(slug).then((r) => { if (alive) setClassList(r); });
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    let alive = true;
    if (view === 'all' && allList === 'loading') {
      getApiList('spells').then((r) => { if (alive) setAllList(r); });
    }
    return () => { alive = false; };
  }, [view]);

  // The player's own known/prepared tags — reloaded per session token.
  useEffect(() => {
    let alive = true;
    listCharacterSpells(session.token)
      .then((t) => { if (alive) setTags(t); })
      .catch((e) => { if (alive) setTagErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [session.token]);

  const tagOf = (idx: string): SpellTag => tags[idx] ?? { known: false, prepared: false };
  const writeTag = async (idx: string, next: SpellTag) => {
    setTags((t) => ({ ...t, [idx]: next }));   // optimistic
    try { await setSpellTag(session.token, idx, next); setTagErr(''); }
    catch (e) { setTagErr(e instanceof Error ? e.message : String(e)); }
  };

  if (!pc) {
    return <div class="realm-ability-empty">Sign in as your character to see your abilities.</div>;
  }

  // Non-caster: the class endpoint answered with an empty list.
  const isNonCaster = Array.isArray(classList) && classList.length === 0;
  if (view === 'class' && isNonCaster) {
    return (
      <div class="realm-abilities">
        <AbilityHead pc={pc} view={view} setView={setView} />
        <div class="realm-ability-empty">
          <p><b>{pc.cls}</b> · Level {pc.level}</p>
          <p>This class doesn't cast prepared or known spells, so there's no spellbook to keep.
            Your abilities come from your class features — ask your DM about what you've unlocked.</p>
          <p class="realm-journal-fine">You can still browse the whole spell library under <b>All</b> above.</p>
        </div>
      </div>
    );
  }

  // Which list this view shows, and whether to cap by character level.
  const source: ApiListItem[] | null | 'loading' =
    view === 'all' ? allList
    : view === 'known' ? (allList === 'loading' ? classList : (allList ?? classList))
    : classList;

  const spells = Array.isArray(source) ? source : [];
  const filtered = spells.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (view === 'class' && (s.level ?? 0) > cap) return false;
    if (view === 'known' && !tagOf(s.index).known) return false;
    return true;
  });

  // group by spell level
  const byLevel = new Map<number, ApiListItem[]>();
  for (const s of filtered) {
    const lvl = s.level ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(s);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);

  const loading = source === 'loading' || (view === 'known' && allList === 'loading' && classList === 'loading');

  return (
    <div class="realm-abilities">
      <AbilityHead pc={pc} view={view} setView={setView} />
      {tagErr && <div class="realm-login-error">{tagErr}</div>}
      <input
        class="realm-ability-search"
        placeholder="Search spells…"
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />
      {view === 'class' && (
        <p class="realm-journal-fine">{pc.cls} · Level {pc.level} — showing spells up to level {cap}.</p>
      )}
      {loading && source === null && <p class="realm-ability-empty">Couldn't reach the spell library — connect once to cache it.</p>}
      {loading && source === 'loading' && <p class="realm-journal-fine">Loading spells…</p>}
      {!loading && filtered.length === 0 && (
        <p class="realm-ability-empty">
          {view === 'known' ? 'No spells marked known yet — tap ☆ on any spell to add it here.' : 'No spells match.'}
        </p>
      )}
      {levels.map((lvl) => (
        <div class="realm-spell-group" key={lvl}>
          <div class="realm-spell-level">{levelName(lvl)}</div>
          {byLevel.get(lvl)!.map((s) => (
            <SpellRow
              key={s.index}
              spell={s}
              tag={tagOf(s.index)}
              open={openId === s.index}
              onOpen={() => setOpenId(openId === s.index ? null : s.index)}
              onKnown={() => writeTag(s.index, { known: !tagOf(s.index).known, prepared: tagOf(s.index).known ? false : tagOf(s.index).prepared })}
              onPrepared={() => writeTag(s.index, { known: true, prepared: !tagOf(s.index).prepared })}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function AbilityHead({ pc, view, setView }: { pc: PvPc; view: View; setView: (v: View) => void }) {
  const TABS: [View, string][] = [['class', 'My class'], ['all', 'All'], ['known', 'My spellbook']];
  return (
    <div class="realm-ability-head">
      <span class="realm-ability-who">✦ {pc.name} · {pc.cls} {pc.level}</span>
      <div class="realm-ability-views" role="tablist">
        {TABS.map(([v, label]) => (
          <button key={v} class={view === v ? 'on' : ''} onClick={() => setView(v)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function SpellRow({ spell, tag, open, onOpen, onKnown, onPrepared }: {
  spell: ApiListItem; tag: SpellTag; open: boolean;
  onOpen: () => void; onKnown: () => void; onPrepared: () => void;
}) {
  const [detail, setDetail] = useState<ApiDetail | null | 'loading'>(null);
  useEffect(() => {
    if (!open || detail) return;
    setDetail('loading');
    let alive = true;
    getApiDetail('spells', spell.index).then((d) => { if (alive) setDetail(d ?? null); });
    return () => { alive = false; };
  }, [open]);

  return (
    <div class={`realm-spell${tag.known ? ' known' : ''}`}>
      <div class="realm-spell-top">
        <button class="realm-spell-name" onClick={onOpen}>{spell.name}</button>
        <button class={`realm-spell-tag${tag.known ? ' on' : ''}`} title="Known" aria-label="Mark known"
          onClick={onKnown}>{tag.known ? '★' : '☆'}</button>
        <button class={`realm-spell-tag prep${tag.prepared ? ' on' : ''}`} title="Prepared" aria-label="Mark prepared"
          disabled={!tag.known} onClick={onPrepared}>{tag.prepared ? '◆' : '◇'}</button>
      </div>
      {open && (
        <div class="realm-spell-detail">
          {detail === 'loading' && <p class="realm-journal-fine">Loading…</p>}
          {detail === null && <p class="realm-journal-fine">Detail unavailable offline.</p>}
          {detail && detail !== 'loading' && <DetailBody d={detail} />}
        </div>
      )}
    </div>
  );
}
