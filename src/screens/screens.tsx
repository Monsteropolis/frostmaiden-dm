// Phase 1 screens: each proves a real slice of the foundation
// (seed data, state, weather) while the full feature lands in
// its scheduled phase.

import { NPCS, MODULE_QUESTS, TOWNS, MAGIC_ITEMS } from '../data';
import { state, patch } from '../state/store';
import { WEATHER, WeatherId, Standing } from '../state/schema';

function PhaseNote({ n, text }: { n: number; text: string }) {
  return (
    <p class="phase-note">
      <span class="star-mark">✦</span> {text} — arrives in Phase {n}
    </p>
  );
}

// ---------------------------------------------------------------- Session

export function SessionScreen() {
  return (
    <div>
      <p class="screen-kicker">The Table</p>
      <h1 class="screen-title">Session</h1>
      <p class="screen-sub">Prep, run, debrief — the campaign's beating heart.</p>
      <div class="card">
        <h3>Campaign progress</h3>
        <p class="read">
          Seven chapters from Ten-Towns to Ythryn, tracked by milestone.
        </p>
      </div>
      <PhaseNote n={4} text="Session prep, debrief capture, and chapter milestones" />
    </div>
  );
}

// ---------------------------------------------------------------- World

export function WorldScreen() {
  const wx = state.value.weather;
  const order: WeatherId[] = ['clear', 'overcast', 'light_snow', 'heavy_snow', 'blizzard', 'aurils_wrath'];

  return (
    <div>
      <p class="screen-kicker">Icewind Dale</p>
      <h1 class="screen-title">World</h1>
      <p class="screen-sub">Towns, quests, arcs, travel — and the weather above it all.</p>

      <div class="card">
        <h3>Weather (live — try it)</h3>
        <p class="read" style={{ marginBottom: '10px' }}>
          Set the current condition. The strip above updates everywhere; garnet means a CON save is in play.
        </p>
        <div class="chip-row">
          {order.map((id) => (
            <button
              class="btn"
              style={wx.current === id ? { borderColor: 'var(--frost)', color: 'var(--frost)' } : {}}
              onClick={() => patch((d) => {
                d.weather.current = id;
                d.weather.log.push({ day: d.weather.day, weather: id });
              })}
            >
              {WEATHER[id].icon} {WEATHER[id].name}
            </button>
          ))}
        </div>
        {WEATHER[wx.current].conSaveNote && (
          <p class="read" style={{ marginTop: '10px', color: 'var(--thread)' }}>
            {WEATHER[wx.current].conSaveNote}
          </p>
        )}
      </div>

      <div class="card">
        <h3>Ten-Towns</h3>
        <div class="chip-row">
          {TOWNS.map((t) => <span class="chip">{t.name}</span>)}
        </div>
      </div>

      <div class="card">
        <h3>Seeded and waiting</h3>
        <div class="seed-line"><span class="n">{MODULE_QUESTS.length}</span><span class="lbl">module quests, chapters 1–7 + story</span></div>
        <div class="seed-line"><span class="n">{TOWNS.length}</span><span class="lbl">settlements with locations & services</span></div>
        <div class="seed-line"><span class="n">{MAGIC_ITEMS.length}</span><span class="lbl">Rime magic items</span></div>
      </div>

      <PhaseNote n={3} text="Town standing, arcs, and quest tracking" />
    </div>
  );
}

// ---------------------------------------------------------------- Compendium

const STANDING_LABEL: Record<Standing, string> = {
  neutral: 'Neutral', friendly: 'Friendly', hostile: 'Hostile', allied: 'Allied', dead: 'Dead',
};

export function CompendiumScreen() {
  const overrides = state.value.npcOverrides;

  return (
    <div>
      <p class="screen-kicker">Lore</p>
      <h1 class="screen-title">Compendium</h1>
      <p class="screen-sub">Everyone and everything the Dale remembers.</p>

      <div class="card">
        <h3>NPC registry — seeded, standing is live</h3>
        <p class="read" style={{ marginBottom: '4px' }}>
          Tap a badge to cycle standing. It persists — this is the Phase 1 proof
          of the quick-update flow (the full sheet comes in Phase 3).
        </p>
      </div>

      {NPCS.map((npc) => {
        const standing: Standing = (overrides[npc.id]?.standing ?? 'neutral') as Standing;
        const cycle: Standing[] = ['neutral', 'friendly', 'allied', 'hostile', 'dead'];
        return (
          <div class="entity-row">
            <span class="entity-emoji" aria-hidden="true">{npc.emoji}</span>
            <div>
              <div class="entity-name">{npc.name}</div>
              <div class="entity-meta">
                <span>{npc.role}</span>
                <span class="sep">·</span>
                <span>{npc.town}</span>
              </div>
            </div>
            <button
              class={`standing ${standing}`}
              style={{ background: 'none', cursor: 'pointer', minHeight: '34px' }}
              aria-label={`${npc.name} standing: ${STANDING_LABEL[standing]}. Tap to change.`}
              onClick={() =>
                patch((d) => {
                  const next = cycle[(cycle.indexOf(standing) + 1) % cycle.length];
                  d.npcOverrides[npc.id] = { ...d.npcOverrides[npc.id], standing: next };
                })
              }
            >
              {STANDING_LABEL[standing]}
            </button>
          </div>
        );
      })}

      <PhaseNote n={5} text="Monsters, spells, and equipment from the 5e API" />
    </div>
  );
}
