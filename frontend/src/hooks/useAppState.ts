import { useContext } from 'react';
import { AppStateContext } from '../context/context';

/**
 * Custom hook to use the app state context
 */
export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}
