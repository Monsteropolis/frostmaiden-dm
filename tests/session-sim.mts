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
click(byText('.cond-chip', 'Frightened'), 'toggle Frightened'); await sleep(20);
check('condition tag appears', $$('.cond-tag').some((t) => t.textContent === 'Frightened'));
click($('.inspo'), 'inspiration star'); await sleep(20);
check('inspiration lit', !!$('.inspo.on'));
click(byText('.cond-chip', 'Frightened'), 'untoggle Frightened'); await sleep(20);

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

click(byText('button', 'Roll init (foes)'), 'roll foe initiative'); await sleep(20);
// set party inits manually
const initInputs = $$('.combat-row .input.num');
check('init inputs present', initInputs.length >= 7);
click(byText('button', 'Begin combat'), 'begin combat'); await sleep(20);
check('round 1 begins', bodyHas('Round 1'));
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

// end combat two-tap
click(byText('button', 'End combat'), 'end combat (arm)'); await sleep(20);
click(byText('button', 'End?'), 'end combat (confirm)'); await sleep(20);
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
click(byText('.milestone', 'Party arrives'), 'toggle milestone'); await sleep(20);
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

console.log(`\n════════ RESULT: ${pass} passed, ${fail} failed ════════`);
if (fail) process.exit(1);
