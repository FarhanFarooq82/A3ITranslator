// TranslationContext.tsx
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { languages } from '../constants/languages';
import { TranslationContext, TranslationContextType } from './translationContext.utils';
import { useSessionManager } from '../hooks/useSessionManager';
import { useConversationManager } from '../hooks/useConversationManager';
import { useRecordingManager } from '../hooks/useRecordingManager';
import { RecordingCallbacks } from '../services/AudioRecordingManager';

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Language and settings state
  const [mainLanguage, setMainLanguage] = useState<string>(languages[0].value);
  const [otherLanguage, setOtherLanguage] = useState<string>(languages[1].value);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  
  // UI state - only keep what's necessary
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  // Refs for timers to allow cleanup
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize specialized hooks
  const recordingManager = useRecordingManager();
  const conversationManager = useConversationManager();
  
  // Helper function to clean up all timers
  const cleanupAllTimers = useCallback(() => {
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);
  
  const sessionManager = useSessionManager(() => {
    // Session end cleanup
    cleanupAllTimers();
    recordingManager.cleanup();
    conversationManager.clearConversation();
    setError(null);
    setStatus('');
    setSilenceCountdown(null);
  });
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => cleanupAllTimers();
  }, [cleanupAllTimers]);
  
  // Simple functions
  const swapLanguages = useCallback(() => {
    const temp = mainLanguage;
    setMainLanguage(otherLanguage);
    setOtherLanguage(temp);
  }, [mainLanguage, otherLanguage]);

  // Handle countdown separately to avoid circular dependencies
  const startCountdown = useCallback(async (onComplete: () => void) => {
    setIsCountingDown(true);
    const count = 3;
    setCountdown(count);
    setStatus(`Start listening in ${count}...`);
    
    // Clear previous timer if it exists
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
    }
    
    const runCountdown = (currentCount: number) => {
      if (currentCount > 1) {
        const newCount = currentCount - 1;
        setCountdown(newCount);
        setStatus(`Start listening in ${newCount}...`);
        countdownTimerRef.current = setTimeout(() => runCountdown(newCount), 1000);
      } else {
        // Countdown complete
        setIsCountingDown(false);
        setCountdown(null);
        setStatus('Listening...');
        onComplete();
        countdownTimerRef.current = null;
      }
    };
    
    // Start the countdown
    countdownTimerRef.current = setTimeout(() => runCountdown(count), 1000);
  }, []);

  // Define triggerRecording as a ref to avoid circular dependencies
  const triggerRecordingRef = useRef<(() => Promise<void>) | null>(null);
  
  // Stop recording function - defined first to resolve circular dependency
  const stopRecording = useCallback(async () => {
    if (!recordingManager.isRecording || recordingManager.isProcessingStop) return;
    
    try {
      setStatus('Processing...');
      
      const response = await recordingManager.stopRecording(
        mainLanguage,
        otherLanguage,
        isPremium
      );
      
      // Handle case where no valid audio was detected
      if (!response) {
        setStatus("No speech detected. Try speaking louder or closer to the microphone.");
        
        // Restart recording if session is active
        if (sessionManager.sessionStarted && !recordingManager.isPaused) {
          // Clear existing timer if any
          if (restartTimerRef.current) {
            clearTimeout(restartTimerRef.current);
          }
          
          restartTimerRef.current = setTimeout(() => {
            setStatus("Restarting recording...");
            triggerRecordingRef.current?.();
          }, 2000);
        }
        return;
      }
      
      // Update conversation with transcription in source language
      if (response.transcription && response.audio_language === mainLanguage) {
        conversationManager.addConversationItem(
          response.transcription,
          response.audio_language,
          response.audio_language
        );
      }
      
      // Update conversation with translation in target language
      if (response.translation && response.translation_language === mainLanguage) {
        conversationManager.addConversationItem(
          response.translation,
          response.translation_language,
          response.audio_language || 'Unknown'
        );
      }
      
      if (response.translation_audio) {
        setStatus('Playing translation...');
      } else {
        setStatus('Ready');
      }
      
      // Restart recording after playback if session is active
      if (sessionManager.sessionStarted && !recordingManager.isPaused) {
        // Clear existing timer if any
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current);
        }
        
        restartTimerRef.current = setTimeout(() => {
          triggerRecordingRef.current?.();
        }, 500);
      }
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Translation failed: ${errorMsg}`);
      setStatus('Error occurred');
    }
  }, [
    recordingManager,
    mainLanguage,
    otherLanguage,
    isPremium,
    sessionManager.sessionStarted,
    conversationManager,
    setError,
    setStatus
  ]);
  
  // Trigger recording with countdown
  const triggerRecording = useCallback(async () => {
    // Don't start if we're already recording or in process
    if (recordingManager.isRecording || recordingManager.isProcessingStop) {
      return;
    }
    
    const startRecordingAfterCountdown = async () => {
      try {        
        // Create callbacks object for silence detection 
        const callbacks: RecordingCallbacks = {
          onSilenceCountdown: (countdown: number) => setSilenceCountdown(countdown),
          onSoundResumed: () => {
            setSilenceCountdown(null);
            setStatus('Recording...');
          },
          onSilenceComplete: async () => {  
            // Silence detected, stop recording
            setSilenceCountdown(null);
            await stopRecording();
          }
        };
        
        // Start recording with silence detection callbacks
        await recordingManager.startRecording(callbacks);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`Recording failed: ${errorMsg}`);
        setStatus('Error occurred');
      }
    };
    
    // Start countdown and then recording
    await startCountdown(startRecordingAfterCountdown);
  }, [recordingManager, stopRecording, startCountdown, setError, setStatus, setSilenceCountdown]);
  
  // Store the current triggerRecording function in a ref
  useEffect(() => {
    triggerRecordingRef.current = triggerRecording;
  }, [triggerRecording]);
  
  // Handle pause/unpause
  const handlePause = useCallback(() => {
    if (recordingManager.isRecording) {
      recordingManager.pauseRecording();
      setStatus('Paused');
      // Clean up any active timers
      cleanupAllTimers();
    }
  }, [recordingManager, cleanupAllTimers, setStatus]);
  
  const handleUnpause = useCallback(() => {
    if (recordingManager.isPaused) {
      recordingManager.resumeRecording();
      triggerRecording();
    }
  }, [recordingManager, triggerRecording]);
  
  // Create the context value object using useMemo for better performance
  const contextValue = useMemo<TranslationContextType>(() => ({
    // Language settings
    mainLanguage,
    setMainLanguage,
    otherLanguage,
    setOtherLanguage,
    isPremium,
    setIsPremium,
    swapLanguages,
    
    // Session state - correctly using sessionManager props
    sessionStarted: sessionManager.sessionStarted,
    showEndSessionConfirm: sessionManager.showEndSessionConfirm,

    // Session actions (using actual methods from sessionManager)
    startSession: sessionManager.startSession,
    handleStopSession: sessionManager.showEndConfirmation,
    cancelEndSession: sessionManager.cancelEndConfirmation,
    confirmEndSession: sessionManager.endSession,
    
    // Recording state
    isRecording: recordingManager.isRecording,
    isPlaying: recordingManager.isPlaying,
    isPaused: recordingManager.isPaused,
    
    // UI state
    error,
    status,
    silenceCountdown,
    isCountingDown,
    countdown,
    
    // Conversation data
    conversation: conversationManager.conversation,
    lastTranslation: recordingManager.lastTranslation,
    lastAudioUrl: recordingManager.lastAudioUrl,
    
    // Audio processing
    analyserNode: recordingManager.analyserNode,
    
    // Actions
    triggerRecording,
    stopRecording,
    handlePause,
    handleUnpause,    
    cleanup: () => {
      cleanupAllTimers();
      recordingManager.cleanup();
    }
  }), [
    mainLanguage, otherLanguage, isPremium, swapLanguages,
    sessionManager, recordingManager, error, status,
    silenceCountdown, isCountingDown, countdown,
    conversationManager, triggerRecording, stopRecording,
    handlePause, handleUnpause, cleanupAllTimers
  ]);
  
  return (
    <TranslationContext.Provider value={contextValue}>
      {children}
    </TranslationContext.Provider>
  );
};