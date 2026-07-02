import { signal } from '@preact/signals';
import { Starfield } from './components/Starfield';
import { Header } from './components/Header';
import { BottomNav, TabId } from './components/BottomNav';
import { SessionScreen, CompendiumScreen } from './screens/screens';
import { WorldScreen } from './screens/world';
import { PartyScreen } from './screens/party';
import { CombatScreen } from './screens/combat';
import { RollToast } from './components/ui';
import { NpcPopup } from './screens/npcs';

const tab = signal<TabId>('world');

const SCREENS: Record<TabId, () => preact.JSX.Element> = {
  session: SessionScreen,
  combat: CombatScreen,
  world: WorldScreen,
  party: PartyScreen,
  compendium: CompendiumScreen,
};

export function App() {
  const Screen = SCREENS[tab.value];
  return (
    <>
      <div class="aurora" aria-hidden="true" />
      <Starfield />
      <Header />
      <main class="main">
        <Screen />
      </main>
      <NpcPopup />
      <RollToast />
      <BottomNav tab={tab} />
    </>
  );
}
