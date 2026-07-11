// ============================================================
// SEED SNAPSHOT — generate a real public/snapshot.json so the
// Realm page shows a working camp on first open, not a broken
// page. Drives the live store into a populated session, then
// writes the exact PlayerView the TV/Realm receive.
//
//   npm run seed:snapshot   (vite-node, happy-dom for a DOM in node)
//
// This is a build/dev helper — the DM never runs it. His first
// real "Copy snapshot" publish replaces whatever this produces.
// ============================================================
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const { state, patch } = await import('../src/state/store.ts');
const { projectPlayerView } = await import('../src/tv/projection.ts');

// A small, plausible party gathered at camp under a clear night. Real PC
// records (the projection reads hp/maxHp/conditions/inspiration), plus a
// linked familiar and a couple of active threads so the diorama has life.
patch((d) => {
  d.party = [
    { id: 'pc1', name: 'Brienne', cls: 'Paladin', level: 4, race: 'Human', hp: 40, maxHp: 44, ac: 18, pp: 12, initMod: 0, conditions: [], inspiration: true, deathS: 0, deathF: 0 },
    { id: 'pc2', name: 'Wick', cls: 'Rogue', level: 4, race: 'Halfling', hp: 21, maxHp: 31, ac: 15, pp: 14, initMod: 3, conditions: [], inspiration: false, deathS: 0, deathF: 0 },
    { id: 'pc3', name: 'Zora', cls: 'Druid', level: 4, race: 'Elf', hp: 38, maxHp: 38, ac: 14, pp: 15, initMod: 1, conditions: [], inspiration: false, deathS: 0, deathF: 0 },
    { id: 'pc4', name: 'Doran', cls: 'Fighter', level: 4, race: 'Dwarf', hp: 33, maxHp: 46, ac: 19, pp: 11, initMod: 0, conditions: [], inspiration: false, deathS: 0, deathF: 0 },
  ];
  d.sidekicks = [
    { id: 'al1', name: 'Sprig', emoji: '🦊', kind: 'Familiar', category: 'ally', linkedPcId: 'pc3', hp: 6, maxHp: 6, ac: 12, initMod: 2, conditions: [], deathS: 0, deathF: 0 } as never,
  ];
  d.weather = { current: 'clear', day: 5, log: [{ day: 5, weather: 'clear' }] };
  d.travel = { activeJourney: null, log: [], rations: 8, partySize: 4, gold: 620 };
  d.tv = { ...d.tv, sceneId: 'camp', partyLocation: 'Camp near Bryn Shander' };
  d.quests = [
    { id: 'sq1', name: 'The Cold-Hearted Killer', status: 'escalating', town: 'Bryn Shander', chapter: 1, mainHook: true, trigger: '', development: '', notes: '', custom: false },
    { id: 'sq2', name: 'Foaming Mugs', status: 'active', town: 'Bryn Shander', chapter: 1, mainHook: false, trigger: '', development: '', notes: '', custom: false },
  ] as never;
  d.questsSeeded = true;
});

const view = projectPlayerView(state.value);

if (!view.party.length) {
  console.error('✗ Seed produced an empty party — IdleStage would render nothing. Aborting.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/snapshot.json');
writeFileSync(out, JSON.stringify(view, null, 2) + '\n');

console.log(`✓ Wrote ${out}`);
console.log(`  party: ${view.party.map((p) => p.name).join(', ')}`);
console.log(`  scene: ${view.sceneId} · day ${view.day} · ${view.weather.name} · ${view.location}`);
console.log(`  quests: ${view.quests.map((q) => q.name).join(', ') || '(none)'}`);
process.exit(0);
