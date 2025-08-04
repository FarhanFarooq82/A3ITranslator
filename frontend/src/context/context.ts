import { createContext } from 'react';
import { AppState } from '../types/StateManager';
import { Action } from './types';

// Create the context
export type AppStateContextType = {
  state: AppState;
  dispatch: React.Dispatch<Action>;
};

export const AppStateContext = createContext<AppStateContextType | undefined>(undefined);
