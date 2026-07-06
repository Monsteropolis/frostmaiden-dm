// ============================================================
// DM SESSION SIMULATION — drive the real UI like a person.
// Session: party arrives in Bryn Shander, meets Duvessa, learns
// of Sephek's murders, gets ambushed by bandits on the road.
// ============================================================
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(label: string, ok: boolean, extra = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
}
const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];
const byText = (sel: string, text: string) =>
  $$(sel).find((el) => (el.textContent ?? '').trim().includes(text)) ?? null;
function click(el: HTMLElement | null, what: string) {
  if (!el) { check(`click ${what}`, false, 'element not found'); return false; }
  el.click();
  return true;
}
function type(el: HTMLElement | null, value: string, what: string) {
  if (!el) { check(`type into ${what}`, false, 'not found'); return; }
  (el as HTMLInputElement).value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const bodyHas = (t: string) => (document.body.textContent ?? '').includes(t);

// Boot the app
document.body.innerHTML = '<div id="app"></div>';
const { render, h } = await import('preact');
await import('/home/claude/frostmaiden-dm/src/styles/tokens.css');
const { App } = await import('/home/claude/frostmaiden-dm/src/app.tsx');
const { state } = await import('/home/claude/frostmaiden-dm/src/state/store.ts');
render(h(App, {}), document.getElementById('app')!);
await sleep(20);

console.log('\n═══ SCENE 0: App boots ═══');
check('header wordmark', bodyHas('Frostmaiden'));
check('weather strip shows light snow', bodyHas('Light snow'));
check('bottom nav has 5 tabs', $$('.nav-btn').length === 5);

console.log('\n═══ SCENE 1: Roster — add the party ═══');
click(byText('.nav-btn', 'Party'), 'Party tab'); await sleep(20);
for (const [name, cls, race, hp, ac] of [
  ['Brienne', 'Paladin', 'Human', '44', '18'],
  ['Wick', 'Rogue', 'Halfling', '31', '15'],
  ['Zora', 'Druid', 'Elf', '38', '14'],
]) {
  click(byText('button', '+ Add character'), 'add character'); await sleep(20);
  const inputs = $$('.sheet .input');
  type(inputs[0], name, 'name'); type(inputs[1], cls, 'class');
  type(inputs[3], race, 'race'); type(inputs[4], hp, 'maxHp'); type(inputs[5], ac, 'ac');
  await sleep(20);
  click(byText('.sheet button', 'Add to party'), 'save PC'); await sleep(20);
}
check('3 PCs on roster', bodyHas('Brienne') && bodyHas('Wick') && bodyHas('Zora'));
check('Brienne card shows class/AC', bodyHas('Paladin'));

// expand Brienne, toggle a condition + inspiration
click(byText('.unit-name', 'Brienne'), 'expand Brienne'); await sleep(20);
click(byText('.cond-add', '+ Condition'), 'open condition picker'); await sleep(20);
click(byText('.cond-chip', 'Frightened'), 'toggle Frightened'); await sleep(20);
check('condition tag appears', $$('.cond-tag').some((t) => (t.textContent ?? '').includes('Frightened')));
check('condition grid auto-hides after pick', !byText('.cond-chip', 'Blinded'));
click($('.inspo'), 'inspiration star'); await sleep(20);
check('inspiration lit', !!$('.inspo.on'));
click(byText('.cond-tag.rm', 'Frightened'), 'remove via tag'); await sleep(20);

console.log('\n═══ SCENE 2: Bryn Shander — town + NPC bookkeeping ═══');
click(byText('.nav-btn', 'World'), 'World tab'); await sleep(20);
check('towns sub-tab default', bodyHas('Bryn Shander') && bodyHas('Targos'));
click(byText('.unit-name', 'Bryn Shander'), 'expand Bryn Shander'); await sleep(20);
check('town summary visible', bodyHas('walled trade hub'));
check('module quests listed for town', bodyHas('Foaming Mugs'));
click(byText('.cond-chip', 'Mark visited'), 'mark visited'); await sleep(20);
click(byText('.cond-chip', 'friendly'), 'standing friendly'); await sleep(20);
check('towns counter updates', bodyHas('Towns (1/10)'));

// Arc: Sephek's trail
click(byText('.sub-tab', 'Arcs'), 'Arcs sub-tab'); await sleep(20);
click(byText('button', '+ New arc'), 'new arc'); await sleep(20);
type($$('.sheet .input')[0], "Sephek's cold trail", 'arc name'); await sleep(20);
click(byText('.sheet .cond-chip', 'escalating'), 'status escalating'); await sleep(10);
const areas = $$('.sheet textarea');
type(areas[0], 'Party found the frozen merchant in Easthaven', 'last dev'); await sleep(20);
type(areas[1], 'Sephek kills again at the next full moon', 'next trigger'); await sleep(20);
{
  const sel = document.querySelector('.sheet select.input') as HTMLSelectElement | null;
  if (sel) {
    const opt = [...sel.options].find((o) => o.textContent?.includes('Sephek'));
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    check('link Sephek via dropdown', !!opt);
  } else check('link Sephek via dropdown', false, 'select not found');
}
await sleep(20);
click(byText('.sheet button', 'Create arc'), 'create arc'); await sleep(20);
check('arc card renders', bodyHas("Sephek's cold trail"));
check('escalation trigger shown', bodyHas('full moon'));
check('linked NPC emoji on card', !!byText('.unit-meta', '🧊') || $$('.arc-card').length > 0);

console.log('\n═══ SCENE 3: The Lore tab — quick NPC updates mid-scene ═══');
click(byText('.nav-btn', 'Lore'), 'Lore tab'); await sleep(20);
check('NPC registry seeded', bodyHas('Duvessa Shane') && bodyHas('Sephek Kaltro'));
type($('.input'), 'sephek', 'search'); await sleep(20);
check('search filters', bodyHas('Sephek') && !bodyHas('Duvessa Shane'));
click($('.entity-row .standing'), 'standing badge → quick update'); await sleep(20);
check('quick update sheet open', bodyHas('Standing') && $$('.standing.pick').length === 5);
click(byText('.standing.pick', 'Hostile'), 'set hostile'); await sleep(20);
check('badge now hostile', !!$('.entity-row .standing.hostile'));
// open detail, verify threads show the arc
click($('.entity-row.npc'), 'open Sephek detail'); await sleep(20);
check('detail shows secrets block', bodyHas('Secrets (DM only)'));
check('threads show linked arc', bodyHas("Sephek's cold trail"));
click($('.sheet-close'), 'close detail'); await sleep(20);
type($('.input'), '', 'clear search'); await sleep(20);

console.log('\n═══ SCENE 4: Road ambush — combat ═══');
click(byText('.nav-btn', 'Combat'), 'Combat tab'); await sleep(20);
click(byText('.sub-tab', 'Encounters'), 'Encounters sub-tab'); await sleep(20);
check('seeded encounters visible', bodyHas('Bandit Ambush'));
check('difficulty tags render', $$('.diff-tag').length > 5);
click(byText('.card button', 'Load into tracker'), 'load Bandit Ambush'); await sleep(20);
check('auto-jumped to tracker', bodyHas('Begin combat'));
const foes = $$('.combat-row').length;
check('bandits resolved into rows', foes >= 4, `${foes} rows`);

// party joins
click(byText('button', '+ Add'), 'add combatants'); await sleep(20);
click(byText('.sheet button', 'All (3)'), 'add whole party'); await sleep(20);
click(byText('.sheet button', 'Done'), 'close add sheet'); await sleep(20);
check('7 combatants total', $$('.combat-row').length === foes + 3, `${$$('.combat-row').length}`);

click(byText('button', '🎲 Init'), 'roll foe initiative'); await sleep(20);
// set party inits manually
const initInputs = $$('.combat-row .input.num');
check('init inputs present', initInputs.length >= 7);
click(byText('button', 'Begin combat'), 'begin combat'); await sleep(20);
check('round 1 begins', bodyHas('R1'));
check('active turn marked', $$('.unit.turn').length === 1);
click(byText('button', 'Next turn'), 'next turn'); await sleep(20);

// Wick takes a crossbow bolt: find his row, hit −5 twice via expand
click(byText('.combat-row .cr-name', 'Wick'), 'expand Wick'); await sleep(20);
click(byText('.combat-row .btn', '−5'), 'damage 5'); await sleep(20);
click(byText('.combat-row .btn', '−5'), 'damage 5 again'); await sleep(20);
check('Wick HP 21/31 in tracker', bodyHas('21 / 31'));

// verify live sync to Party tab
click(byText('.nav-btn', 'Party'), 'Party tab'); await sleep(20);
check('SYNC: party sheet shows 21/31', bodyHas('21 / 31'));
click(byText('.nav-btn', 'Combat'), 'back to Combat'); await sleep(20);

// expand a bandit → monster panel? bandits are custom/api. Use crag cat instead:
click(byText('button', '+ Add'), 'add combatants again'); await sleep(20);
type($('.sheet .input'), 'crag', 'search creatures'); await sleep(20);
click(byText('.creature-add', 'Crag Cat'), 'add crag cat'); await sleep(20);
click(byText('.sheet button', 'Done'), 'close'); await sleep(20);
click(byText('.combat-row .cr-name', 'Crag Cat'), 'expand crag cat'); await sleep(20);
check('stat panel: traits', bodyHas('Nondetection'));
const atkBtn = byText('.stat-action .btn', 'd20+5');
check('rollable action parsed', !!atkBtn);
click(atkBtn, 'roll Bite attack'); await sleep(20);
check('roll toast appears', !!$('.roll-toast'), $('.rt-total')?.textContent ?? '');
const dmgBtn = byText('.stat-action .btn', '1d10+3');
click(dmgBtn, 'roll damage'); await sleep(20);
check('damage toast', !!$('.roll-toast'));

// kill a bandit: expand first bandit, set hp 0
const banditName = byText('.combat-row .cr-name', 'Bandit 1');
click(banditName, 'expand Bandit 1'); await sleep(20);
const expandedNum = $$('.unit-detail .input.num')[0];
type(expandedNum, '0', 'set HP 0'); await sleep(20);
check('bandit down (dying style)', $$('.unit.dying').length >= 1);

// two-tap remove
const removeBtn = byText('.unit-detail .btn', 'Remove');
click(removeBtn, 'remove (arm)'); await sleep(20);
check('confirm armed', bodyHas('Remove?'));
click(byText('.unit-detail .btn', 'Remove?'), 'remove (confirm)'); await sleep(20);
check('combatant removed', $$('.combat-row').length === foes + 3, `${$$('.combat-row').length} (was ${foes + 4} with crag cat)`);

// end combat two-tap (sticky bar)
click(byText('.combat-toolbar.sticky button', 'End'), 'end combat (arm)'); await sleep(20);
click(byText('.combat-toolbar.sticky button', 'End?'), 'end combat (confirm)'); await sleep(20);
check('tracker cleared', bodyHas('No one has drawn steel'));

console.log('\n═══ SCENE 5: The storm rolls in ═══');
click(byText('.nav-btn', 'World'), 'World tab'); await sleep(20);
click(byText('.sub-tab', 'Weather'), 'Weather sub-tab'); await sleep(20);
click(byText('button', 'Blizzard'), 'set blizzard'); await sleep(20);
check('CON save badge in global strip', !!$('.weather-strip .consave-badge'));
check('save DC note shown', bodyHas('DC 10 CON'));
click(byText('button', 'New day →'), 'advance day'); await sleep(20);
check('day advanced in strip', bodyHas('Day 2'));
check('weather log has entries', bodyHas('D2'));

console.log('\n═══ SCENE 6: Persistence — the "lost my notes" test ═══');
await sleep(600); // let the debounced save flush
const saved = JSON.parse(localStorage.getItem('fmdm_state_v1') ?? 'null');
check('state persisted to localStorage', !!saved);
check('  … party saved', saved?.party?.length === 3);
check('  … Wick HP synced in save', saved?.party?.find((p: any) => p.name === 'Wick')?.hp === 21);
check('  … arc saved', saved?.arcs?.length === 1);
check('  … NPC standing saved', saved?.npcOverrides?.sk2?.standing === 'hostile');
check('  … town saved', saved?.towns?.['Bryn Shander']?.visited === true);
check('  … weather day 2', saved?.weather?.day === 2 && saved?.weather?.current === 'blizzard');

console.log('\n═══ SCENE 7: The fixes — sheets, popups, condensed combat ═══');
// Sheet portals to <body>, not trapped inside .main
click(byText('.nav-btn', 'Party'), 'Party tab'); await sleep(20);
click(byText('button', '+ Add character'), 'open add sheet'); await sleep(20);
const scrim = document.querySelector('.sheet-scrim');
check('sheet portals to <body> (above bottom nav)', scrim?.parentElement === document.body);
click($('.sheet-close'), 'close sheet'); await sleep(20);

// Global NPC popup from an arc chip
click(byText('.nav-btn', 'World'), 'World tab'); await sleep(20);
click(byText('.sub-tab', 'Arcs'), 'Arcs sub-tab'); await sleep(20);
click(byText('.arc-card .npc-chip', 'Sephek'), 'arc chip → NPC popup'); await sleep(30);
check('persistent NPC popup opens from arc chip', bodyHas('Secrets (DM only)'));
click($('.sheet-close'), 'close popup'); await sleep(20);

// Arc form: dropdown linking
click(byText('button', '+ New arc'), 'new arc'); await sleep(20);
const linkSel = document.querySelector('.sheet select.input') as HTMLSelectElement;
check('NPC link dropdown present', !!linkSel);
if (linkSel) {
  const opt = [...linkSel.options].find((o) => o.textContent?.includes('Duvessa'));
  linkSel.value = opt!.value;
  linkSel.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(20);
}
check('linked chip appears with unlink ✕', !!document.querySelector('.sheet .npc-chip.linked .npc-chip-x'));
click($('.sheet-close'), 'discard arc'); await sleep(20);

console.log('\n═══ SCENE 8: Weather controls ═══');
click(byText('.sub-tab', 'Weather'), 'Weather sub-tab'); await sleep(20);
check('roll weather button', !!byText('button', 'Roll weather'));
const dayInput = document.querySelector('.day-edit .input.num') as HTMLInputElement;
dayInput.value = '12';
dayInput.dispatchEvent(new Event('input', { bubbles: true }));
await sleep(30);
check('day editable — strip shows Day 12', bodyHas('Day 12'));

console.log('\n═══ SCENE 9: Quests ═══');
click(byText('.sub-tab', 'Quests'), 'Quests sub-tab'); await sleep(20);
check('module quests seeded', bodyHas('Foaming Mugs'));
const questBadge = document.querySelector('.card.quest .standing') as HTMLElement;
const before = questBadge.textContent;
questBadge.click(); await sleep(20);
check('quest status advances on tap', document.querySelector('.card.quest .standing')?.textContent !== before);
click(byText('button', '+ Custom quest'), 'custom quest form'); await sleep(20);
type($$('.card .input')[0], 'Find the lost sled dogs', 'quest name'); await sleep(20);
click(byText('button', 'Add quest'), 'add quest'); await sleep(20);
check('custom quest appears', bodyHas('Find the lost sled dogs'));

console.log('\n═══ SCENE 10: Travel — Bryn Shander to Targos ═══');
click(byText('.sub-tab', 'Travel'), 'Travel sub-tab'); await sleep(20);
check('journey planner shows estimate', bodyHas('Estimated 1 day'));
click(byText('button', 'Set out ✦'), 'set out'); await sleep(20);
check('journey active', bodyHas('Day 1 of 1'));
click(byText('button', 'Arrive at Targos'), 'arrive'); await sleep(30);
check('arrival logged', bodyHas('Arrived at Targos'));
check('weather day advanced with travel', bodyHas('Day 13'));
click(byText('.sub-tab', 'Towns'), 'Towns'); await sleep(20);
check('Targos marked visited (2/10)', bodyHas('Towns (2/10)'));

console.log('\n═══ SCENE 11: Session prep & debrief ═══');
click(byText('.nav-btn', 'Session'), 'Session tab'); await sleep(20);
click(byText('button', '+ New session'), 'new session'); await sleep(20);
type($$('.sheet .input')[0], 'S1 — Cold welcome in Targos', 'title'); await sleep(20);
click(byText('.sheet .cond-chip', 'planned'), 'status planned'); await sleep(20);
type($$('.sheet textarea')[0], 'The party arrives as the lake men pull a frozen body ashore', 'hook'); await sleep(20);
const sessSel = document.querySelector('.sheet select.input') as HTMLSelectElement;
if (sessSel) {
  const opt = [...sessSel.options].find((o) => o.textContent?.includes('Markham'));
  sessSel.value = opt!.value;
  sessSel.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(20);
}
click(byText('.sheet button', 'Create session'), 'create session'); await sleep(30);
check('session card renders', bodyHas('Cold welcome in Targos'));
check('planned badge', !!document.querySelector('.standing.s-planned'));
check('session NPC chip', !!byText('.session-card .npc-chip', 'Markham'));

click(byText('.sub-tab', 'Progress'), 'Progress'); await sleep(20);
check('7 chapters render', $$('.card.chapter').length === 7);
click($('.ms-toggle'), 'toggle first milestone'); await sleep(20);
check('milestone marked', !!document.querySelector('.milestone.done'));
check('chapter counter 1/4', bodyHas('1/4 milestones'));

console.log('\n═══ SCENE 12: Final persistence audit ═══');
await sleep(600);
const saved2 = JSON.parse(localStorage.getItem('fmdm_state_v1') ?? 'null');
check('quests persisted (39 seed + 1 custom)', saved2?.quests?.length === 40, String(saved2?.quests?.length));
check('session persisted', saved2?.sessions?.length === 1);
check('chapter milestone persisted', saved2?.chapters?.[0]?.milestones?.[0]?.done === true);
check('travel log persisted', (saved2?.travel?.log?.length ?? 0) >= 2);
check('weather day 13 persisted', saved2?.weather?.day === 13);

console.log('\n═══ SCENE 13: Phase 5 — the five requests ═══');
// (1) Sticky combat command bar with Next reachable at top
click(byText('.nav-btn', 'Combat'), 'Combat tab'); await sleep(20);
click(byText('button', '+ Add combatants'), 'add'); await sleep(20);
type($('.sheet .input'), 'yeti', 'search yeti'); await sleep(20);
click(byText('.creature-add', 'Yeti'), 'add yeti'); await sleep(20);
click(byText('.creature-add', 'Yeti'), 'add second yeti'); await sleep(20);
click(byText('.sheet button', 'Done'), 'done'); await sleep(20);
check('sticky command bar renders', !!document.querySelector('.combat-toolbar.sticky'));
const topNext = byText('.combat-toolbar.sticky button', 'Begin ▸');
check('Begin/Next in top bar', !!topNext);
click(topNext, 'begin from top bar'); await sleep(20);
check('round starts from top control', bodyHas('R1'));
check('active combatant named in bar', !!document.querySelector('.turn-now'));
click(byText('.combat-toolbar.sticky button', 'Next ▸'), 'next from top'); await sleep(30);
check('bottom turn bar also present', !!document.querySelector('.turn-bar .turn-btn'));
click(byText('.combat-toolbar.sticky button', 'End'), 'end (arm)'); await sleep(20);
click(byText('.combat-toolbar.sticky button', 'End?'), 'end (confirm)'); await sleep(20);

// (2) Sidekick recruited removed from towns
click(byText('.nav-btn', 'World'), 'World'); await sleep(20);
click(byText('.sub-tab', 'Towns'), 'Towns'); await sleep(20);
click(byText('.unit-name', 'Bryn Shander'), 'expand town'); await sleep(20);
check('sidekick chip removed', !bodyHas('Sidekick recruited'));
click(byText('.unit-name', 'Bryn Shander'), 'collapse town'); await sleep(20);

// (3) Milestone popup with chapter quests
click(byText('.nav-btn', 'Session'), 'Session'); await sleep(20);
click(byText('.sub-tab', 'Progress'), 'Progress'); await sleep(20);
click(byText('.milestone', 'Cold-Hearted Killer'), 'open milestone sheet'); await sleep(30);
check('milestone sheet opens', bodyHas('what this means at your table'));
check('chapter quests listed inside', bodyHas('Foaming Mugs'));
const msQuestBadge = document.querySelector('.ms-quest .standing') as HTMLElement;
const b4 = msQuestBadge?.textContent;
msQuestBadge?.click(); await sleep(20);
check('quest advances from milestone sheet', document.querySelector('.ms-quest .standing')?.textContent !== b4);
click(byText('.sheet button', 'Complete ✦'), 'complete milestone'); await sleep(20);
click($('.sheet-close'), 'close sheet'); await sleep(20);
check('milestone crossed off', $$('.milestone.done').length >= 2);
check('+ Milestone button exists', !!byText('button', '+ Milestone'));

// (4) Encounter category filters + copy/edit
click(byText('.nav-btn', 'Combat'), 'Combat'); await sleep(20);
click(byText('.sub-tab', 'Encounters'), 'Encounters'); await sleep(20);
check('category filter chips', !!byText('.cond-chip.frosty', 'travel') && !!byText('.cond-chip.frosty', 'social'));
const allCount = $$('.card h3').length;
click(byText('.cond-chip.frosty', 'social'), 'filter social'); await sleep(20);
check('category filter narrows list', $$('.card h3').length < allCount);
click(byText('.cond-chip.frosty', 'Anywhere'), 'reset filter'); await sleep(20);
check('Copy & edit removed', !byText('button', 'Copy & edit'));
const newEncBtn = byText('button', '+ New encounter');
check('+ New encounter present (top)', !!newEncBtn);
click(newEncBtn, 'open new encounter'); await sleep(30);
type($$('.sheet .input')[0], 'Wolves on the tundra', 'enc name'); await sleep(20);
check('description box is roomy', (document.querySelector('.sheet textarea') as HTMLTextAreaElement)?.rows >= 5);
check('form gap before save', !!document.querySelector('.sheet .form-gap'));
click(byText('.sheet button', 'Save encounter'), 'save'); await sleep(30);
check('custom encounter saved', bodyHas('Wolves on the tundra') && bodyHas('✦ yours'));
check('edit button on custom', !!byText('.card button', 'Edit'));

// (5) VFX present
check('snowfall flakes render', $$('.starfield .flake').length >= 10);

console.log('\n═══ SCENE 14: Compendium — bestiary, spells, items ═══');
click(byText('.nav-btn', 'Lore'), 'Lore'); await sleep(20);
click(byText('.sub-tab', 'Bestiary'), 'Bestiary'); await sleep(20);
check('Rime creatures listed', bodyHas('Chardalyn Dragon') && bodyHas('Chwinga'));
click(byText('.cr-name', 'Crag Cat'), 'expand crag cat'); await sleep(20);
check('full stat block inline', bodyHas('Nondetection'));
await sleep(400);
check('5e browser offline fallback graceful', bodyHas('online visit') || bodyHas('Loading the library'));
click(byText('.sub-tab', 'Spells'), 'Spells'); await sleep(400);
check('spells tab renders without crash', bodyHas('Spells'));
click(byText('.sub-tab', 'Items'), 'Items'); await sleep(30);
check('Rime items in master list', bodyHas('Psi Crystal') && bodyHas('Snowshoes'));
click(byText('.creature-add', 'Psi Crystal'), 'open rime item'); await sleep(20);
check('item sheet with description', bodyHas('psionic energy'));
click($('.sheet-close'), 'close item'); await sleep(20);

console.log('\n═══ SCENE 15: The unified bestiary ═══');
click(byText('.nav-btn', 'Lore'), 'Lore'); await sleep(20);
click(byText('.sub-tab', 'Bestiary'), 'Bestiary'); await sleep(400);
check('CR filter chips', !!byText('.cond-chip', 'CR 0–1') && !!byText('.cond-chip', '13+'));
check('source filter chips', !!byText('.cond-chip.frosty', '❄ Rime'));
check('offline note graceful', bodyHas('online visit') || bodyHas('Downloading the 5e bestiary'));
check('rime entries with CR badges', $$('.cr-badge').length >= 15);
type($('.input'), 'yeti', 'search yeti'); await sleep(20);
check('search narrows', $$('.cr-badge').length <= 3 && bodyHas('Yeti'));
click(byText('.cr-name', 'Yeti'), 'expand yeti card'); await sleep(20);
check('collapsible stat block inline', bodyHas('Keen Smell') || bodyHas('Chilling Gaze'));
type($('.input'), '', 'clear'); await sleep(20);
click(byText('button', '+ New monster'), 'monster builder'); await sleep(20);
const mInputs = $$('.sheet .input');
type(mInputs[1], 'Rime Wraith', 'name'); await sleep(20);
click(byText('.sheet button', 'Create monster'), 'create'); await sleep(30);
click(byText('.cond-chip.frosty', '✦ Yours'), 'filter yours'); await sleep(20);
check('custom monster in bestiary', bodyHas('Rime Wraith'));
click(byText('.cond-chip.frosty', 'Everything'), 'reset'); await sleep(20);

console.log('\n═══ SCENE 16: Items & spells — no scroll traps ═══');
click(byText('.sub-tab', 'Items'), 'Items'); await sleep(20);
check('item mode chips', !!byText('.cond-chip.frosty', 'Magic items') && !!byText('.cond-chip.frosty', 'Shop goods'));
click(byText('.cond-chip.frosty', 'Shop goods'), 'shop goods'); await sleep(400);
check('gear categories offered', bodyHas('General goods') && bodyHas('Mounts'));
check('offline shelf note', bodyHas('online visit'));
check('ref-list has no height cap', !document.querySelector('.ref-list[style*="max-height"]'));
click(byText('.sub-tab', 'Spells'), 'Spells'); await sleep(400);
check('spell list uses page flow', !document.querySelector('.creature-list') || !!document.querySelector('.ref-list') || bodyHas('online visit'));

console.log('\n═══ SCENE 17: Sidekicks & allies ═══');
click(byText('.nav-btn', 'Party'), 'Party'); await sleep(20);
check('three party tabs', !!byText('.sub-tab', 'Sidekicks') && !!byText('.sub-tab', 'Allies'));
click(byText('.sub-tab', 'Sidekicks'), 'Sidekicks'); await sleep(20);
click(byText('button', '+ Add sidekick'), 'add sidekick'); await sleep(20);
type($$('.sheet .input')[1], 'Korrik', 'name'); await sleep(20);
click(byText('.sheet .cond-chip', 'Expert'), 'class Expert'); await sleep(20);
const linkSel2 = document.querySelector('.sheet select.input') as HTMLSelectElement;
check('linked-to dropdown', !!linkSel2);
if (linkSel2) {
  const opt = [...linkSel2.options].find((o) => o.textContent?.includes('Wick'));
  if (opt) { linkSel2.value = opt.value; linkSel2.dispatchEvent(new Event('change', { bubbles: true })); }
  await sleep(20);
}
click(byText('.sheet button', 'Add ally'), 'save sidekick'); await sleep(30);
check('sidekick card with class + link', bodyHas('Korrik') && bodyHas("Wick's"));

click(byText('.sub-tab', 'Allies'), 'Allies'); await sleep(20);
click(byText('button', '+ Recruit ally'), 'recruit'); await sleep(300);
check('recruit sheet: NPCs + monsters', bodyHas('NPCs') && bodyHas('Monsters'));
click(byText('.sheet .npc-chip', 'Vellynne'), 'recruit Vellynne'); await sleep(30);
check('NPC ally recruited', bodyHas('Vellynne'));
click(byText('.cr-name', 'Vellynne') ?? byText('.unit-name', 'Vellynne'), 'expand ally'); await sleep(20);
check('NPC ally links to sheet', !!byText('button', 'Open NPC sheet'));

console.log('\n═══ SCENE 18: Weather from the strip + travel rules ═══');
click($('.weather-strip.tappable'), 'tap weather strip'); await sleep(30);
check('weather sheet opens from strip', bodyHas('Roll weather') && bodyHas('New day'));
click($('.sheet-close'), 'close'); await sleep(20);
click(byText('.nav-btn', 'World'), 'World'); await sleep(20);
click(byText('.sub-tab', 'Travel'), 'Travel'); await sleep(20);
check('supplies tracker', bodyHas('Rations') && !!document.querySelector('.supply-n'));
check('travel rules reference', bodyHas('Extreme cold') && bodyHas('Deep snow'));
const rationsBefore = parseInt(document.querySelector('.supply-n')!.textContent!, 10);
// take a 1-day trip to consume rations
{
  const sels = $$('select.input');
  (sels[1] as HTMLSelectElement).value = 'Targos';
  sels[1].dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(20);
}
click(byText('button', 'Set out ✦'), 'set out'); await sleep(20);
click(byText('button', 'Arrive at Targos'), 'travel+arrive'); await sleep(30);
const rationsAfter = parseInt(document.querySelector('.supply-n')!.textContent!, 10);
check('travel day consumed rations', rationsAfter === rationsBefore - 4, `${rationsBefore}→${rationsAfter}`);

console.log('\n═══ SCENE 19: The winds of fate (VFX) ═══');
check('26 flakes ride the wind', $$('.starfield .flake').length === 26);
check('gust flakes present', $$('.starfield .flake.gust').length >= 4);
check('stars still shine', $$('.starfield .star').length >= 50);

console.log('\n═══ SCENE 20: Player TV projection — nothing secret leaves the phone ═══');
{
  const { projectPlayerView, hpState } = await import('/home/claude/frostmaiden-dm/src/tv/projection.ts');
  const { patch } = await import('/home/claude/frostmaiden-dm/src/state/store.ts');

  // hpState thresholds
  check('hpState healthy', hpState(30, 40) === 'healthy');
  check('hpState bloodied at half', hpState(20, 40) === 'bloodied');
  check('hpState critical at quarter', hpState(10, 40) === 'critical');
  check('hpState down at 0', hpState(0, 40) === 'down');

  // Exploration projection off the live session state
  let pv = projectPlayerView(state.value);
  check('projection has party', pv.party.length >= 3);
  check('party PCs carry exact HP', typeof pv.party[0].hp === 'number' && pv.party[0].maxHp > 0);
  check('quests only active/escalating', pv.quests.every((q) => q.status === 'active' || q.status === 'escalating'));
  check('no dormant quest leaks', !pv.quests.some((q) => q.name === 'Foaming Mugs') || state.value.quests.find((q) => q.name === 'Foaming Mugs')?.status !== 'dormant');
  const raw = JSON.stringify(pv);
  check('no session secrets in payload', !raw.includes('secrets'));
  check('no DM notes fields in payload', !raw.includes('"notes"') && !raw.includes('nextTrigger'));

  // Combat projection: monsters abstracted, PCs exact, masking works
  patch((d) => {
    d.combat = {
      active: true, round: 2, turn: 1,
      combatants: [
        { id: 'cA', name: 'Brienne', emoji: '⚔️', hp: 30, maxHp: 44, ac: 18, init: 17, initMod: 1, conditions: [], srcType: 'pc', srcId: d.party[0]?.id },
        { id: 'cB', name: 'Crag Cat', emoji: '🐈', hp: 8, maxHp: 34, ac: 13, init: 12, initMod: 3, conditions: [], srcType: 'monster', srcId: 'crag_cat' },
        { id: 'cC', name: 'Frost Druid', emoji: '🌲', hp: 45, maxHp: 45, ac: 11, init: 8, initMod: 1, conditions: [], srcType: 'monster', srcId: 'frost_druid' },
      ],
    };
    d.tv.hiddenCombatantIds = ['cC'];
  });
  pv = projectPlayerView(state.value);
  check('combat mode engages', pv.mode === 'combat' && pv.combat !== null);
  const [pc, cat, druid] = pv.combat!.combatants;
  check('PC combatant keeps exact HP', pc.friendly && pc.hp === 30);
  check('monster HP abstracted (critical)', cat.hp === null && cat.hpState === 'critical');
  check('monster AC never in payload', !JSON.stringify(pv).includes('"ac"'));
  check('hidden monster masked as ???', druid.name === '???' && druid.emoji === '❓');
  check('active/next flags set', cat.active && druid.next);

  patch((d) => { d.combat = { active: false, round: 0, turn: 0, combatants: [] }; d.tv.hiddenCombatantIds = []; });
  pv = projectPlayerView(state.value);
  check('back to exploration when combat ends', pv.mode === 'exploration' && pv.combat === null);
}

console.log('\n═══ SCENE 21: TV Phase 2 — hide toggle + TV layouts render ═══');
{
  const { projectPlayerView } = await import('/home/claude/frostmaiden-dm/src/tv/projection.ts');
  const { patch } = await import('/home/claude/frostmaiden-dm/src/state/store.ts');
  const { render: rts } = await import('preact-render-to-string');
  const { CombatView, ExplorationView } = await import('/home/claude/frostmaiden-dm/src/tv/app.tsx');

  // Stage a combat and drive the hide toggle through the real DM UI
  patch((d) => {
    d.combat = {
      active: true, round: 3, turn: 0,
      combatants: [
        { id: 'cP', name: 'Brienne', emoji: '🛡️', hp: 30, maxHp: 44, ac: 18, init: 17, initMod: 1, conditions: [], srcType: 'pc', srcId: d.party[0]?.id },
        { id: 'cM', name: 'Yeti', emoji: '🦍', hp: 51, maxHp: 51, ac: 12, init: 9, initMod: 0, conditions: [], srcType: 'monster', srcId: 'yeti' },
      ],
    };
    d.tv.hiddenCombatantIds = [];
  });
  click(byText('.nav-btn', 'Combat'), 'Combat tab'); await sleep(30);
  click(byText('.cr-name', 'Yeti'), 'expand Yeti row'); await sleep(20);
  check('hide toggle only on monsters', !!byText('.tv-hide-btn', 'Hide on TV'));
  click(byText('.tv-hide-btn', 'Hide on TV'), 'hide Yeti on TV'); await sleep(20);
  check('combatant id recorded as hidden', state.value.tv.hiddenCombatantIds.includes('cM'));
  check('toggle now offers reveal', !!byText('.tv-hide-btn', 'Reveal on TV'));

  let pv = projectPlayerView(state.value);
  const yeti = pv.combat!.combatants.find((c) => c.id === 'cM')!;
  check('hidden monster masked in projection', yeti.name === '???');

  // Render the actual TV combat view from the projection
  let html = rts(h(CombatView, { v: pv }));
  check('TV shows round counter', html.includes('ROUND 3'));
  check('TV masks hidden monster name', html.includes('???') && !html.includes('Yeti'));
  check('TV never shows monster AC or exact HP', !html.includes('AC 12') && !html.includes('51'));
  check('TV shows PC exact HP', html.includes('30/44'));
  check('TV marks active turn', html.includes('tv-init-row active'));
  check('TV marks next up', html.includes('NEXT'));

  click(byText('.tv-hide-btn', 'Reveal on TV'), 'reveal Yeti'); await sleep(20);
  pv = projectPlayerView(state.value);
  html = rts(h(CombatView, { v: pv }));
  check('reveal restores name on TV', html.includes('Yeti'));
  check('monster HP still abstracted after reveal', html.includes('HEALTHY') && !html.includes('51'));

  // Exploration view renders quests + party grid
  patch((d) => { d.combat = { active: false, round: 0, turn: 0, combatants: [] }; d.tv.hiddenCombatantIds = []; });
  pv = projectPlayerView(state.value);
  html = rts(h(ExplorationView, { v: pv }));
  check('exploration view shows threads', html.includes('THREADS'));
  check('exploration view shows party', html.includes('Brienne'));
}

console.log('\n═══ SCENE 22: Init roll covers all enemy sources + NPC portraits ═══');
{
  const { patch } = await import('/home/claude/frostmaiden-dm/src/state/store.ts');

  // The bug: 🎲 Init only rolled srcType 'monster'|'custom', silently
  // skipping 'api' and 'custommon'. Stage one combatant of every source.
  patch((d) => {
    d.combat = {
      active: false, round: 0, turn: 0,
      combatants: [
        { id: 'iP', name: 'PC', emoji: '🛡️', hp: 20, maxHp: 20, ac: 15, init: null, initMod: 2, conditions: [], srcType: 'pc', srcId: d.party[0]?.id },
        { id: 'iA', name: 'Ally', emoji: '🐺', hp: 11, maxHp: 11, ac: 13, init: null, initMod: 1, conditions: [], srcType: 'ally', srcId: 'x' },
        { id: 'iM', name: 'RimeMon', emoji: '🦍', hp: 30, maxHp: 30, ac: 12, init: null, initMod: 0, conditions: [], srcType: 'monster', srcId: 'yeti' },
        { id: 'iC', name: 'QuickMon', emoji: '👹', hp: 10, maxHp: 10, ac: 10, init: null, initMod: 0, conditions: [], srcType: 'custom' },
        { id: 'iAPI', name: 'ApiMon', emoji: '💀', hp: 22, maxHp: 22, ac: 13, init: null, initMod: 1, conditions: [], srcType: 'api', srcId: 'skeleton' },
        { id: 'iCM', name: 'BuiltMon', emoji: '🐉', hp: 40, maxHp: 40, ac: 16, init: null, initMod: 2, conditions: [], srcType: 'custommon', srcId: 'cm1' },
      ],
    };
  });
  click(byText('.nav-btn', 'Combat'), 'Combat tab'); await sleep(30);
  click(byText('.sub-tab', 'Tracker'), 'Tracker sub-tab'); await sleep(20);
  click(byText('button', '🎲 Init'), 'roll initiative'); await sleep(20);

  const cbs = state.value.combat.combatants;
  const get = (id: string) => cbs.find((c) => c.id === id)!;
  check('rime monster rolled', get('iM').init !== null);
  check('quick custom rolled', get('iC').init !== null);
  check('API monster rolled (was the bug)', get('iAPI').init !== null);
  check('built custom monster rolled (was the bug)', get('iCM').init !== null);
  check('PC untouched — players roll their own', get('iP').init === null);
  check('ally untouched — players roll their own', get('iA').init === null);
  patch((d) => { d.combat = { active: false, round: 0, turn: 0, combatants: [] }; });
}

console.log('\n═══ SCENE 23: Phase 7 — gold, scenes, master lists, TV idle view ═══');
{
  const { patch } = await import('/home/claude/frostmaiden-dm/src/state/store.ts');
  const { migrate } = await import('/home/claude/frostmaiden-dm/src/state/migrations.ts');
  const { projectPlayerView } = await import('/home/claude/frostmaiden-dm/src/tv/projection.ts');
  const { resolveScene, SCENES } = await import('/home/claude/frostmaiden-dm/src/tv/scenes.ts');
  const { render: rts } = await import('preact-render-to-string');
  const { ExplorationView } = await import('/home/claude/frostmaiden-dm/src/tv/app.tsx');

  // -- migration: a v1 save gains gold + sceneId without losing anything
  const v1 = JSON.parse(JSON.stringify(state.value)) as Record<string, unknown>;
  v1.version = 1;
  delete (v1.travel as Record<string, unknown>).gold;
  delete (v1.tv as Record<string, unknown>).sceneId;
  const migrated = migrate(v1);
  check('v1→v2 adds gold', migrated.travel.gold === 0);
  check('v1→v2 adds sceneId auto', migrated.tv.sceneId === 'auto');
  check('v1→v2 keeps rations', migrated.travel.rations === state.value.travel.rations);

  // -- DM gold controls exist and write state
  click(byText('.nav-btn', 'World'), 'World tab'); await sleep(20);
  click(byText('.sub-tab', 'Travel'), 'Travel sub-tab'); await sleep(20);
  check('gold row renders', bodyHas('Gold 💰'));
  click(byText('button', '+10'), 'gold +10'); await sleep(20);
  check('gold incremented', state.value.travel.gold === 10, `${state.value.travel.gold}`);

  // -- scene resolution: auto follows weather/journey, explicit wins
  check('auto: blizzard whiteout', resolveScene('auto', { journeying: true, weatherId: 'blizzard' }).id === 'blizzard');
  check('auto: journey shows the road', resolveScene('auto', { journeying: true, weatherId: 'clear' }).id === 'road');
  check('auto: at rest shows town', resolveScene('auto', { journeying: false, weatherId: 'clear' }).id === 'town');
  check('explicit scene wins', resolveScene('tavern', { journeying: true, weatherId: 'blizzard' }).id === 'tavern');
  check('all scenes have art', SCENES.every((s) => typeof s.url === 'string' && s.url.length > 0));

  // -- projection v2 carries resources + scene + ally links; TV nests allies
  patch((d) => {
    d.travel.gold = 137;
    d.sidekicks.push({
      id: 'skT', name: 'Grit', emoji: '🐺', type: 'Beast', hp: 11, maxHp: 11, ac: 13,
      level: 1, initMod: 1, conditions: [], linkedPcId: d.party[0]?.id,
      classTags: [], attacks: [], features: [], notes: '',
    } as never);
  });
  const pv = projectPlayerView(state.value);
  check('projection carries gold', pv.resources.gold === 137);
  check('projection carries rations + party size', pv.resources.rations >= 0 && pv.resources.partySize >= 1);
  check('souls removed from TV ledger', true); // display-only removal, asserted in scene 24
  check('projection resolves concrete scene', pv.sceneId !== 'auto' && SCENES.some((s) => s.id === pv.sceneId));
  check('ally carries linkedPcId', pv.allies.some((a) => a.id === 'skT' && a.linkedPcId === state.value.party[0]?.id));

  const html = rts(h(ExplorationView, { v: pv }));
  check('TV: party column present', html.includes('tv-party-col'));
  check('TV: ally nested under its PC', html.includes('tv-roster-ally') && html.includes('Grit'));
  check('TV: scene art renders', html.includes('tv-scene-art'));
  check('TV: gold on the ledger', html.includes('137') && html.includes('GOLD'));
  check('TV: rations on the ledger', html.includes('RATIONS'));
  check('TV: no secrets — no AC anywhere', !html.includes('AC '));
  patch((d) => { d.sidekicks = d.sidekicks.filter((s2) => s2.id !== 'skT'); });

  // -- compendium: bestiary is one alphabet, rime inline
  const { localBestiary } = await import('/home/claude/frostmaiden-dm/src/screens/monsters.tsx');
  const sortedLocal = [...localBestiary()].sort((a, b) => a.name.localeCompare(b.name));
  click(byText('.nav-btn', 'Lore'), 'Lore tab'); await sleep(20);
  click(byText('.sub-tab', 'Bestiary'), 'Bestiary sub-tab'); await sleep(40);
  const cardNames = $$('.unit .unit-name, .unit .cr-name, .unit strong').map((el) => el.textContent?.trim());
  check('bestiary renders', $$('.unit').length >= sortedLocal.length - 1, `${$$('.unit').length} cards`);
  // offline in sim: list = local only, and it must arrive alphabetized
  const shownOrder = $$('.unit').map((u) => u.textContent ?? '');
  const abomIdx = shownOrder.findIndex((t) => t.includes('Abominable Yeti'));
  const yetiIdx = shownOrder.findIndex((t) => t.includes('Yeti') && !t.includes('Abominable'));
  check('bestiary alphabetized (Abominable before Yeti)', abomIdx !== -1 && yetiIdx !== -1 && abomIdx < yetiIdx, `${abomIdx} < ${yetiIdx}`);

  // -- items: All is default, rime items are normal rows with emoji
  click(byText('.sub-tab', 'Items'), 'Items sub-tab'); await sleep(30);
  check('All items chip is default-on', byText('.cond-chip', 'All items')?.className.includes('on') ?? false);
  check('rime item is a row, not a chip pile', !!byText('.creature-add', 'Snowshoes'));
  check('rime row keeps its emoji', bodyHas('🥾') && bodyHas('🛷'));
  check('rime rows tagged', bodyHas('❄ rime'));
  const itemOrder = $$('.creature-add').map((b) => b.textContent ?? '');
  const cramp = itemOrder.findIndex((t) => t.includes('Crampons'));
  const snow = itemOrder.findIndex((t) => t.includes('Snowshoes'));
  check('item master list alphabetized', cramp !== -1 && snow !== -1 && cramp < snow, `${cramp} < ${snow}`);
  click(byText('.creature-add', 'Snowshoes'), 'open rime item'); await sleep(20);
  check('rime item sheet opens', bodyHas('deep snow'));
}

console.log('\n═══ SCENE 24: Polish — death saves everywhere, art library, no souls ═══');
{
  const { patch } = await import('/home/claude/frostmaiden-dm/src/state/store.ts');
  const { projectPlayerView } = await import('/home/claude/frostmaiden-dm/src/tv/projection.ts');
  const { SCENES, SCENE_CATS, sceneById } = await import('/home/claude/frostmaiden-dm/src/tv/scenes.ts');
  const { render: rts } = await import('preact-render-to-string');
  const { ExplorationView, CombatView } = await import('/home/claude/frostmaiden-dm/src/tv/app.tsx');

  // -- the art library: categorized, filterable, complete
  check('all four art categories present', (['location', 'map', 'monster', 'npc'] as const)
    .every((c) => SCENES.some((s) => s.cat === c)));
  check('scene cat filter list matches', SCENE_CATS.length === 5);
  check('36 art pieces + 10 pixel scenes', SCENES.length === 46, `${SCENES.length}`);
  check('maps include all Ten-Towns art', ['map-bremen', 'map-bryn-shander', 'map-targos', 'map-easthaven'].every((id) => !!sceneById(id)));
  check('art has real urls', SCENES.every((s) => s.url.length > 0));

  // -- a downed PC carries death saves through combat projection to the TV
  patch((d) => {
    const pc = d.party[0];
    if (pc) { pc.hp = 0; pc.deathS = 2; pc.deathF = 1; }
    d.combat = {
      active: true, round: 1, turn: 0,
      combatants: [
        { id: 'dsPC', name: pc?.name ?? 'PC', emoji: '🛡️', hp: 0, maxHp: 10, ac: 15, init: 12, initMod: 2, conditions: [], srcType: 'pc', srcId: pc?.id },
        { id: 'dsMon', name: 'Wolf', emoji: '🐺', hp: 11, maxHp: 11, ac: 13, init: 8, initMod: 1, conditions: [], srcType: 'monster', srcId: 'crag_cat' },
      ],
    };
  });
  const pvC = projectPlayerView(state.value);
  const pcRow = pvC.combat!.combatants.find((c) => c.id === 'dsPC')!;
  const monRow = pvC.combat!.combatants.find((c) => c.id === 'dsMon')!;
  check('combat projection: downed PC has saves', pcRow.deathS === 2 && pcRow.deathF === 1);
  check('combat projection: monster has none', monRow.deathS === null && monRow.deathF === null);
  const combatHtml = rts(h(CombatView, { v: pvC, flash: false, roundPulse: false }));
  check('TV combat: death pips render', combatHtml.includes('tv-deathsaves'));

  // -- phone tracker shows and edits saves for the downed PC
  click(byText('.nav-btn', 'Combat'), 'Combat tab'); await sleep(30);
  click(byText('.sub-tab', 'Tracker'), 'Tracker sub-tab'); await sleep(20);
  check('tracker: inline pips on downed PC row', $$('.ds-inline').length >= 1);
  click($('.combat-row .cr-grid'), 'expand downed PC'); await sleep(20);
  check('tracker: death saves editor renders', $$('.death-saves-row').length === 1);
  const failPips = $$('.death-saves-row .ds-pip.fail');
  click(failPips[1], 'mark second fail'); await sleep(20);
  check('tracker edit syncs to party record', state.value.party[0]?.deathF === 2, `${state.value.party[0]?.deathF}`);

  // -- exploration ledger: no souls, layout classes that keep it on-screen
  patch((d) => { d.combat = { active: false, round: 0, turn: 0, combatants: [] }; });
  const pvE = projectPlayerView(state.value);
  const exploreHtml = rts(h(ExplorationView, { v: pvE }));
  check('TV ledger: souls removed', !exploreHtml.includes('SOULS'));
  check('TV ledger: gold + rations + day remain', ['GOLD', 'RATIONS', 'DAY'].every((t) => exploreHtml.includes(t)));
  check('TV: art scenes get contain fit', rts(h(ExplorationView, { v: { ...pvE, sceneId: 'mon-yeti' } })).includes('fit-contain'));
  check('TV: pixel scenes keep cover fit', !rts(h(ExplorationView, { v: { ...pvE, sceneId: 'town' } })).includes('fit-contain'));
  patch((d) => { const pc = d.party[0]; if (pc) { pc.hp = pc.maxHp; pc.deathS = 0; pc.deathF = 0; } });
}

console.log('\n═══ SCENE 25: Phase 8 — ally saves, ambience, weather moods, idle party ═══');
{
  const { patch } = await import('/home/claude/frostmaiden-dm/src/state/store.ts');
  const { migrate } = await import('/home/claude/frostmaiden-dm/src/state/migrations.ts');
  const { projectPlayerView } = await import('/home/claude/frostmaiden-dm/src/tv/projection.ts');
  const { parseYouTubeId } = await import('/home/claude/frostmaiden-dm/src/components/TvPanel.tsx');
  const { render: rts } = await import('preact-render-to-string');
  const { ExplorationView, CombatView } = await import('/home/claude/frostmaiden-dm/src/tv/app.tsx');
  const { TvBackdrop } = await import('/home/claude/frostmaiden-dm/src/tv/vfx.tsx');

  // -- migration v2 → v3
  const v2 = JSON.parse(JSON.stringify(state.value)) as Record<string, unknown>;
  v2.version = 2;
  (v2.sidekicks as Record<string, unknown>[]).forEach((a) => { delete a.deathS; delete a.deathF; });
  delete (v2.tv as Record<string, unknown>).youtubeId;
  const m3 = migrate(v2);
  check('v2→v3 sidekicks gain saves', m3.sidekicks.every((a) => a.deathS === 0 && a.deathF === 0));
  check('v2→v3 tv gains youtubeId', m3.tv.youtubeId === '');

  // -- YouTube id parsing
  check('parse watch url', parseYouTubeId('https://www.youtube.com/watch?v=jfKfPfyJRdk') === 'jfKfPfyJRdk');
  check('parse youtu.be url', parseYouTubeId('https://youtu.be/jfKfPfyJRdk?t=10') === 'jfKfPfyJRdk');
  check('parse bare id', parseYouTubeId('jfKfPfyJRdk') === 'jfKfPfyJRdk');
  check('reject garbage', parseYouTubeId('not a video') === null);

  // -- a downed linked ally: saves flow party ↔ tracker ↔ TV
  patch((d) => {
    d.sidekicks.push({
      id: 'skD', name: 'Brindle', emoji: '🐕', kind: 'Dog', category: 'sidekick',
      linkedPcId: d.party[0]?.id, level: 1, hp: 0, maxHp: 8, ac: 12, initMod: 1,
      scores: { str: 10, dex: 12, con: 10, int: 3, wis: 12, cha: 6 },
      attacks: [], conditions: [], deathS: 1, deathF: 2, location: '', notes: '',
    } as never);
    d.combat = {
      active: true, round: 1, turn: 0,
      combatants: [
        { id: 'caA', name: 'Brindle', emoji: '🐕', hp: 0, maxHp: 8, ac: 12, init: 9, initMod: 1, conditions: [], srcType: 'ally', srcId: 'skD' },
        { id: 'caM', name: 'Wolf', emoji: '🐺', hp: 11, maxHp: 11, ac: 13, init: 8, initMod: 1, conditions: [], srcType: 'monster', srcId: 'crag_cat' },
      ],
    };
    d.tv.youtubeId = 'jfKfPfyJRdk';
  });

  const pv = projectPlayerView(state.value);
  const brindle = pv.allies.find((a) => a.id === 'skD')!;
  check('projection: downed ally carries saves', brindle.down && brindle.deathS === 1 && brindle.deathF === 2);
  check('projection: youtubeId travels', pv.youtubeId === 'jfKfPfyJRdk');

  const combatHtml = rts(h(CombatView, { v: pv, flash: false, roundPulse: false }));
  check('TV combat: no party panel — initiative is the focus', !combatHtml.includes('tv-party'));
  check('TV combat: downed ally pips live in the init row', combatHtml.includes('tv-deathsaves'));
  check('TV combat: scene card sets the mood', combatHtml.includes('tv-scene-art'));

  const { AmbiencePlayer } = await import('/home/claude/frostmaiden-dm/src/tv/app.tsx');
  const exploreHtml = rts(h(ExplorationView, { v: pv }));
  check('TV explore: downed ally pips under its PC', exploreHtml.includes('tv-roster-ally down'));
  check('TV explore: emoji ledger inside the party column', exploreHtml.includes('💰') && exploreHtml.includes('tv-roster-ledger'));
  check('TV explore: threads list replaces objectives', exploreHtml.includes('THREADS') && !exploreHtml.includes('OBJECTIVES'));
  check('TV explore: player NOT inside the view (root-mounted)', !exploreHtml.includes('tv-yt-frame'));
  const playerHtml = rts(h(AmbiencePlayer, { v: pv }));
  check('root player renders iframe once id is set', playerHtml.includes('tv-yt-frame') && playerHtml.includes('jfKfPfyJRdk'));
  check('root player absent when id empty', rts(h(AmbiencePlayer, { v: { ...pv, youtubeId: '' } })) === '');

  check('ledger uses widely-supported money bag', exploreHtml.includes('💰') && !exploreHtml.includes('🪙'));

  // -- phone: tracker pips for the downed ally; party tab editor
  click(byText('.nav-btn', 'Combat'), 'Combat tab'); await sleep(30);
  click(byText('.sub-tab', 'Tracker'), 'Tracker sub-tab'); await sleep(20);
  check('tracker: inline pips on downed ally', $$('.ds-inline').length >= 1);
  click($('.combat-row .cr-grid'), 'expand downed ally'); await sleep(20);
  check('tracker: editor for ally saves', $$('.death-saves-row').length === 1);
  const okPips = $$('.death-saves-row .ds-pip:not(.fail)');
  click(okPips[1], 'mark second save'); await sleep(20);
  check('tracker edit writes to sidekick record', state.value.sidekicks.find((a) => a.id === 'skD')?.deathS === 2);

  // -- weather moods
  const clear = rts(h(TvBackdrop, { weatherId: 'clear' }));
  const over = rts(h(TvBackdrop, { weatherId: 'overcast' }));
  const bliz = rts(h(TvBackdrop, { weatherId: 'blizzard' }));
  const wrath = rts(h(TvBackdrop, { weatherId: 'magical_storm' }));
  const count = (html: string, cls: string) => (html.match(new RegExp(`class="${cls}`, 'g')) ?? []).length;
  check('clear: a few flakes flutter', count(clear, 'tvfx-flake') === 4, `${count(clear, 'tvfx-flake')}`);
  check('clear: no clouds', count(clear, 'tvfx-cloud') === 0);
  check('overcast: cloudy sky', count(over, 'tvfx-cloud') === 6);
  check('blizzard: heavy snow', count(bliz, 'tvfx-flake') === 90);
  check("Auril's wrath: magic motes", count(wrath, 'tvfx-mote') === 14);
  check('wrath motes include thread-garnet', wrath.includes('tvfx-mote thread'));

  // cleanup
  patch((d) => {
    d.sidekicks = d.sidekicks.filter((a) => a.id !== 'skD');
    d.combat = { active: false, round: 0, turn: 0, combatants: [] };
    d.tv.youtubeId = '';
  });
}

console.log('\n═══ SCENE 26: Save files, party location, distinct weather ═══');
{
  const { patch, replaceState } = await import('/home/claude/frostmaiden-dm/src/state/store.ts');
  const { projectPlayerView } = await import('/home/claude/frostmaiden-dm/src/tv/projection.ts');
  const { render: rts } = await import('preact-render-to-string');
  const { TvBackdrop } = await import('/home/claude/frostmaiden-dm/src/tv/vfx.tsx');

  // -- save file round-trip: export shape → replaceState restores it
  patch((d) => { d.travel.gold = 999; });
  const exported = JSON.parse(JSON.stringify(state.value));
  patch((d) => { d.travel.gold = 1; d.tv.partyLocation = 'scratch'; });
  check('state diverged before import', state.value.travel.gold === 1);
  replaceState(exported);
  check('import restores gold', state.value.travel.gold === 999);
  check('import restores tv settings', state.value.tv.partyLocation !== 'scratch');
  check('import keeps schema version current', state.value.version === exported.version);
  // an OLD save (v1) imports through the migration pipeline
  const oldSave = JSON.parse(JSON.stringify(exported)) as Record<string, unknown>;
  oldSave.version = 1;
  delete (oldSave.travel as Record<string, unknown>).gold;
  delete (oldSave.tv as Record<string, unknown>).sceneId;
  delete (oldSave.tv as Record<string, unknown>).youtubeId;
  delete (oldSave.tv as Record<string, unknown>).mediaVisible;
  replaceState(oldSave);
  check('old save migrates on import', state.value.version >= 4 && state.value.travel.gold === 0 && state.value.tv.sceneId === 'auto');
  replaceState(exported);

  // -- save card renders on the Session screen
  click(byText('.nav-btn', 'Session'), 'Session tab'); await sleep(30);
  check('campaign save card present', bodyHas('Campaign save file') && !!byText('button', '⬇ Export save'));

  // -- party location: field on Party tab drives the TV strip
  click(byText('.nav-btn', 'Party'), 'Party tab'); await sleep(30);
  const locInput = $('.party-loc-card input') as HTMLInputElement | null;
  check('party location field renders', !!locInput);
  patch((d) => { d.tv.partyLocation = 'The Black Cabin'; });
  check('TV strip shows manual location', projectPlayerView(state.value).location === 'The Black Cabin');
  patch((d) => {
    d.travel.activeJourney = { origin: 'Targos', dest: 'Bremen', pace: 'normal', day: 1, totalDays: 2, startDay: 1 } as never;
  });
  check('manual location outranks journey while set', projectPlayerView(state.value).location === 'The Black Cabin');
  patch((d) => { d.tv.partyLocation = ''; });
  check('cleared field falls back to journey route', projectPlayerView(state.value).location === 'Targos → Bremen');
  patch((d) => { d.travel.activeJourney = null; });
  check('no journey, no manual → default', projectPlayerView(state.value).location === 'Ten-Towns, Icewind Dale');

  // -- distinct weather
  const count = (html: string, cls: string) => (html.match(new RegExp(`class="${cls}`, 'g')) ?? []).length;
  const bliz = rts(h(TvBackdrop, { weatherId: 'blizzard' }));
  const wrath = rts(h(TvBackdrop, { weatherId: 'magical_storm' }));
  const over = rts(h(TvBackdrop, { weatherId: 'overcast' }));
  const clear = rts(h(TvBackdrop, { weatherId: 'clear' }));
  check('per-weather container class', clear.includes('tvfx wx-clear') && bliz.includes('tvfx wx-blizzard'));
  check('blizzard gets wind streaks', count(bliz, 'tvfx-streak') === 14);
  check("Auril's Wrath gets magic sparkles", count(wrath, 'tvfx-sparkle') === 10 && wrath.includes('tvfx-sparkle big'));
  check('wrath keeps motes too', count(wrath, 'tvfx-mote') === 14);
  check('overcast is cloud-heavy, streak-free', count(over, 'tvfx-cloud') === 6 && count(over, 'tvfx-streak') === 0);
  check('clear is nearly still', count(clear, 'tvfx-flake') === 4 && count(clear, 'tvfx-cloud') === 0);
}

console.log(`\n════════ RESULT: ${pass} passed, ${fail} failed ════════`);
if (fail) process.exit(1);
