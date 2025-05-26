import { useCallback, useRef, useEffect } from 'react';
import { useTranslationContext } from '../context/translationContext.utils';
import { SessionService } from '../services/SessionService';

export const useSession = () => {
  const {
    setSessionStarted,
    setSessionId,
    setIsListening,
    setStatus,
    setShowEndSessionConfirm,
    cleanup,
  } = useTranslationContext();

  const sessionServiceRef = useRef<SessionService>(new SessionService());

  const startSession = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    const id = sessionServiceRef.current.generateSessionId();
    sessionServiceRef.current.saveSession(id);
    setSessionId(id);
    setSessionStarted(true);
    setIsListening(true); // Start listening immediately when session starts
    setStatus('Listening for trigger word...');
  }, [setSessionId, setSessionStarted, setIsListening, setStatus]);

  const confirmEndSession = useCallback(() => {
    setSessionStarted(false);
    setSessionId(null);
    sessionServiceRef.current.clearSession();
    setShowEndSessionConfirm(false);
    cleanup(); // Call the cleanup function to reset all state and release resources
  }, [cleanup, setSessionId, setSessionStarted, setShowEndSessionConfirm]);

  const handleStopSession = useCallback(() => {
    setShowEndSessionConfirm(true);
  }, [setShowEndSessionConfirm]);

  const cancelEndSession = useCallback(() => {
    setShowEndSessionConfirm(false);
  }, [setShowEndSessionConfirm]);

  // Restore session on mount
  useEffect(() => {
    const session = sessionServiceRef.current.loadSession();
    if (session && sessionServiceRef.current.isValidSession(session)) {
      setSessionId(session.id);
      setSessionStarted(true);
    }
  }, [setSessionId, setSessionStarted]);

  return {
    startSession,
    confirmEndSession,
    handleStopSession,
    cancelEndSession,
  };
};
