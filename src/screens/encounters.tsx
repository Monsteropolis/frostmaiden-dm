// ============================================================
// WORLD ▸ ENCOUNTERS — surfaces the module's rollable tables
// (ENC_TABLES) and prebuilt encounters (RIME_ENCOUNTERS). Combat
// rows/encounters resolve through the SAME resolver the tracker
// uses (resolvePreset, exported from combat.tsx) and push into
// initiative. Never auto-starts combat — just stages the foes.
// ============================================================
import { useState } from 'preact/hooks';
import { patch } from '../state/store';
import { ENC_TABLES, ENCOUNTERS } from '../data';
import { PresetCombatant } from '../state/schema';
import { resolvePreset } from './combat';
import { d } from '../lib/dice';
import { Sheet } from '../components/ui';
import { tab } from '../app';

type EncRowType = 'combat' | 'noncombat' | 'hazard';
interface EncRow { range: string; text: string; note?: string; type: EncRowType; combatants?: PresetCombatant[]; }
interface EncTable { name: string; die: string; trigger: string; rows: EncRow[]; }
interface RimeEncounter {
  id: string; name: string; type: string; category: string;
  difficulty: string; desc: string; combatants?: PresetCombatant[]; location?: string;
}

const TABLES = ENC_TABLES as unknown as EncTable[];
const PREBUILT = ENCOUNTERS as unknown as RimeEncounter[];
const CATS: { id: string; label: string }[] = [
  { id: 'travel', label: 'Travel' }, { id: 'story', label: 'Story' }, { id: 'social', label: 'Social' },
];

const TYPE_ICON: Record<string, string> = { combat: '⚔', hazard: '⚠', noncombat: '○' };
const DIFF_TONE: Record<string, string> = { trivial: 'trivial', easy: 'easy', medium: 'medium', hard: 'hard', deadly: 'deadly' };

function dieSides(die: string): number { return parseInt(die.replace(/\D/g, ''), 10) || 20; }
function inRange(roll: number, range: string): boolean {
  const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(range.trim());
  if (!m) return false;
  const lo = parseInt(m[1], 10); const hi = m[2] ? parseInt(m[2], 10) : lo;
  return roll >= lo && roll <= hi;
}

type Popup = { title: string; body: string; note?: string };

export function EncountersPanel() {
  const [sent, setSent] = useState<number | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  // Component-state only, per the brief — the tab opens as a scannable index.
  const [prebuiltOpen, setPrebuiltOpen] = useState(false);

  // Resolve counts + reuse the tracker's resolver, then push into initiative.
  const send = (specs: PresetCombatant[]) => {
    const cs = resolvePreset(specs);
    patch((s) => { s.combat.combatants.push(...cs); });
    setSent(cs.length);
  };

  return (
    <>
      {sent !== null && (
        <div class="enc-confirm">
          <span>Added <strong>{sent}</strong> combatant{sent === 1 ? '' : 's'} to initiative.</span>
          <button class="btn mini primary" onClick={() => { setSent(null); tab.value = 'combat'; }}>Open Combat ▸</button>
          <button class="btn mini ghost" onClick={() => setSent(null)}>Dismiss</button>
        </div>
      )}

      <div class="field-label">Rollable tables</div>
      {TABLES.map((t, ti) => (
        <EncTableCard key={ti} t={t} onSend={send}
          onOpenRow={(r) => setPopup({ title: `${t.name} · ${r.range}`, body: r.text, note: r.note })} />
      ))}

      <button class="enc-section-head" style={{ marginTop: '18px' }} onClick={() => setPrebuiltOpen(!prebuiltOpen)}>
        <span class="field-label" style={{ margin: 0 }}>Prebuilt encounters</span>
        <span class="enc-caret">{prebuiltOpen ? '▾' : '▸'}</span>
      </button>
      {prebuiltOpen && CATS.map((cat) => {
        const group = PREBUILT.filter((e) => e.category === cat.id);
        if (!group.length) return null;
        return (
          <div key={cat.id}>
            <div class="enc-cat">{cat.label}</div>
            {group.map((e) => {
              const combat = !!e.combatants && e.combatants.length > 0;
              return (
                <div class="card enc-preset" key={e.id}>
                  <div class="enc-preset-head">
                    <span class="enc-preset-name">{TYPE_ICON[combat ? 'combat' : 'noncombat']} {e.name}</span>
                    <span class={`diff-tag ${DIFF_TONE[e.difficulty] ?? 'medium'}`}>{e.difficulty}</span>
                  </div>
                  <p class="read" style={{ fontSize: '13px' }}>{e.desc}</p>
                  {e.location && <p class="stat-fine">📍 {e.location}</p>}
                  {combat
                    ? <button class="btn mini primary" onClick={() => send(e.combatants!)}>Send to initiative ▸</button>
                    : <button class="btn mini ghost" onClick={() => setPopup({ title: e.name, body: e.desc, note: e.location ? `📍 ${e.location}` : undefined })}>Read ▸</button>}
                </div>
              );
            })}
          </div>
        );
      })}

      {popup && (
        <Sheet open title={popup.title} onClose={() => setPopup(null)}>
          <p class="read">{popup.body}</p>
          {popup.note && <p class="stat-fine" style={{ marginTop: '8px' }}>{popup.note}</p>}
        </Sheet>
      )}
    </>
  );
}

function EncTableCard({ t, onSend, onOpenRow }: {
  t: EncTable; onSend: (s: PresetCombatant[]) => void; onOpenRow: (r: EncRow) => void;
}) {
  const [open, setOpen] = useState(false);   // collapsed by default — a scannable index
  const [rolled, setRolled] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);   // re-key the highlight so a re-roll re-animates

  return (
    <div class="card">
      <button class="enc-table-head enc-toggle" onClick={() => setOpen(!open)}>
        <h3>{t.name}</h3>
        <span class="die-tag">{t.die}</span>
        <span class="enc-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && <>
      <p class="read" style={{ fontSize: '13px' }}>{t.trigger}</p>
      <button class="btn" style={{ margin: '8px 0' }}
        onClick={() => { setRolled(d(dieSides(t.die))); setNonce((n) => n + 1); }}>🎲 Roll {t.die}</button>
      <div class="enc-rows">
        {t.rows.map((r, ri) => {
          const hit = rolled !== null && inRange(rolled, r.range);
          const combat = !!r.combatants && r.combatants.length > 0;
          return (
            <div key={hit ? `${ri}-${nonce}` : ri} class={`enc-row${hit ? ' rolled' : ''}`}>
              <span class="enc-row-icon" title={r.type}>{TYPE_ICON[r.type] ?? '○'}</span>
              <span class="enc-row-range">{r.range}</span>
              <span class="enc-row-text">{r.text}</span>
              {combat
                ? <button class="btn mini primary enc-row-btn" onClick={() => onSend(r.combatants!)}>Send ▸</button>
                : <button class="btn mini ghost enc-row-btn" aria-label="Details" onClick={() => onOpenRow(r)}>⋯</button>}
            </div>
          );
        })}
      </div>
      </>}
    </div>
  );
}
