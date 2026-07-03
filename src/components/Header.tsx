import { useState } from 'preact/hooks';
import { state } from '../state/store';
import { WEATHER } from '../state/schema';
import { Sheet } from './ui';
import { WeatherControls } from '../screens/world';

export function Header() {
  const wx = WEATHER[state.value.weather.current];
  const day = state.value.weather.day;
  const [open, setOpen] = useState(false);

  return (
    <header class="header">
      <div class="header-row">
        <div class="wordmark">
          <span class="star-mark">✦</span>
          <span>Frostmaiden</span>
          <span class="sub">DM</span>
        </div>
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
          <WeatherControls />
        </Sheet>
      )}
    </header>
  );
}
