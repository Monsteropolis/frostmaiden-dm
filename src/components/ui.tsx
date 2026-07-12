// Shared UI primitives. No native dialogs anywhere — sheets and
// inline confirms only, per the table-safety requirement.

import { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useState, useEffect, useRef } from 'preact/hooks';
import { lastRoll } from '../lib/dice';

// --- Bottom sheet ---------------------------------------------------------

export function Sheet({ open, title, onClose, children, center = false }: {
  open: boolean; title: string; onClose: () => void; children: ComponentChildren;
  /** On tablets/desktop (≥768px) render as a centered modal; still a bottom sheet on phones. */
  center?: boolean;
}) {
  if (!open) return null;
  return createPortal(
    <div class={`sheet-scrim${center ? ' center' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-label={title}>
        <div class="sheet-head">
          <div class="sheet-grip" />
          <h2>{title}</h2>
          <button class="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// --- Two-tap confirm (destructive actions) ---------------------------------

export function ConfirmBtn({ label, confirmLabel = 'Confirm?', onConfirm, class: cls = '' }: {
  label: string; confirmLabel?: string; onConfirm: () => void; class?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      class={`btn ${cls} ${armed ? 'armed' : ''}`}
      onClick={() => {
        if (armed) { clearTimeout(timer.current); setArmed(false); onConfirm(); }
        else { setArmed(true); timer.current = window.setTimeout(() => setArmed(false), 2500); }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

// --- Roll toast --------------------------------------------------------------

export function RollToast() {
  const r = lastRoll.value;
  if (!r) return null;
  return createPortal(
    <div class={`roll-toast${r.crit === 'hit' ? ' crit' : ''}${r.crit === 'miss' ? ' fumble' : ''}`}
         onClick={() => (lastRoll.value = null)} role="status">
      <span class="rt-title">{r.title}</span>
      <span class="rt-total">{r.total}</span>
      <span class="rt-detail">{r.detail}</span>
    </div>,
    document.body
  );
}

// --- Form helpers --------------------------------------------------------------

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
    </label>
  );
}

export function NumInput({ value, onInput, min, max, w }: {
  value: number; onInput: (n: number) => void; min?: number; max?: number; w?: string;
}) {
  return (
    <input
      class="input num"
      style={w ? { width: w } : {}}
      type="number"
      inputMode="numeric"
      value={value}
      min={min}
      max={max}
      onInput={(e) => onInput(parseInt((e.target as HTMLInputElement).value, 10) || 0)}
    />
  );
}


// --- Stepper ----------------------------------------------------------------
// One control paradigm for every counter (rations, party, gold): matched
// button sizes, tabular-nums value, aligned baselines. `steps` renders a
// segmented row — [1] → [−1][ value ][+1]; [10,1] → [−10][−1][ value ][+1][+10].

export function Stepper({ label, value, onDelta, low = false, steps = [1] }: {
  label: string; value: number; onDelta: (delta: number) => void; low?: boolean; steps?: number[];
}) {
  const minus = steps;                 // largest-magnitude first on the minus side
  const plus = [...steps].reverse();   // …and last on the plus side
  return (
    <div class="stepper">
      <span class="stepper-label">{label}</span>
      <div class="stepper-ctl">
        {minus.map((s) => <button class="stepper-btn" onClick={() => onDelta(-s)} aria-label={`${label} minus ${s}`}>−{s}</button>)}
        <span class={`stepper-val${low ? ' low' : ''}`}>{value}</span>
        {plus.map((s) => <button class="stepper-btn" onClick={() => onDelta(s)} aria-label={`${label} plus ${s}`}>+{s}</button>)}
      </div>
    </div>
  );
}

// --- Collapsible condition editor -------------------------------------------
// Active conditions show as removable tags; the full grid stays hidden
// behind "+ Condition" so cards stay compact when nothing's in play.

import { CONDITIONS } from '../state/schema';

export function CondEditor({ current, onToggle }: { current: string[]; onToggle: (c: string) => void }) {
  const [pick, setPick] = useState(false);
  return (
    <div class="cond-editor">
      <div class="cond-active">
        {current.map((c) => (
          <button class="cond-tag rm" onClick={() => onToggle(c)} aria-label={`Remove ${c}`}>{c} ✕</button>
        ))}
        <button class="cond-add" onClick={() => setPick(!pick)}>{pick ? '− Hide' : '+ Condition'}</button>
      </div>
      {pick && (
        <div class="cond-grid" style={{ marginTop: '8px' }}>
          {CONDITIONS.filter((c) => !current.includes(c)).map((c) => (
            <button class="cond-chip" onClick={() => { onToggle(c); setPick(false); }}>{c}</button>
          ))}
        </div>
      )}
    </div>
  );
}
