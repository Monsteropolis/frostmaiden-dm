// D&D 5e API monsters — fetched on demand, cached forever in
// IndexedDB so stat blocks work offline after first view.
// (The service worker also runtime-caches the responses.)

import { get, set } from 'idb-keyval';
import { useState, useEffect } from 'preact/hooks';
import { rollD20, rollDamage, showRoll } from './dice';

export interface ApiAction {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage?: { damage_dice?: string }[];
}

export interface ApiMonster {
  index: string;
  name: string;
  size?: string;
  type?: string;
  armor_class?: { value: number }[] | number;
  hit_points?: number;
  speed?: Record<string, string>;
  strength?: number; dexterity?: number; constitution?: number;
  intelligence?: number; wisdom?: number; charisma?: number;
  challenge_rating?: number;
  special_abilities?: { name: string; desc: string }[];
  actions?: ApiAction[];
  senses?: Record<string, unknown>;
}

const mem = new Map<string, ApiMonster>();

export async function getApiMonster(index: string): Promise<ApiMonster | null> {
  if (mem.has(index)) return mem.get(index)!;
  try {
    const cached = await get(`mon:${index}`);
    if (cached) { mem.set(index, cached); return cached; }
  } catch { /* idb unavailable */ }
  try {
    const res = await fetch(`https://www.dnd5eapi.co/api/2014/monsters/${index}`);
    if (!res.ok) return null;
    const m = (await res.json()) as ApiMonster;
    // trim to what we render before caching
    const slim: ApiMonster = {
      index: m.index, name: m.name, size: m.size, type: m.type,
      armor_class: m.armor_class, hit_points: m.hit_points, speed: m.speed,
      strength: m.strength, dexterity: m.dexterity, constitution: m.constitution,
      intelligence: m.intelligence, wisdom: m.wisdom, charisma: m.charisma,
      challenge_rating: m.challenge_rating,
      special_abilities: m.special_abilities?.map((a) => ({ name: a.name, desc: a.desc })),
      actions: m.actions?.map((a) => ({ name: a.name, desc: a.desc, attack_bonus: a.attack_bonus, damage: a.damage })),
    };
    mem.set(index, slim);
    try { await set(`mon:${index}`, slim); } catch { /* ignore */ }
    return slim;
  } catch {
    return null;
  }
}

const mod = (n?: number) => (typeof n === 'number' ? Math.floor((n - 10) / 2) : 0);

export function ApiMonsterPanel({ index, name }: { index: string; name: string }) {
  const [m, setM] = useState<ApiMonster | null | 'loading'>('loading');
  useEffect(() => { let live = true; getApiMonster(index).then((r) => live && setM(r)); return () => { live = false; }; }, [index]);

  if (m === 'loading') return <p class="stat-fine">Fetching stat block…</p>;
  if (!m) return <p class="stat-fine">Stat block unavailable — connect to the internet once to cache it.</p>;

  const ac = Array.isArray(m.armor_class) ? m.armor_class[0]?.value : m.armor_class;
  const speed = m.speed ? Object.entries(m.speed).map(([k, v]) => `${k} ${v}`).join(', ') : '';
  const scores: [string, number | undefined][] = [
    ['str', m.strength], ['dex', m.dexterity], ['con', m.constitution],
    ['int', m.intelligence], ['wis', m.wisdom], ['cha', m.charisma],
  ];

  return (
    <div class="stat-panel">
      <div class="stat-line">
        <span>{m.size} {m.type} · CR {String(m.challenge_rating ?? '?')}</span>
        <span>AC {String(ac ?? '?')} · {speed}</span>
      </div>
      <div class="score-row">
        {scores.map(([k, v]) => (
          <button class="score" onClick={() => rollD20(`${name} — ${k.toUpperCase()}`, mod(v))}>
            <span class="score-k">{k.toUpperCase()}</span>
            <span class="score-v">{String(v ?? '—')}</span>
          </button>
        ))}
      </div>
      {(m.special_abilities ?? []).map((t) => <p class="stat-trait"><strong>{t.name}.</strong> {t.desc}</p>)}
      {(m.actions ?? []).map((a) => {
        const dice = a.damage?.map((d) => d.damage_dice).filter(Boolean) as string[] | undefined;
        return (
          <div class="stat-action">
            <p class="stat-trait"><strong>{a.name}.</strong> {a.desc}</p>
            {(a.attack_bonus !== undefined || (dice && dice.length > 0)) && (
              <div class="attack-row">
                {a.attack_bonus !== undefined && (
                  <button class="btn mini" onClick={() => rollD20(`${name} — ${a.name}`, a.attack_bonus!)}>
                    d20{a.attack_bonus >= 0 ? '+' : ''}{a.attack_bonus}
                  </button>
                )}
                {dice?.map((d) => (
                  <button class="btn mini" onClick={() => { const r = rollDamage(d); showRoll({ title: `${a.name} — damage`, total: r.total, detail: r.detail }); }}>{d}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- lists & details

export interface ApiListItem { index: string; name: string; level?: number; }

const listUrls: Record<string, string> = {
  monsters: 'https://www.dnd5eapi.co/api/2014/monsters',
  spells: 'https://www.dnd5eapi.co/api/2014/spells',
  'magic-items': 'https://www.dnd5eapi.co/api/2014/magic-items',
  equipment: 'https://www.dnd5eapi.co/api/2014/equipment',
};

const listMem = new Map<string, ApiListItem[]>();

export async function getApiList(kind: keyof typeof listUrls): Promise<ApiListItem[] | null> {
  if (listMem.has(kind)) return listMem.get(kind)!;
  try {
    const cached = await get(`list:${kind}`);
    if (cached) { listMem.set(kind, cached); return cached; }
  } catch { /* idb unavailable */ }
  try {
    const res = await fetch(listUrls[kind]);
    if (!res.ok) return null;
    const data = await res.json();
    const list: ApiListItem[] = (data.results ?? []).map((r: Record<string, unknown>) =>
      ({ index: String(r.index), name: String(r.name), level: typeof r.level === 'number' ? r.level : undefined }));
    listMem.set(kind, list);
    try { await set(`list:${kind}`, list); } catch { /* ignore */ }
    return list;
  } catch { return null; }
}

/** Every spell a class can learn, with spell level attached — the 5e API's own
 *  per-class endpoint, so the player spellbook filters by class WITHOUT fetching
 *  each spell's detail. Returns [] for a non-casting class (the endpoint answers
 *  with an empty results list), null only when offline/unreachable. Cached in
 *  IndexedDB and runtime-cached by the service worker, like every other list. */
export async function getClassSpells(classSlug: string): Promise<ApiListItem[] | null> {
  const slug = classSlug.trim().toLowerCase();
  if (!slug) return [];
  const key = `classspells:${slug}`;
  if (listMem.has(key)) return listMem.get(key)!;
  try {
    const cached = await get(`list:${key}`);
    if (cached) { listMem.set(key, cached); return cached; }
  } catch { /* idb unavailable */ }
  try {
    const res = await fetch(`https://www.dnd5eapi.co/api/2014/classes/${slug}/spells`);
    if (res.status === 404) { const empty: ApiListItem[] = []; listMem.set(key, empty); return empty; }
    if (!res.ok) return null;
    const data = await res.json();
    const list: ApiListItem[] = (data.results ?? []).map((r: Record<string, unknown>) =>
      ({ index: String(r.index), name: String(r.name), level: typeof r.level === 'number' ? r.level : undefined }));
    listMem.set(key, list);
    try { await set(`list:${key}`, list); } catch { /* ignore */ }
    return list;
  } catch { return null; }
}

export interface ApiDetail {
  index: string;
  name: string;
  desc?: string[] | string;
  higher_level?: string[];
  range?: string;
  components?: string[];
  material?: string;
  duration?: string;
  casting_time?: string;
  level?: number;
  school?: { name: string };
  classes?: { name: string }[];
  rarity?: { name: string };
  equipment_category?: { name: string };
  cost?: { quantity: number; unit: string };
  weight?: number;
  damage?: { damage_dice?: string; damage_type?: { name: string } };
  properties?: { name: string }[];
}

const detailMem = new Map<string, ApiDetail>();

export async function getApiDetail(kind: keyof typeof listUrls, index: string): Promise<ApiDetail | null> {
  const key = `${kind}:${index}`;
  if (detailMem.has(key)) return detailMem.get(key)!;
  try {
    const cached = await get(`d:${key}`);
    if (cached) { detailMem.set(key, cached); return cached; }
  } catch { /* idb unavailable */ }
  try {
    const res = await fetch(`${listUrls[kind]}/${index}`);
    if (!res.ok) return null;
    const m = (await res.json()) as ApiDetail;
    detailMem.set(key, m);
    try { await set(`d:${key}`, m); } catch { /* ignore */ }
    return m;
  } catch { return null; }
}

export function DetailBody({ d }: { d: ApiDetail }) {
  const descs = Array.isArray(d.desc) ? d.desc : d.desc ? [d.desc] : [];
  return (
    <>
      <div class="npc-statline">
        {d.level !== undefined && <span>{d.level === 0 ? 'Cantrip' : `Level ${d.level}`}</span>}
        {d.school && <span>{d.school.name}</span>}
        {d.casting_time && <span>{d.casting_time}</span>}
        {d.range && <span>{d.range}</span>}
        {d.duration && <span>{d.duration}</span>}
        {d.components && <span>{d.components.join(' ')}</span>}
        {d.rarity && <span>{d.rarity.name}</span>}
        {d.equipment_category && <span>{d.equipment_category.name}</span>}
        {d.cost && <span>{d.cost.quantity} {d.cost.unit}</span>}
        {d.weight !== undefined && <span>{d.weight} lb</span>}
        {d.damage?.damage_dice && <span>{d.damage.damage_dice} {d.damage.damage_type?.name ?? ''}</span>}
      </div>
      {d.material && <p class="stat-fine">Material: {d.material}</p>}
      {descs.map((p) => <p class="read" style={{ margin: '8px 0' }}>{p}</p>)}
      {(d.higher_level ?? []).map((p) => <p class="read" style={{ margin: '8px 0' }}><strong>At higher levels.</strong> {p}</p>)}
      {d.classes && d.classes.length > 0 && <p class="stat-fine">Classes: {d.classes.map((c) => c.name).join(', ')}</p>}
    </>
  );
}

// ---------------------------------------------------------------- CR-tagged monster list & categories

export interface CrListItem extends ApiListItem { cr: number; }

const CR_BUCKETS = [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 30];
let crListMem: CrListItem[] | null = null;

/** Full monster list with CR attached (one-time bucket fetch, cached forever). */
export async function getMonstersWithCr(onProgress?: (pct: number) => void): Promise<CrListItem[] | null> {
  if (crListMem) return crListMem;
  try {
    const cached = await get('list:monsters-cr');
    if (cached) { crListMem = cached; return cached; }
  } catch { /* idb unavailable */ }
  const out: CrListItem[] = [];
  try {
    for (let i = 0; i < CR_BUCKETS.length; i++) {
      const cr = CR_BUCKETS[i];
      const res = await fetch(`https://www.dnd5eapi.co/api/2014/monsters?challenge_rating=${cr}`);
      if (!res.ok) return null;
      const data = await res.json();
      for (const r of data.results ?? []) out.push({ index: r.index, name: r.name, cr });
      onProgress?.(Math.round(((i + 1) / CR_BUCKETS.length) * 100));
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    crListMem = out;
    try { await set('list:monsters-cr', out); } catch { /* ignore */ }
    return out;
  } catch { return null; }
}

/** Equipment category members, e.g. 'weapon', 'armor', 'adventuring-gear', 'potion'. */
export async function getApiCategory(index: string): Promise<ApiListItem[] | null> {
  const key = `cat:${index}`;
  if (listMem.has(key)) return listMem.get(key)!;
  try {
    const cached = await get(`list:${key}`);
    if (cached) { listMem.set(key, cached); return cached; }
  } catch { /* idb unavailable */ }
  try {
    const res = await fetch(`https://www.dnd5eapi.co/api/2014/equipment-categories/${index}`);
    if (!res.ok) return null;
    const data = await res.json();
    const list: ApiListItem[] = (data.equipment ?? []).map((r: Record<string, unknown>) => {
      const url = String(r.url ?? '');
      return { index: String(r.index), name: String(r.name), level: undefined,
               // magic items live under /magic-items, mundane under /equipment
               ...(url.includes('magic-items') ? { magic: true } : {}) } as ApiListItem & { magic?: boolean };
    });
    listMem.set(key, list);
    try { await set(`list:${key}`, list); } catch { /* ignore */ }
    return list;
  } catch { return null; }
}
