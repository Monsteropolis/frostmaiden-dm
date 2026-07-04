// ============================================================
// TV SCENES — everything the DM can put on the players' screen.
// Two kinds share one registry:
//   'pixel'  — original 8-bit backdrops (128×72, app palette),
//              upscaled crisp with object-fit: cover.
//   art      — module artwork (locations, maps, monsters, NPCs),
//              shown object-fit: contain so nothing gets cropped.
// The DM picker filters by category; 'auto' only ever resolves
// to pixel scenes, so the idle mood never flashes a spoiler.
// ============================================================

// --- pixel scenes (original art) ---
import town from '../assets/scenes/town.png';
import tavern from '../assets/scenes/tavern.png';
import road from '../assets/scenes/road.png';
import lake from '../assets/scenes/lake.png';
import cave from '../assets/scenes/cave.png';
import forge from '../assets/scenes/forge.png';
import aurora from '../assets/scenes/aurora.png';
import blizzard from '../assets/scenes/blizzard.png';
import camp from '../assets/scenes/camp.png';
import peak from '../assets/scenes/peak.png';

// --- module artwork: locations ---
import locTheCaer from '../assets/art/loc-the-caer.png';
import locEasthavenAurora from '../assets/art/loc-easthaven-aurora.png';
import locEasthavenPyre from '../assets/art/loc-easthaven-pyre.png';
import locGiantLodge from '../assets/art/loc-giant-lodge.png';
import locVerbeegLair from '../assets/art/loc-verbeeg-lair.png';
import locKarkolohk from '../assets/art/loc-karkolohk.png';
import locBlueBoots from '../assets/art/loc-blue-boots.png';

// --- module artwork: town maps ---
import mapBremen from '../assets/art/map-bremen.png';
import mapBrynShander from '../assets/art/map-bryn-shander.png';
import mapCaerDineval from '../assets/art/map-caer-dineval.png';
import mapCaerKonig from '../assets/art/map-caer-konig.png';
import mapDougansHole from '../assets/art/map-dougans-hole.png';
import mapEasthaven from '../assets/art/map-easthaven.png';
import mapGoodMead from '../assets/art/map-good-mead.png';
import mapLonelywood from '../assets/art/map-lonelywood.png';
import mapTargos from '../assets/art/map-targos.png';
import mapTermalaine from '../assets/art/map-termalaine.png';

// --- module artwork: monsters ---
import monAxeBeak from '../assets/art/mon-axe-beak.png';
import monWolf from '../assets/art/mon-wolf.png';
import monSnowyOwlbear from '../assets/art/mon-snowy-owlbear.png';
import monYeti from '../assets/art/mon-yeti.png';
import monCragCat from '../assets/art/mon-crag-cat.png';
import monPlesiosaurus from '../assets/art/mon-plesiosaurus.png';
import monWinterWolves from '../assets/art/mon-winter-wolves.png';
import monWhiteMoose from '../assets/art/mon-white-moose.png';
import monReindeer from '../assets/art/mon-reindeer.png';
import monDuergar from '../assets/art/mon-duergar.png';
import monMindMaster from '../assets/art/mon-mind-master.png';
import monFrostGiant from '../assets/art/mon-frost-giant.png';
import monChwinga from '../assets/art/mon-chwinga.webp';

// --- module artwork: NPCs ---
import npcSephek from '../assets/art/npc-sephek.png';
import npcRavisin from '../assets/art/npc-ravisin.png';
import npcMaud from '../assets/art/npc-maud.png';
import npcRinaldo from '../assets/art/npc-rinaldo.png';
import npcTrovus from '../assets/art/npc-trovus.png';
import npcNaerthSkath from '../assets/art/npc-naerth-skath.png';

export type SceneCat = 'pixel' | 'location' | 'map' | 'monster' | 'npc';

export interface TvScene { id: string; name: string; url: string; cat: SceneCat }

export const SCENE_CATS: { id: SceneCat; label: string }[] = [
  { id: 'pixel', label: '✨ Pixel' },
  { id: 'location', label: '🏔 Locations' },
  { id: 'map', label: '🗺 Maps' },
  { id: 'monster', label: '👹 Monsters' },
  { id: 'npc', label: '🎭 NPCs' },
];

export const SCENES: TvScene[] = [
  // pixel — the idle moods
  { id: 'town', name: 'Ten-Towns', url: town, cat: 'pixel' },
  { id: 'tavern', name: 'Tavern', url: tavern, cat: 'pixel' },
  { id: 'road', name: 'On the road', url: road, cat: 'pixel' },
  { id: 'lake', name: 'Frozen lake', url: lake, cat: 'pixel' },
  { id: 'camp', name: 'Camp', url: camp, cat: 'pixel' },
  { id: 'peak', name: "Kelvin's Cairn", url: peak, cat: 'pixel' },
  { id: 'cave', name: 'Ice cave', url: cave, cat: 'pixel' },
  { id: 'forge', name: 'The forge', url: forge, cat: 'pixel' },
  { id: 'aurora', name: 'Aurora', url: aurora, cat: 'pixel' },
  { id: 'blizzard', name: 'Blizzard', url: blizzard, cat: 'pixel' },

  // locations — mood-setting module art
  { id: 'loc-the-caer', name: 'The Caer', url: locTheCaer, cat: 'location' },
  { id: 'loc-easthaven-aurora', name: 'Aurora over Easthaven', url: locEasthavenAurora, cat: 'location' },
  { id: 'loc-easthaven-pyre', name: 'The pyre at Easthaven', url: locEasthavenPyre, cat: 'location' },
  { id: 'loc-giant-lodge', name: 'Frost giant lodge', url: locGiantLodge, cat: 'location' },
  { id: 'loc-verbeeg-lair', name: 'Verbeeg lair', url: locVerbeegLair, cat: 'location' },
  { id: 'loc-karkolohk', name: 'Karkolohk', url: locKarkolohk, cat: 'location' },
  { id: 'loc-blue-boots', name: "Blue Boots' rest", url: locBlueBoots, cat: 'location' },

  // maps — where the party is
  { id: 'map-bremen', name: 'Bremen', url: mapBremen, cat: 'map' },
  { id: 'map-bryn-shander', name: 'Bryn Shander', url: mapBrynShander, cat: 'map' },
  { id: 'map-caer-dineval', name: 'Caer-Dineval', url: mapCaerDineval, cat: 'map' },
  { id: 'map-caer-konig', name: 'Caer-Konig', url: mapCaerKonig, cat: 'map' },
  { id: 'map-dougans-hole', name: "Dougan's Hole", url: mapDougansHole, cat: 'map' },
  { id: 'map-easthaven', name: 'Easthaven', url: mapEasthaven, cat: 'map' },
  { id: 'map-good-mead', name: 'Good Mead', url: mapGoodMead, cat: 'map' },
  { id: 'map-lonelywood', name: 'Lonelywood', url: mapLonelywood, cat: 'map' },
  { id: 'map-targos', name: 'Targos', url: mapTargos, cat: 'map' },
  { id: 'map-termalaine', name: 'Termalaine', url: mapTermalaine, cat: 'map' },

  // monsters — what stands before them
  { id: 'mon-axe-beak', name: 'Axe beak', url: monAxeBeak, cat: 'monster' },
  { id: 'mon-wolf', name: 'Wolf', url: monWolf, cat: 'monster' },
  { id: 'mon-snowy-owlbear', name: 'Snowy owlbear', url: monSnowyOwlbear, cat: 'monster' },
  { id: 'mon-yeti', name: 'Yeti', url: monYeti, cat: 'monster' },
  { id: 'mon-crag-cat', name: 'Crag cat', url: monCragCat, cat: 'monster' },
  { id: 'mon-plesiosaurus', name: 'Monster of Maer Dualdon', url: monPlesiosaurus, cat: 'monster' },
  { id: 'mon-winter-wolves', name: 'Koran & Kanan', url: monWinterWolves, cat: 'monster' },
  { id: 'mon-white-moose', name: 'The White Moose', url: monWhiteMoose, cat: 'monster' },
  { id: 'mon-reindeer', name: 'Reindeer herd', url: monReindeer, cat: 'monster' },
  { id: 'mon-duergar', name: 'Duergar', url: monDuergar, cat: 'monster' },
  { id: 'mon-mind-master', name: 'Duergar mind master', url: monMindMaster, cat: 'monster' },
  { id: 'mon-frost-giant', name: 'Frost giant outrider', url: monFrostGiant, cat: 'monster' },
  { id: 'mon-chwinga', name: 'Chwinga', url: monChwinga, cat: 'monster' },

  // NPCs — who they're talking to
  { id: 'npc-sephek', name: 'Sephek Kaltro', url: npcSephek, cat: 'npc' },
  { id: 'npc-ravisin', name: 'Ravisin', url: npcRavisin, cat: 'npc' },
  { id: 'npc-maud', name: 'Maud Chiselbone', url: npcMaud, cat: 'npc' },
  { id: 'npc-rinaldo', name: "Rinaldo's séance", url: npcRinaldo, cat: 'npc' },
  { id: 'npc-trovus', name: 'Trovus', url: npcTrovus, cat: 'npc' },
  { id: 'npc-naerth-skath', name: 'Naerth & Skath', url: npcNaerthSkath, cat: 'npc' },
];

const BY_ID = new Map(SCENES.map((s) => [s.id, s]));

export function sceneById(id: string): TvScene | undefined {
  return BY_ID.get(id);
}

/** Resolve a sceneId (possibly 'auto') into concrete art.
 *  Auto only ever lands on pixel scenes — module art is always a
 *  deliberate DM choice, never an accidental reveal. */
export function resolveScene(
  sceneId: string,
  ctx: { journeying: boolean; weatherId: string },
): TvScene {
  if (sceneId !== 'auto' && BY_ID.has(sceneId)) return BY_ID.get(sceneId)!;
  if (ctx.weatherId === 'blizzard' || ctx.weatherId === 'magical_storm') return BY_ID.get('blizzard')!;
  if (ctx.journeying) return BY_ID.get('road')!;
  return BY_ID.get('town')!;
}
