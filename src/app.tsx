import { signal } from '@preact/signals';
import { Starfield } from './components/Starfield';
import { Header } from './components/Header';
import { BottomNav, TabId } from './components/BottomNav';
import { SessionScreen, WorldScreen, CompendiumScreen } from './screens/screens';
import { PartyScreen } from './screens/party';
import { CombatScreen } from './screens/combat';
import { RollToast } from './components/ui';

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
      <RollToast />
      <BottomNav tab={tab} />
    </>
  );
}
