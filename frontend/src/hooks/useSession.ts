import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionType, SessionState } from '../context/AppStateContext';
import { useAppState } from './useAppState';
import { SessionService } from '../services/SessionService';

/**
 * Hook for managing application session lifecycle using the central app state
 * @returns Session state and actions
 */
export const useSession = () => {
  const { state, dispatch } = useAppState();
  const sessionService = useMemo(() => new SessionService(), []);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // Actions
  const startSession = useCallback(async () => {
    // Prevent duplicate session creation
    if (isCreatingSession) {
      console.log('Session creation already in progress, skipping duplicate call');
      return;
    }
    
    if (state.sessionState === SessionState.ACTIVE) {
      console.log('Session already active, skipping duplicate creation');
      return;
    }
    
    setIsCreatingSession(true);
    try {
      console.log('Creating new session...');
      // Call backend to create session
      const backendSession = await sessionService.createSessionOnBackend(
        state.mainLanguage,
        state.otherLanguage,
        state.isPremium
      );
      
      if (!backendSession.success) {
        throw new Error(backendSession.message || 'Session creation failed');
      }
      
      const sessionId = backendSession.sessionId;
      const expiry = new Date(backendSession.expiresAt).getTime();
      
      // Save session to local storage with additional data
      sessionService.saveSession(sessionId, expiry, {
        mainLanguage: state.mainLanguage,
        otherLanguage: state.otherLanguage,
        isPremium: state.isPremium,
        sessionState: SessionState.ACTIVE
      });
      
      // Update state
      dispatch({
        type: ActionType.START_SESSION,
        id: sessionId,
        expiry
      });
      
      console.log('Session created successfully:', sessionId);
    } catch (error) {
      console.error('Failed to start session:', error);
      // Optionally dispatch an error action or show notification
    } finally {
      setIsCreatingSession(false);
    }
  }, [dispatch, sessionService, state.mainLanguage, state.otherLanguage, state.isPremium, state.sessionState, isCreatingSession]);

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
