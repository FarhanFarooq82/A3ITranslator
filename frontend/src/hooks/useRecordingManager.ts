import { useState, useRef, useCallback, useMemo } from 'react';
import { AudioRecordingManager, RecordingCallbacks } from '../services/AudioRecordingManager';
import { TranslationService } from '../services/TranslationService';
import { PlaybackManager } from '../services/PlaybackManager';
import type { TranslationResponse } from '../services/TranslationService';

// Re-export the RecordingCallbacks type for convenience
export type { RecordingCallbacks };

export interface RecordingState {
  isRecording: boolean;
  isPlaying: boolean;
  isProcessing: boolean;
  isPaused: boolean;
  audioUrl: string | null;
  translation: string;
  lastTranslation: string;
  lastAudioUrl: string | null;
  analyserNode: AnalyserNode | null;
}

const initialState: RecordingState = {
  isRecording: false,
  isPlaying: false,
  isProcessing: false,
  isPaused: false,
  audioUrl: null,
  translation: '',
  lastTranslation: '',
  lastAudioUrl: null,
  analyserNode: null
};

export interface RecordingManager {
  // State
  isRecording: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isProcessingStop: boolean;
  audioUrl: string | null;
  translation: string;
  lastTranslation: string;
  lastAudioUrl: string | null;
  analyserNode: AnalyserNode | null;
  
  // Actions
  startRecording: (callbacks: RecordingCallbacks) => Promise<void>;
  stopRecording: (
    mainLanguage: string,
    otherLanguage: string,
    isPremium: boolean
  ) => Promise<TranslationResponse | undefined>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  playTranslation: (audioBlob: Blob, onComplete?: () => void) => string;
  stopPlayback: () => void;
  cleanup: () => void;
}

/**
 * Hook for managing audio recording, playback, and translation
 * @returns Recording state and actions
 */
export const useRecordingManager = (): RecordingManager => {
  // Initialize services as refs so they persist across renders
  const audioManager = useRef(new AudioRecordingManager());
  const translationService = useRef(new TranslationService());
  const playbackManager = useRef(new PlaybackManager());
  
  // State management
  const [state, setState] = useState<RecordingState>(initialState);

  // Start recording with silence detection
  const startRecording = useCallback(async (callbacks: RecordingCallbacks) => {
    try {
      // Update state to indicate recording has started
      setState(prev => ({ 
        ...prev, 
        isRecording: true,
        translation: '',
        audioUrl: null
      }));
      
      // Start recording and get the analyzer node
      const analyserNode = await audioManager.current.startRecording(callbacks);
      
      // Update state with the analyzer node
      setState(prev => ({
        ...prev,
        analyserNode: analyserNode
      }));
    } catch (error) {
      // Reset recording state on error
      setState(prev => ({ ...prev, isRecording: false, analyserNode: null }));
      throw error;
    }
  }, []);

  // Stop recording and process audio
  const stopRecording = useCallback(async (
    mainLanguage: string,
    otherLanguage: string,
    isPremium: boolean
  ): Promise<TranslationResponse | undefined> => {
    try {
      setState(prev => ({ ...prev, isProcessing: true }));
      
      // Get audio blob from recording manager
      const audioBlob = await audioManager.current.stopRecording();
      
      if (!audioBlob) {
        setState(prev => ({ ...prev, isProcessing: false, isRecording: false }));
        return undefined;
      }
      
      try {
        // Send audio to translation service
        const response = await translationService.current.sendAudioForTranslation(
          audioBlob,
          mainLanguage,
          otherLanguage,
          isPremium
        );
        
        // Create blob URL for translation audio if available
        const translationAudioUrl = response.translation_audio && response.translation_audio_mime_type
          ? URL.createObjectURL(translationService.current.b64toBlob(
              response.translation_audio,
              response.translation_audio_mime_type
            )) 
          : null;
        
        // Update state with translation results
        setState(prev => ({ 
          ...prev, 
          isProcessing: false,
          isRecording: false,
          lastTranslation: response.translation || '',
          lastAudioUrl: translationAudioUrl
        }));
        
        return response;
      } catch (error) {
        console.error('Translation error:', error);
        setState(prev => ({ 
          ...prev, 
          isProcessing: false,
          isRecording: false
        }));
        return undefined;
      }
    } catch (error) {
      console.error('Recording error:', error);
      setState(prev => ({ 
        ...prev, 
        isProcessing: false,
        isRecording: false
      }));
      return undefined;
    }
  }, []);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (state.isRecording) {
      audioManager.current.cleanup();
      setState(prev => ({ 
        ...prev, 
        isRecording: false,
        isPaused: true,
      }));
    }
  }, [state.isRecording]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: false }));
  }, []);
  // Play translation audio
  const playTranslation = useCallback((audioBlob: Blob, onComplete?: () => void) => {
    setState(prev => ({ ...prev, isPlaying: true }));
    
    const url = playbackManager.current.createAudioUrl(audioBlob);
    setState(prev => ({ ...prev, audioUrl: url }));
    
    playbackManager.current.playAudio(audioBlob, () => {
      setState(prev => ({ ...prev, isPlaying: false }));
      if (onComplete) onComplete();
    });
    
    return url;
  }, []);

  // Stop audio playback
  const stopPlayback = useCallback(() => {
    playbackManager.current.stop();
    setState(prev => ({ ...prev, isPlaying: false }));
  }, []);
  // Cleanup all resources
  const cleanup = useCallback(() => {
    if (audioManager.current.isRecording()) {
      audioManager.current.cleanup();
    }
    
    playbackManager.current.stop();
    setState(initialState);
  }, []);
  // Return a memoized object containing all state and actions
  return useMemo(() => ({
    // State
    isRecording: state.isRecording,
    isPlaying: state.isPlaying,
    isPaused: state.isPaused,
    isProcessingStop: state.isProcessing,
    audioUrl: state.audioUrl,
    translation: state.translation,
    lastTranslation: state.lastTranslation,
    lastAudioUrl: state.lastAudioUrl,
    analyserNode: audioManager.current.getAnalyserNode(),
    
    // Actions
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    playTranslation,
    stopPlayback,
    cleanup
  }), [
    state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    playTranslation,
    stopPlayback,
    cleanup
  ]);
};
