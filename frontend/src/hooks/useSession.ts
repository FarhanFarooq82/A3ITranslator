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
    
    // Save session to local storage
    sessionService.saveSession(id);
    
    // Update state
    dispatch({
      type: ActionType.START_SESSION,
      id,
      expiry
    });
  }, [dispatch, sessionService]);

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
      dispatch({
        type: ActionType.START_SESSION,
        id: session.id,
        expiry: session.expiry,
      });
    }
  }, [dispatch, sessionService]); // Set up periodic session validation check
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
