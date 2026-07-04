// ============================================================
// TV SCENES — the pixel-art location backdrops. One registry
// shared by the DM's picker (TvPanel) and the TV renderer.
// All art is original, painted in the app's token palette at
// 128×72 and upscaled with image-rendering: pixelated.
// 'auto' derives a scene from journey/weather so the TV always
// has something apt even if the DM never touches the picker.
// ============================================================

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

export interface TvScene { id: string; name: string; url: string }

export const SCENES: TvScene[] = [
  { id: 'town', name: 'Ten-Towns', url: town },
  { id: 'tavern', name: 'Tavern', url: tavern },
  { id: 'road', name: 'On the road', url: road },
  { id: 'lake', name: 'Frozen lake', url: lake },
  { id: 'camp', name: 'Camp', url: camp },
  { id: 'peak', name: "Kelvin's Cairn", url: peak },
  { id: 'cave', name: 'Ice cave', url: cave },
  { id: 'forge', name: 'The forge', url: forge },
  { id: 'aurora', name: 'Aurora', url: aurora },
  { id: 'blizzard', name: 'Blizzard', url: blizzard },
];

const BY_ID = new Map(SCENES.map((s) => [s.id, s]));

/** Resolve a sceneId (possibly 'auto') into concrete art. */
export function resolveScene(
  sceneId: string,
  ctx: { journeying: boolean; weatherId: string },
): TvScene {
  if (sceneId !== 'auto' && BY_ID.has(sceneId)) return BY_ID.get(sceneId)!;
  // auto: weather first, then travel state, then the default town
  if (ctx.weatherId === 'blizzard' || ctx.weatherId === 'magical_storm') return BY_ID.get('blizzard')!;
  if (ctx.journeying) return BY_ID.get('road')!;
  return BY_ID.get('town')!;
}
