import { createContext, useContext } from 'react';
import type { TranslationResponse } from '../services/TranslationService';

export interface TranslationContextType {
  targetWord: string;
  setTargetWord: (value: string) => void;
  mainLanguage: string;
  setMainLanguage: (value: string) => void;
  otherLanguage: string;
  setOtherLanguage: (value: string) => void;
  error: string | null;
  setError: (value: string | null) => void;
  status: string;
  setStatus: (value: string) => void;
  silenceCountdown: number | null;
  setSilenceCountdown: (value: number | null) => void;
  isListening: boolean;
  setIsListening: (value: boolean) => void;
  isRecording: boolean;
  setIsRecording: (value: boolean) => void;
  isPlaying: boolean;
  setIsPlaying: (value: boolean) => void;
  isProcessingStop: boolean;
  setIsProcessingStop: (value: boolean) => void;
  translation: string;
  setTranslation: (value: string) => void;
  audioUrl: string | null;
  setAudioUrl: (value: string | null) => void;
  conversation: Array<{ text: string; language: string; speaker: string; timestamp: string }>;
  setConversation: React.Dispatch<React.SetStateAction<Array<{ text: string; language: string; speaker: string; timestamp: string }>>>;
  showEndSessionConfirm: boolean;
  setShowEndSessionConfirm: (value: boolean) => void;
  triggerRecording: () => Promise<void>;  stopRecording: () => Promise<TranslationResponse | undefined>;
  sessionStarted: boolean;
  setSessionStarted: (value: boolean) => void;
  sessionId: string | null;
  setSessionId: (value: string | null) => void;
  startListening: () => void;
  cleanup: () => void;
  lastTranslation: string;
  lastAudioUrl: string | null;
}

export const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const useTranslationContext = () => {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    throw new Error('useTranslationContext must be used within a TranslationProvider');
  }
  return context;
};
