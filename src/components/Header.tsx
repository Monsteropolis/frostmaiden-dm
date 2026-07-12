import { useState } from 'preact/hooks';
import { state } from '../state/store';
import { WEATHER } from '../state/schema';
import { Sheet } from './ui';
import { worldSub } from '../screens/world';
import { tab } from '../app';
import { TvPanel, tvPipClass } from './TvPanel';

export function Header() {
  const wx = WEATHER[state.value.weather.current];
  const day = state.value.weather.day;
  const [open, setOpen] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);

  return (
    <header class="header">
      <div class="header-row">
        <div class="wordmark">
          <span class="star-mark">✦</span>
          <span>Frostmaiden</span>
          <span class="sub">DM</span>
        </div>
        <button class="tv-btn tappable" aria-label="Player TV View" onClick={() => setTvOpen(true)}>
          <span aria-hidden="true">📺</span>
          <span class={tvPipClass()} aria-hidden="true" />
        </button>
      </div>
      <div class="thread-rule" />
      <div class="weather-strip tappable" role="button" tabIndex={0}
           aria-label={`Current weather: ${wx.name}. Tap to change.`}
           onClick={() => setOpen(true)}>
        <span class="wx-icon" aria-hidden="true">{wx.icon}</span>
        <span class="wx-name">{wx.name}</span>
        {wx.conSave && (
          <span class="consave-badge" title={wx.conSaveNote}>
            ✦ CON save
          </span>
        )}
        <span class="wx-day">Day {day} ›</span>
      </div>
      {open && (
        <Sheet open title="The sky over Icewind Dale" onClose={() => setOpen(false)}>
          <div class="wx-readout">
            <span class="wx-readout-icon" aria-hidden="true">{wx.icon}</span>
            <div>
              <div class="wx-readout-name">{wx.name}</div>
              <div class="wx-readout-day">Day {day} in Icewind Dale</div>
            </div>
          </div>
          {wx.conSave && (
            <p class="read" style={{ color: 'var(--thread)' }}>{wx.conSaveNote}</p>
          )}
          <button
            class="btn primary wide"
            onClick={() => { tab.value = 'world'; worldSub.value = 'weather'; setOpen(false); }}
          >Set on World ▸ Weather</button>
        </Sheet>
      )}
      {tvOpen && <TvPanel onClose={() => setTvOpen(false)} />}
    </header>
  );
}
