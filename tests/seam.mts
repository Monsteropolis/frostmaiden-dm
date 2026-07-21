// ============================================================
// SEAM TESTS — the DM/player boundary, enforced on every build.
// projectPlayerView() is the ONLY thing a player's device ever
// sees. This test injects sentinel strings into every DM-only
// field, projects, and proves:
//   A. the projection's shape matches an explicit allow-list
//      (an unknown key path fails — tripwire for a field someone
//      adds in three months and forgets to think about);
//   B. not one sentinel — and no dormant quest name — survives.
// Wired into `npm run build`, so a leak fails the deploy.
// ============================================================
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

let pass = 0, fail = 0;
function check(label: string, ok: boolean, extra = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
}

const { state, patch } = await import('../src/state/store.ts');
const { projectPlayerView } = await import('../src/tv/projection.ts');

// ---- Fixture: sentinels in every DM-only field ----------------------------
patch((d) => {
  d.party = [
    { id: 'pc1', name: 'Aria', cls: 'Wizard', level: 3, race: 'Elf', hp: 18, maxHp: 18, ac: 12, pp: 12, initMod: 1, conditions: [], inspiration: false, deathS: 0, deathF: 0, notes: 'SEAM_PC_NOTES' },
  ];
  d.sidekicks = [
    { id: 'sk1', name: 'Fen', emoji: '🦊', kind: 'Familiar', category: 'ally', linkedPcId: 'pc1', level: 1, hp: 6, maxHp: 6, ac: 12, initMod: 2, scores: { str: 8, dex: 14, con: 10, int: 6, wis: 12, cha: 6 }, attacks: [], conditions: [], deathS: 0, deathF: 0, location: '', notes: 'SEAM_ALLY_NOTES' },
  ] as never;
  // combat OFF — so no monster name is ever legitimately projectable
  d.combat = { active: false, round: 0, turn: 0, combatants: [] };
  // one live quest (exercises quests[] allow-list); its name is a real module
  // quest, never a sentinel — active quests are allowed to reach players.
  if (d.quests[0]) d.quests[0].status = 'active';
  // a dormant quest whose very name must never appear on a player's screen
  d.quests.push({ id: 'qSeam', name: 'SEAM_DORMANT_QUEST', status: 'dormant', town: 'SEAM_TOWN', chapter: null, mainHook: false, trigger: 'SEAM_TRIGGER', development: 'SEAM_DEV', notes: 'SEAM_QNOTES', custom: true });
  d.sessions = [
    { id: 'se1', title: 'SEAM_SESSION_SECRET', status: 'planned', date: 'SEAM_SESSION_SECRET', hook: 'SEAM_SESSION_SECRET', plannedEncounters: 'SEAM_SESSION_SECRET', npcIds: [], secrets: 'SEAM_SESSION_SECRET', debrief: 'SEAM_SESSION_SECRET' },
  ];
  d.arcs = [
    { id: 'arc1', name: 'SEAM_ARC', status: 'active', lastDev: 'SEAM_LASTDEV', nextTrigger: 'SEAM_NEXTTRIGGER', linkedNpcIds: [], notes: 'SEAM_ARCNOTES' },
  ] as never;
  d.npcOverrides = { npc1: { standing: 'hostile', lastSeen: 'SEAM_LASTSEEN', notes: 'SEAM_NPCNOTES' } } as never;
  d.customMonsters = [
    { id: 'cm1', name: 'SEAM_MONSTER', emoji: '👾', size: 'Large', type: 'aberration', cr: '5', ac: 16, hp: 80, speed: '30', str: 18, dex: 12, con: 16, int: 6, wis: 10, cha: 8, senses: 'SEAM_SENSES', traits: [{ n: 'SEAM_TRAIT', d: 'SEAM_TRAITDESC' }], actions: [{ n: 'SEAM_ACTION', d: 'SEAM_ACTIONDESC' }] },
  ];
  d.weather.log.push({ day: 2, weather: 'blizzard', note: 'SEAM_WEATHER_NOTE' });
  d.travel.log.push({ day: 2, text: 'SEAM_TRAVEL_NOTE' });
  // Wave 4: items are visible by design — but their DM notes never are.
  // Wave 5: a displayed trophy exercises the two (and only two) new paths.
  d.inventory = [
    { id: 'it1', name: 'Frozen Locket', emoji: '🧿', qty: 1, ownerId: 'pc1', srcIndex: 'frozen-locket', notes: 'SEAM_ITEM_NOTES' },
    { id: 'it2', name: 'Rope (50 ft)', emoji: '🎒', qty: 2, ownerId: null, notes: 'SEAM_ITEM_NOTES', display: { x: 62, y: 0.8 } },
  ];
});

const pv = projectPlayerView(state.value);

// ---- Test A: structural allow-list ----------------------------------------
// Every key path the projection emits must be on this list, transcribed by
// hand from PlayerView. Array indices collapse to `[]`. A new/unknown path is
// a deliberate failure: whoever widened the projection must add it consciously.
const ALLOW = new Set<string>([
  'v', 'mode', 'day',
  'weather.id', 'weather.name', 'weather.icon', 'weather.conSave',
  'location',
  'travel', // null when no journey
  'travel.origin', 'travel.dest', 'travel.day', 'travel.totalDays',
  // Wave 10 (E5): the flat gold/rations became a coin purse and split rations.
  // The two obsolete paths (resources.gold, resources.rations) are removed.
  'resources.coins.pp', 'resources.coins.gp', 'resources.coins.sp', 'resources.coins.cp',
  'resources.rations.party', 'resources.rations.pet', 'resources.partySize',
  'sceneId', 'youtubeId', 'mediaVisible', 'slotView', 'idleFull',
  'poke.seq', 'poke.target', 'poke.kind',
  // Wave 10 (B1): character level, so the player spellbook can cap by it.
  'party[].level',
  'party[].id', 'party[].name', 'party[].cls', 'party[].hp', 'party[].maxHp',
  'party[].conditions[]', 'party[].inspiration', 'party[].deathS', 'party[].deathF', 'party[].down',
  'party[].sprite',   // Wave 3 — cosmetic actor-sprite id, deliberately allowed
  'allies[].id', 'allies[].name', 'allies[].emoji', 'allies[].hpState',
  'allies[].conditions[]', 'allies[].linkedPcId', 'allies[].down', 'allies[].deathS', 'allies[].deathF',
  'allies[].sprite',  // Wave 3 — cosmetic actor-sprite id, deliberately allowed
  'combat', // null out of combat
  'combat.round',
  'combat.combatants[].id', 'combat.combatants[].name', 'combat.combatants[].emoji',
  'combat.combatants[].friendly', 'combat.combatants[].hp', 'combat.combatants[].maxHp',
  'combat.combatants[].hpState', 'combat.combatants[].init', 'combat.combatants[].conditions[]',
  'combat.combatants[].active', 'combat.combatants[].next', 'combat.combatants[].deathS', 'combat.combatants[].deathF',
  'quests[].id', 'quests[].name', 'quests[].town', 'quests[].status', 'quests[].mainHook',
  // Wave 4 — the items domain. Granting = revealing: these five are the whole
  // item on the wire. OwnedItem.notes is deliberately absent (sentinel-guarded).
  'inventory[].id', 'inventory[].name', 'inventory[].emoji', 'inventory[].qty', 'inventory[].ownerId',
  // Wave 5 — trophies on display: a camp position, nothing more. The key is
  // omitted entirely for pack items, so no bare `inventory[].display` path.
  'inventory[].display.x', 'inventory[].display.y',
  'sentAt',
]);

function walk(obj: unknown, path: string, out: Set<string>): void {
  if (obj === null || typeof obj !== 'object') { out.add(path); return; }
  if (Array.isArray(obj)) {
    // an empty array carries no data — nothing to leak, nothing to allow-list
    obj.forEach((it) => walk(it, path + '[]', out));
    return;
  }
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    walk((obj as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out);
  }
}

const seen = new Set<string>();
walk(pv, '', seen);
const unknown = [...seen].filter((p) => !ALLOW.has(p));
check('Test A — projection shape matches the allow-list', unknown.length === 0,
  unknown.length ? `unexpected path(s): ${unknown.join(', ')}` : '');

// ---- Test B: sentinel corpus ----------------------------------------------
const json = JSON.stringify(pv);
check('Test B — no DM sentinel string in the payload', !json.includes('SEAM_'),
  json.includes('SEAM_') ? 'a SEAM_* value leaked into the projection' : '');

const dormantNames = state.value.quests
  .filter((q) => q.status === 'dormant' || q.status === 'resolved')
  .map((q) => q.name)
  .filter((n) => n && n.length > 3);
const leakedQuests = dormantNames.filter((n) => json.includes(n));
check('Test B — no dormant/resolved quest name in the payload', leakedQuests.length === 0,
  leakedQuests.slice(0, 3).join(', '));

// ---- Result ----------------------------------------------------------------
console.log(`\nSeam tests: ${pass} passed, ${fail} failed.`);
if (fail > 0) { console.error('🚨 SEAM LEAK — refusing to build. A player would see DM-only content.'); process.exit(1); }
process.exit(0);
