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
