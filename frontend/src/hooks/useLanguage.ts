import { useCallback } from 'react';
import { ActionType } from '../context/AppStateContext';
import { useAppState } from './useAppState';


/**
 * Hook for managing language settings in the application
 * @returns Language state and actions
 */
export const useLanguage = () => {
  const { state, dispatch } = useAppState();

  const setMainLanguage = useCallback((language: string) => {
    dispatch({ 
      type: ActionType.SET_MAIN_LANGUAGE, 
      language 
    });
  }, [dispatch]);

  const setOtherLanguage = useCallback((language: string) => {
    dispatch({ 
      type: ActionType.SET_OTHER_LANGUAGE, 
      language 
    });
  }, [dispatch]);

  const setPremium = useCallback((isPremium: boolean) => {
    dispatch({ 
      type: ActionType.SET_PREMIUM, 
      isPremium 
    });
  }, [dispatch]);

  const swapLanguages = useCallback(() => {
    dispatch({ type: ActionType.SWAP_LANGUAGES });
  }, [dispatch]);

  return {
    mainLanguage: state.mainLanguage,
    otherLanguage: state.otherLanguage,
    isPremium: state.isPremium,
    setMainLanguage,
    setOtherLanguage,
    setPremium,
    swapLanguages
  };
};
