import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { WeatherPanel } from './components/WeatherPanel';
import { TransportPanel } from './components/TransportPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { OnboardingPrompt } from './components/shared/OnboardingPrompt';

function AppInner() {
  const { state } = useApp();
  const hasConfig = Boolean(state.location && state.stop);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Header />
      <main className="flex-1 p-4">
        {!hasConfig ? (
          <OnboardingPrompt />
        ) : (
          <div className="flex flex-col md:flex-row gap-4">
            <WeatherPanel />
            <TransportPanel />
          </div>
        )}
      </main>
      <SettingsPanel />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
