import { useCallback, useEffect, useMemo } from 'react';
import { useAppState, ActionType, SessionState } from '../context/AppStateContext';
import { SessionService } from '../services/SessionService';

/**
 * Hook for managing application session lifecycle using the central app state
 * @returns Session state and actions
 */
export const useSession = () => {
  const { state, dispatch } = useAppState();
  const sessionService = useMemo(() => new SessionService(), []);

  // Actions
  const startSession = useCallback(() => {
    const id = sessionService.generateSessionId();
    const expiry = Date.now() + sessionService.getSessionDuration();
    
    // Save session to local storage with additional data
    sessionService.saveSession(id, {
      mainLanguage: state.mainLanguage,
      otherLanguage: state.otherLanguage,
      isPremium: state.isPremium,
      sessionState: SessionState.ACTIVE
    });
    
    // Update state
    dispatch({
      type: ActionType.START_SESSION,
      id,
      expiry
    });
  }, [dispatch, sessionService, state.mainLanguage, state.otherLanguage, state.isPremium]);

  const endSession = useCallback(() => {
    // Clear session data
    sessionService.clearSession();
    
    // Update state
    dispatch({ type: ActionType.CONFIRM_END_SESSION });
  }, [dispatch, sessionService]);

  const showEndConfirmation = useCallback(() => {
    dispatch({ type: ActionType.REQUEST_END_SESSION });
  }, [dispatch]);

  const cancelEndConfirmation = useCallback(() => {
    dispatch({ type: ActionType.CANCEL_END_SESSION });
  }, [dispatch]);

  const confirmEndSession = useCallback(() => {
    endSession();
  }, [endSession]);
    // Restore session on mount
  useEffect(() => {
    const session = sessionService.loadSession();
    if (session && sessionService.isValidSession(session)) {
      console.log('Restoring session from localStorage:', session);
      
      // Restore the session with all saved data
      dispatch({
        type: ActionType.RESTORE_SESSION,
        id: session.id,
        expiry: session.expiry,
        conversation: [],
        mainLanguage: (session.mainLanguage as string) || state.mainLanguage,
        otherLanguage: (session.otherLanguage as string) || state.otherLanguage,
        isPremium: (session.isPremium as boolean) || state.isPremium,
        sessionState: session.sessionState as SessionState || SessionState.ACTIVE
      });
    }
  }, [dispatch, sessionService, state.mainLanguage, state.otherLanguage, state.isPremium]); // Set up periodic session validation check
  useEffect(() => {
    if (state.sessionState !== SessionState.ACTIVE) return;
    
    // Check session validity every minute
    const validityTimer = setInterval(() => {
      const session = sessionService.loadSession();
      if (!session || !sessionService.isValidSession(session)) {
        endSession();
      }
    }, 60000);
    
    return () => clearInterval(validityTimer);
  }, [state.sessionState, endSession, sessionService]); 
  return {
    // State
    sessionStarted: state.sessionState === SessionState.ACTIVE,
    sessionId: state.sessionId,
    sessionExpiry: state.sessionExpiry,
    showEndSessionConfirm: state.sessionState === SessionState.ENDING_CONFIRMATION,
    
    // Actions
    startSession,
    endSession,
    showEndConfirmation,
    cancelEndConfirmation,
    confirmEndSession
  };
};
