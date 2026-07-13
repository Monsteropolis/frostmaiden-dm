// ============================================================
// MAP PICKER — tap two points on the region map to plan a leg.
// First tap sets origin (A), second sets destination (B); tapping
// a pin snaps to it, tapping empty ground drops a crosshair point.
// The estimate box shows miles + days; the terrain chips are the
// DM's judgment about the route — the app doesn't pretend to know.
// Zoom is a simple 1×/2× toggle; the map pane scrolls.
// ============================================================

import { useMemo, useState } from 'preact/hooks';
import { state, patch } from '../state/store';
import { Sheet } from './ui';
import {
  MAP_URL, MAP_CAL, MAP_PLACES, MapPlace, Terrain, TERRAIN_LABEL,
  pxDistanceMiles, legDays,
} from '../data/map';
import { TOWN_DISTANCES } from '../data';
import { Pace } from '../state/schema';

export interface PickedPlace { name: string; x: number; y: number; kind: MapPlace['kind'] | 'point' }

/** All named, coordinated places: seeded gazetteer + the DM's pins. */
export function allPlaces(): PickedPlace[] {
  return [
    ...MAP_PLACES,
    ...state.value.mapPins.map((p) => ({ name: p.name, x: p.x, y: p.y, kind: 'custom' as const })),
  ];
}

export function placeByName(name: string): PickedPlace | undefined {
  return allPlaces().find((p) => p.name === name);
}

/** Module table lookup — road time between two towns, if the pair is mapped. */
export function tableDays(a: string, b: string): number | null {
  const row = (TOWN_DISTANCES as { from: string; to: string; days: number }[])
    .find((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
  return row ? row.days : null;
}

export interface LegEstimate {
  days: number;
  source: 'table' | 'overland';
  miles: number | null;
}

/** One estimator for the planner and the picker. Table wins for town pairs. */
export function estimateLeg(
  a: PickedPlace | undefined, b: PickedPlace | undefined,
  aName: string, bName: string, terrain: Terrain, paceMult: number,
): LegEstimate | null {
  const t = tableDays(aName, bName);
  if (t !== null) {
    return {
      days: Math.max(1, Math.ceil(t * paceMult)),
      source: 'table',
      miles: a && b ? +pxDistanceMiles(a, b).toFixed(1) : null,
    };
  }
  if (!a || !b) return null;
  const miles = pxDistanceMiles(a, b);
  return { days: legDays(miles, terrain, paceMult), source: 'overland', miles: +miles.toFixed(1) };
}

const KIND_CLASS: Record<string, string> = {
  town: 'town', landmark: 'landmark', custom: 'custom', point: 'point',
};

export function MapPicker({ initialA, initialB, terrain, paceMult, onUse, onClose }: {
  initialA?: PickedPlace; initialB?: PickedPlace;
  terrain: Terrain; paceMult: number; pace?: Pace;
  onUse: (a: PickedPlace, b: PickedPlace, terrain: Terrain) => void;
  onClose: () => void;
}) {
  const [a, setA] = useState<PickedPlace | null>(initialA ?? null);
  const [b, setB] = useState<PickedPlace | null>(initialB ?? null);
  const [terr, setTerr] = useState<Terrain>(terrain);
  const [zoom, setZoom] = useState<1 | 2>(1);
  const [savingFor, setSavingFor] = useState<'a' | 'b' | null>(null);
  const [pinName, setPinName] = useState('');

  const places = allPlaces();
  const est = useMemo(
    () => (a && b ? estimateLeg(a, b, a.name, b.name, terr, paceMult) : null),
    [a, b, terr, paceMult],
  );

  // A tap: near a pin (within ~14 native px) snaps; otherwise a crosshair point.
  const tap = (e: MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rc = el.getBoundingClientRect();
    const x = Math.round(((e.clientX - rc.left) / rc.width) * MAP_CAL.imgW);
    const y = Math.round(((e.clientY - rc.top) / rc.height) * MAP_CAL.imgH);
    const near = places
      .map((p) => ({ p, d: Math.hypot(p.x - x, p.y - y) }))
      .filter((c) => c.d <= 14)
      .sort((m, n) => m.d - n.d)[0]?.p;
    const picked: PickedPlace = near ?? { name: `Point (${x}, ${y})`, x, y, kind: 'point' };
    if (!a || (a && b)) { setA(picked); setB(null); }
    else setB(picked);
    setSavingFor(null);
  };

  const savePin = (which: 'a' | 'b') => {
    const pt = which === 'a' ? a : b;
    const name = pinName.trim();
    if (!pt || !name) return;
    patch((d) => { d.mapPins.push({ id: `pin${d.seq++}`, name, x: pt.x, y: pt.y, kind: 'custom' }); });
    const named: PickedPlace = { ...pt, name, kind: 'custom' };
    if (which === 'a') setA(named); else setB(named);
    setSavingFor(null); setPinName('');
  };

  const Endpoint = ({ label, pt, which }: { label: string; pt: PickedPlace | null; which: 'a' | 'b' }) => (
    <div class="mp-endpoint">
      <span class={`mp-dot ${pt ? KIND_CLASS[pt.kind] : ''}`}>{label}</span>
      <span class="mp-endpoint-name">{pt ? pt.name : label === 'A' ? 'Tap the map — origin' : 'Tap again — destination'}</span>
      {pt && pt.kind === 'point' && (
        savingFor === which
          ? (
            <span class="mp-savepin">
              <input class="input" placeholder="Pin name" value={pinName}
                onInput={(e) => setPinName((e.target as HTMLInputElement).value)} />
              <button class="btn mini primary" disabled={!pinName.trim()} onClick={() => savePin(which)}>Save</button>
            </span>
          )
          : <button class="btn mini ghost" onClick={() => { setSavingFor(which); setPinName(''); }}>Save as pin…</button>
      )}
    </div>
  );

  return (
    <Sheet open title="Pick a route on the map" onClose={onClose}>
      <div class="mp-toolbar">
        <button class={`cond-chip${zoom === 1 ? ' on' : ''}`} onClick={() => setZoom(1)}>1×</button>
        <button class={`cond-chip${zoom === 2 ? ' on' : ''}`} onClick={() => setZoom(2)}>2×</button>
        <span class="stat-fine" style={{ margin: 0 }}>Tap a dot to snap to it; tap open ground to drop a point.</span>
      </div>

      <div class="mp-scroll">
        <div class="mp-canvas" style={{ width: `${zoom * 100}%` }} onClick={tap as never}>
          <img src={MAP_URL} alt="Icewind Dale" class="mp-img" draggable={false} />
          <svg class="mp-overlay" viewBox={`0 0 ${MAP_CAL.imgW} ${MAP_CAL.imgH}`} preserveAspectRatio="none">
            {a && b && (
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="var(--thread)" stroke-width="3" stroke-dasharray="7 5" />
            )}
          </svg>
          {places.map((p) => (
            <span
              key={`${p.kind}:${p.name}`}
              class={`mp-pin ${KIND_CLASS[p.kind]}${(a?.name === p.name || b?.name === p.name) ? ' picked' : ''}`}
              style={{ left: `${(p.x / MAP_CAL.imgW) * 100}%`, top: `${(p.y / MAP_CAL.imgH) * 100}%` }}
              title={p.name}
            />
          ))}
          {[a, b].map((pt, i) => pt && pt.kind === 'point' && (
            <span key={i} class="mp-pin point picked"
              style={{ left: `${(pt.x / MAP_CAL.imgW) * 100}%`, top: `${(pt.y / MAP_CAL.imgH) * 100}%` }} />
          ))}
        </div>
      </div>

      <Endpoint label="A" pt={a} which="a" />
      <Endpoint label="B" pt={b} which="b" />

      {est && (
        <div class="mp-estimate">
          <div class="mp-est-days">
            <strong>{est.days} day{est.days > 1 ? 's' : ''}</strong>
            {est.miles !== null && <span class="mp-est-miles"> · {est.miles} mi straight-line</span>}
            <span class={`mp-est-src ${est.source}`}>{est.source === 'table' ? 'module road time' : 'overland estimate'}</span>
          </div>
          {est.source === 'overland' && (
            <div class="chip-row tight" style={{ marginTop: '6px' }}>
              {(Object.keys(TERRAIN_LABEL) as Terrain[]).map((t) => (
                <button key={t} class={`cond-chip${terr === t ? ' on' : ''}`} onClick={() => setTerr(t)}>{TERRAIN_LABEL[t]}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <button class="btn primary wide" style={{ marginTop: '10px' }} disabled={!a || !b}
        onClick={() => { if (a && b) { onUse(a, b, terr); onClose(); } }}>
        Use this route
      </button>
    </Sheet>
  );
}
