import { useState } from 'preact/hooks';
import { CREATURES } from '../data';
import { NpcRegistry } from './npcs';

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
        <p class="read">Seven chapters from Ten-Towns to Ythryn, tracked by milestone.</p>
      </div>
      <PhaseNote n={4} text="Session prep, debrief capture, and chapter milestones" />
    </div>
  );
}

// ---------------------------------------------------------------- Compendium

export function CompendiumScreen() {
  const [sub, setSub] = useState<'npcs' | 'bestiary'>('npcs');

  return (
    <div>
      <p class="screen-kicker">Lore</p>
      <h1 class="screen-title">Compendium</h1>

      <div class="sub-tabs">
        <button class={`sub-tab${sub === 'npcs' ? ' active' : ''}`} onClick={() => setSub('npcs')}>NPCs</button>
        <button class={`sub-tab${sub === 'bestiary' ? ' active' : ''}`} onClick={() => setSub('bestiary')}>Bestiary</button>
      </div>

      {sub === 'npcs' && <NpcRegistry />}
      {sub === 'bestiary' && (
        <>
          <div class="card">
            <h3>{CREATURES.length} Rime creatures ready</h3>
            <p class="read">Full stat blocks are available inside the combat tracker — expand any monster's row. The browsable bestiary, plus the complete 5e monster, spell, and equipment libraries, arrive with the API layer.</p>
          </div>
          <PhaseNote n={5} text="Browsable bestiary, spells, and equipment via the 5e API" />
        </>
      )}
    </div>
  );
}
