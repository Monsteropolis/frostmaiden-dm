import { Signal } from '@preact/signals';

export type TabId = 'session' | 'combat' | 'world' | 'party' | 'compendium';

const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round' as const, 'stroke-linejoin': 'round' as const };

const ICONS: Record<TabId, preact.JSX.Element> = {
  session: ( // open book
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 5.5C10 4 7 3.5 4 4v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4c-3-.5-6 0-8 1.5z" />
      <path d="M12 5.5v14" />
    </svg>
  ),
  combat: ( // crossed swords
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 4l11 11M4 4v3.5M4 4h3.5M20 4L9 15M20 4v3.5M20 4h-3.5" />
      <path d="M7 17l-3 3M17 17l3 3M6.5 14.5l3 3M17.5 14.5l-3 3" />
    </svg>
  ),
  world: ( // mountains under a star
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M2.5 19h19M4 19l5-9 3 5M9.5 19l5.5-8 5 8" />
      <path d="M12 4.2l.55 1.25L13.8 6l-1.25.55L12 7.8l-.55-1.25L10.2 6l1.25-.55z" />
    </svg>
  ),
  party: ( // two figures
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.5-3.5 2.8-5 5.5-5s5 1.5 5.5 5" />
      <circle cx="16.5" cy="9.5" r="2.4" />
      <path d="M15.5 14.3c2.8.2 4.6 1.7 5 4.7" />
    </svg>
  ),
  compendium: ( // stacked tomes
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M5 4h11a2 2 0 012 2v12a2 2 0 01-2 2H5z" />
      <path d="M5 4a2 2 0 00-2 2v12a2 2 0 002 2M8 8h6M8 11.5h6" />
    </svg>
  ),
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'session', label: 'Session' },
  { id: 'combat', label: 'Combat' },
  { id: 'world', label: 'World' },
  { id: 'party', label: 'Party' },
  { id: 'compendium', label: 'Lore' },
];

export function BottomNav({ tab }: { tab: Signal<TabId> }) {
  return (
    <nav class="bottom-nav" aria-label="Main">
      {TABS.map((t) => (
        <button
          class={`nav-btn${tab.value === t.id ? ' active' : ''}`}
          aria-current={tab.value === t.id ? 'page' : undefined}
          onClick={() => (tab.value = t.id)}
        >
          {ICONS[t.id]}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
