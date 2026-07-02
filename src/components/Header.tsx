import { state } from '../state/store';
import { WEATHER } from '../state/schema';

export function Header() {
  const wx = WEATHER[state.value.weather.current];
  const day = state.value.weather.day;

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
      <div class="weather-strip" role="status" aria-label={`Current weather: ${wx.name}`}>
        <span class="wx-icon" aria-hidden="true">{wx.icon}</span>
        <span class="wx-name">{wx.name}</span>
        {wx.conSave && (
          <span class="consave-badge" title={wx.conSaveNote}>
            ✦ CON save
          </span>
        )}
        <span class="wx-day">Day {day}</span>
      </div>
    </header>
  );
}
