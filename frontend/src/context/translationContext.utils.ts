import { createContext, useContext } from 'react';
import { ConversationItem } from '../hooks/useConversationManager';

export interface TranslationContextType {
  // Session state
  sessionStarted: boolean;
  showEndSessionConfirm: boolean;
  
  // Session actions
  startSession: () => void;
  handleStopSession: () => void;
  cancelEndSession: () => void;
  confirmEndSession: () => void;
  
  // Language and settings
  mainLanguage: string;
  setMainLanguage: (value: string) => void;
  otherLanguage: string;
  setOtherLanguage: (value: string) => void;
  isPremium: boolean;
  setIsPremium: (value: boolean) => void;
  swapLanguages: () => void;
  
  // Recording and translation state
  isRecording: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  
  // Audio content
  lastTranslation: string;
  lastAudioUrl: string | null;
  
  // Conversation data
  conversation: ConversationItem[];
  
  // UI state
  error: string | null;
  status: string;
  silenceCountdown: number | null;
  isCountingDown: boolean;
  countdown: number | null;
  
  // Audio visualization
  analyserNode: AnalyserNode | null;
  
  // Actions
  stopRecording: () => Promise<void>;
  cleanup: () => void;  handlePause: () => void;
  handleUnpause: () => void;
}

export const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const useTranslationContext = () => {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    throw new Error('useTranslationContext must be used within a TranslationProvider');
  }
  return context;
};
