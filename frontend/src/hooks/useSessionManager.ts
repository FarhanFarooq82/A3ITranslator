import { useState, useCallback, useEffect, useMemo } from 'react';
import { SessionService } from '../services/SessionService';

export interface Session {
  id: string;
  expiry: number;
  startedAt: string;
}

export interface SessionState {
  sessionStarted: boolean;
  sessionId: string | null;
  sessionExpiry: number | null;
  showEndSessionConfirm: boolean;
}

export interface SessionManager {
  // State
  sessionStarted: boolean;
  sessionId: string | null;
  sessionExpiry: number | null;
  showEndSessionConfirm: boolean;

  // Actions
  startSession: () => void;
  endSession: () => void;
  showEndConfirmation: () => void;
  cancelEndConfirmation: () => void;
  confirmEndSession: () => void;
}

/**
 * Hook for managing application session lifecycle
 * @param onSessionEnd Callback to run when a session is ended
 * @returns Session manager functions and state
 */
export const useSessionManager = (onSessionEnd?: () => void): SessionManager => {
  // Initialize the session service - memoize to prevent recreation on each render
  const sessionService = useMemo(() => new SessionService(), []);
  
  // Session state
  const [sessionState, setSessionState] = useState<SessionState>({
    sessionStarted: false,
    sessionId: null,
    sessionExpiry: null,
    showEndSessionConfirm: false
  });

  // Actions
  const startSession = useCallback(() => {
    const id = sessionService.generateSessionId();
    const expiry = Date.now() + sessionService.getSessionDuration();
    
    // Save session to local storage
    sessionService.saveSession(id);
    
    // Update state
    setSessionState(prev => ({
      ...prev,
      sessionStarted: true,
      sessionId: id,
      sessionExpiry: expiry
    }));
  }, [sessionService]);

  const endSession = useCallback(() => {
    // Clear session data
    sessionService.clearSession();
    
    // Update state
    setSessionState({
      sessionStarted: false,
      sessionId: null,
      sessionExpiry: null,
      showEndSessionConfirm: false
    });
    
    // Execute cleanup callback if provided
    if (onSessionEnd) {
      onSessionEnd();
    }
  }, [sessionService, onSessionEnd]);

  const showEndConfirmation = useCallback(() => {
    setSessionState(prev => ({
      ...prev,
      showEndSessionConfirm: true
    }));
  }, []);

  const cancelEndConfirmation = useCallback(() => {
    setSessionState(prev => ({
      ...prev,
      showEndSessionConfirm: false
    }));
  }, []);
  const confirmEndSession = useCallback(() => {
    endSession();
  }, [endSession]);
  
  // Restore session on mount
  useEffect(() => {
    const session = sessionService.loadSession();
    if (session && sessionService.isValidSession(session)) {
      setSessionState(prev => ({
        ...prev,
        sessionStarted: true,
        sessionId: session.id,
        sessionExpiry: session.expiry
      }));
    }
  }, [sessionService]); // It's safe to include memoized sessionService// Set up periodic session validation check
  useEffect(() => {
    if (!sessionState.sessionStarted) return;
    
    // Check session validity every minute
    const validityTimer = setInterval(() => {
      const session = sessionService.loadSession();
      if (!session || !sessionService.isValidSession(session)) {
        endSession();
      }
    }, 60000);
    
    return () => clearInterval(validityTimer);
  }, [sessionState.sessionStarted, endSession, sessionService]); // Include all dependencies

  return {
    // State
    sessionStarted: sessionState.sessionStarted,
    sessionId: sessionState.sessionId,
    sessionExpiry: sessionState.sessionExpiry,
    showEndSessionConfirm: sessionState.showEndSessionConfirm,
    
    // Actions
    startSession,
    endSession,
    showEndConfirmation,
    cancelEndConfirmation,
    confirmEndSession
  };
};
