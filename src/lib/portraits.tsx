// ============================================================
// NPC PORTRAITS — pixel-art chips for the 17 built-in NPCs.
// One atlas (17 × 28×56 cells); PORTRAIT_IDX maps npc id → cell.
// <NpcFace> renders the portrait when one exists, otherwise the
// emoji — so custom NPCs keep working with zero changes.
// Atlas order is load-bearing: matches scripts that built it.
// ============================================================

import atlasUrl from '../assets/npc-portraits.png';

const CELL_W = 28;

const PORTRAIT_IDX: Record<string, number> = {
  ds: 0, ms: 1, ha: 2, so: 3, sc: 4, nm: 5, vh: 6, dz: 7, dw: 8,
  ri: 9, cm: 10, tr: 11, ag: 12, nh: 13, xs: 14, au: 15, sk2: 16,
};

export function hasPortrait(id: string): boolean {
  return id in PORTRAIT_IDX;
}

export function NpcFace({ id, emoji }: { id: string; emoji: string }) {
  const idx = PORTRAIT_IDX[id];
  if (idx === undefined) return <span class="entity-emoji">{emoji}</span>;
  return (
    <span
      class="npc-portrait"
      aria-hidden="true"
      style={{
        backgroundImage: `url(${atlasUrl})`,
        backgroundPosition: `${-idx * CELL_W}px 0`,
      }}
    />
  );
}
