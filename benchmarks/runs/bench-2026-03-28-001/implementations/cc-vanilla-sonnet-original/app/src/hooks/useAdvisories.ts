import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fetchAllAdvisories } from '../api/gtfsRealtime';

export function useAdvisories() {
  const { state, dispatch } = useApp();

  const refresh = useCallback(async () => {
    if (!state.apiKey) return;
    try {
      const advisories = await fetchAllAdvisories(state.apiKey);
      dispatch({ type: 'SET_ADVISORIES', advisories });
    } catch (err) {
      console.error('Advisory fetch failed:', err);
    }
  }, [state.apiKey, dispatch]);

  return { refresh };
}
