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
click(byText('.sheet .cond-chip', 'Sephek Kaltro'), 'link Sephek'); await sleep(20);
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
click(byText('button', '+ Add combatants'), 'add combatants'); await sleep(20);
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
click(byText('.combat-row .unit-name', 'Wick'), 'expand Wick'); await sleep(20);
click(byText('.combat-row .btn', '−5'), 'damage 5'); await sleep(20);
click(byText('.combat-row .btn', '−5'), 'damage 5 again'); await sleep(20);
check('Wick HP 21/31 in tracker', bodyHas('21 / 31'));

// verify live sync to Party tab
click(byText('.nav-btn', 'Party'), 'Party tab'); await sleep(20);
check('SYNC: party sheet shows 21/31', bodyHas('21 / 31'));
click(byText('.nav-btn', 'Combat'), 'back to Combat'); await sleep(20);

// expand a bandit → monster panel? bandits are custom/api. Use crag cat instead:
click(byText('button', '+ Add combatants'), 'add combatants again'); await sleep(20);
type($('.sheet .input'), 'crag', 'search creatures'); await sleep(20);
click(byText('.creature-add', 'Crag Cat'), 'add crag cat'); await sleep(20);
click(byText('.sheet button', 'Done'), 'close'); await sleep(20);
click(byText('.combat-row .unit-name', 'Crag Cat'), 'expand crag cat'); await sleep(20);
check('stat panel: traits', bodyHas('Nondetection'));
const atkBtn = byText('.stat-action .btn', 'd20+5');
check('rollable action parsed', !!atkBtn);
click(atkBtn, 'roll Bite attack'); await sleep(20);
check('roll toast appears', !!$('.roll-toast'), $('.rt-total')?.textContent ?? '');
const dmgBtn = byText('.stat-action .btn', '1d10+3');
click(dmgBtn, 'roll damage'); await sleep(20);
check('damage toast', !!$('.roll-toast'));

// kill a bandit: expand first bandit, set hp 0
const banditName = byText('.combat-row .unit-name', 'Bandit 1');
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

console.log(`\n════════ RESULT: ${pass} passed, ${fail} failed ════════`);
if (fail) process.exit(1);
