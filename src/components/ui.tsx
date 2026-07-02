// Shared UI primitives. No native dialogs anywhere — sheets and
// inline confirms only, per the table-safety requirement.

import { ComponentChildren } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { lastRoll } from '../lib/dice';

// --- Bottom sheet ---------------------------------------------------------

export function Sheet({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ComponentChildren;
}) {
  if (!open) return null;
  return (
    <div class="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-label={title}>
        <div class="sheet-head">
          <div class="sheet-grip" />
          <h2>{title}</h2>
          <button class="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
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
  return (
    <div class={`roll-toast${r.crit === 'hit' ? ' crit' : ''}${r.crit === 'miss' ? ' fumble' : ''}`}
         onClick={() => (lastRoll.value = null)} role="status">
      <span class="rt-title">{r.title}</span>
      <span class="rt-total">{r.total}</span>
      <span class="rt-detail">{r.detail}</span>
    </div>
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
