import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { SavedLocation, SavedStop } from '../types';
import { getLocation, setLocation as persistLocation, getStop, setStop as persistStop } from '../utils/localStorage';

interface AppContextValue {
  location: SavedLocation | null;
  setLocation: (loc: SavedLocation) => void;
  stop: SavedStop | null;
  setStop: (stop: SavedStop) => void;
  lastUpdated: Date | null;
  setLastUpdated: (d: Date) => void;
  refreshKey: number;
  triggerRefresh: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] = useState<SavedLocation | null>(getLocation);
  const [stop, setStopState] = useState<SavedStop | null>(getStop);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function setLocation(loc: SavedLocation) {
    persistLocation(loc);
    setLocationState(loc);
  }

  function setStop(stop: SavedStop) {
    persistStop(stop);
    setStopState(stop);
  }

  const triggerRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <AppContext.Provider value={{
      location, setLocation,
      stop, setStop,
      lastUpdated, setLastUpdated,
      refreshKey, triggerRefresh,
      settingsOpen, setSettingsOpen,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
