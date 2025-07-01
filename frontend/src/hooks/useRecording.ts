import { useCallback, useRef } from 'react';
import { useAppState, ActionType, SessionState, OperationState } from '../context/AppStateContext';
import { AudioRecordingManager } from '../services/AudioRecordingManager';
import { TranslationService } from '../services/TranslationService';
import { PlaybackManager } from '../services/PlaybackManager';
import type { TranslationResponse } from '../services/TranslationService';

// Debug tracking for operation state changes
let lastOperationState: OperationState | null = null;
function trackOperationState(newState: OperationState, source: string) {
  if (lastOperationState !== newState) {
    console.log(
      `%cOperation State: ${lastOperationState} => ${newState} (Source: ${source})`,
      'color: #ff5722; font-weight: bold'
    );
    console.trace('State change stack trace');
    lastOperationState = newState;
  }
}

/**
 * Hook for managing audio recording, playback, and translation
 * @returns Recording state and actions
 */
export const useRecording = () => {
  const { state, dispatch } = useAppState();
  
  // Debug state changes
  useRef(() => {
    // This runs only once on mount
    console.log('Initial operation state:', state.operationState);
    trackOperationState(state.operationState, 'initial');
  }).current();
  
  // Track state changes on every render
  if (lastOperationState !== state.operationState) {
    trackOperationState(state.operationState, 'render');
  }
  
  // Initialize services as refs so they persist across renders
  const audioManager = useRef(new AudioRecordingManager());
  const translationService = useRef(new TranslationService());
  const playbackManager = useRef(new PlaybackManager());
  
  // Last recorded audio blob for potential reuse
  const lastRecordedAudioRef = useRef<Blob | null>(null);
  // Function refs to break dependency cycles
  const translateAudioRef = useRef<(blob: Blob) => Promise<TranslationResponse | undefined>>(() => Promise.resolve(undefined));
  const startRecordingRef = useRef<(forceState?: OperationState) => void>(() => {});
  const stopRecordingAndTranslateRef = useRef<() => Promise<TranslationResponse | undefined>>(() => Promise.resolve(undefined));

  // Process translation response and update conversation
  const processTranslationResponse = useCallback((
    response: TranslationResponse,
    mainLanguage: string
  ) => {
    // Add transcription to conversation if in main language
    if (response.transcription && response.audio_language === mainLanguage) {
      dispatch({
        type: ActionType.ADD_CONVERSATION_ITEM,
        item: {
          text: response.transcription,
          language: response.audio_language,
          speaker: response.audio_language,
          timestamp: response.timestamp || new Date().toISOString()
        }
      });
    }
    
    // Add translation to conversation if in main language
    if (response.translation && response.translation_language === mainLanguage) {
      dispatch({
        type: ActionType.ADD_CONVERSATION_ITEM,
        item: {
          text: response.translation,
          language: response.translation_language,
          speaker: response.audio_language || 'Unknown',
          timestamp: response.timestamp || new Date().toISOString()
        }
      });
    }
  }, [dispatch]);

  // 1. RECORDING OPERATIONS
  const stopRecording = useCallback(async () => {
    console.log('%cSTOP RECORDING: Function called', 'background: #F44336; color: white;');
    console.log('Current operation state:', state.operationState);
    trackOperationState(state.operationState, 'stopRecording-entry');
    
    if (state.operationState !== OperationState.RECORDING) {
      console.log('STOP RECORDING: Not in recording state, returning null');
      return null;
    }

    try {
      // Get audio blob from recording manager
      const audioBlob = await audioManager.current.stopRecording();
      console.log('STOP RECORDING: Recording stopped, got audioBlob:', !!audioBlob);
      trackOperationState(state.operationState, 'stopRecording-afterStop');
      
      lastRecordedAudioRef.current = audioBlob;

      if (!audioBlob) {
        // Update state if no speech was detected
        dispatch({ 
          type: ActionType.UPDATE_STATE, 
          updates: { 
            statusMessage: 'No speech detected. Try speaking louder or closer to the microphone.' 
          } 
        });
        return null;
      }
      
      return audioBlob;
    } catch (error) {
      console.error('Recording error:', error);
      dispatch({ 
        type: ActionType.RECORDING_ERROR, 
        error: `Error stopping recording: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
      return null;
    }
  }, [dispatch, state.operationState]);

  // 2. PLAYBACK OPERATIONS
  const playTranslationAudio = useCallback(async (
    audioBlob: Blob,
    audioUrl: string
  ) => {
    try {
      // Start playback
      dispatch({ 
        type: ActionType.START_PLAYBACK, 
        url: audioUrl 
      });
      
      // Wait for playback to complete
      await new Promise<void>((resolve) => {
        playbackManager.current.playAudio(audioBlob, () => {
          dispatch({ type: ActionType.COMPLETE_PLAYBACK });
          resolve();
        });
      });
      
      // Auto-restart recording if session is active
      if (state.sessionState === SessionState.ACTIVE) {
        setTimeout(() => {
          if (startRecordingRef.current) {
            startRecordingRef.current();
          }
        }, 500);
      }
    } catch (error) {
      console.error('Playback error:', error);
      dispatch({ 
        type: ActionType.PLAYBACK_ERROR, 
        error: `Playback failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    }
  }, [dispatch, state.sessionState]);
  // 3. TRANSLATION OPERATIONS
  const translateAudio = useCallback(async (audioBlob: Blob) => {
    // Start translation
    dispatch({ type: ActionType.START_TRANSLATION });
    
    try {
      // Send audio to translation service (with retry capability for trimmed audio)
      const response = await translationService.current.sendAudioForTranslation(
        audioBlob,
        state.mainLanguage,
        state.otherLanguage,
        state.isPremium,
        false // not a retry
      );
      
      // Update conversation
      processTranslationResponse(response, state.mainLanguage);
      
      // Create blob URL for translation audio if available
      if (response.translation_audio && response.translation_audio_mime_type) {
        const translatedAudioBlob = translationService.current.b64toBlob(
          response.translation_audio,
          response.translation_audio_mime_type
        );
        
        // Update state with the translation results
        const audioUrl = playbackManager.current.createAudioUrl(translatedAudioBlob);
        
        // Complete translation with results
        dispatch({ 
          type: ActionType.COMPLETE_TRANSLATION,
          translation: response.translation || '',
          audioUrl: audioUrl
        });
        
        // Play the audio
        await playTranslationAudio(translatedAudioBlob, audioUrl);
      } 
      else 
      {
        // No audio to play, just update state
        dispatch({ 
          type: ActionType.COMPLETE_TRANSLATION, 
          translation: response.translation || '',
          audioUrl: null
        });
      }

      return response;
    } catch (error) {
      console.error('Translation error:', error);
      dispatch({ 
        type: ActionType.TRANSLATION_ERROR, 
        error: `Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
      
      return undefined;
    }
  }, [dispatch, state.mainLanguage, state.otherLanguage, state.isPremium, processTranslationResponse, playTranslationAudio]);
  
  // Update the translateAudio reference
  translateAudioRef.current = translateAudio;
  
  // Start recording with countdown
  const startRecording = useCallback((forceState?: OperationState) => {
    console.log('%cSTART RECORDING: Function called', 'background: #4CAF50; color: white;');

    const currentState = forceState ?? state.operationState;

    console.log('Current operation state:', currentState);
    trackOperationState(currentState, 'startRecording-entry');
    
    // Guard against starting recording when already in a busy state
    if (currentState === OperationState.RECORDING || 
        currentState === OperationState.PROCESSING || 
        currentState === OperationState.TRANSLATING) {
      console.log('START RECORDING: Aborting due to state =', currentState);
      return;
    }
    
    // Before starting a new recording, ensure any previous resources are cleaned up
    if (audioManager.current) {
      console.log('START RECORDING: Cleaning up previous recording resources');
      audioManager.current.cleanup();
    }
    
    // Start with a 3-second countdown
    const countdownDuration = 3;
  
    // Start the countdown
    dispatch({ type: ActionType.START_COUNTDOWN, count: countdownDuration });
    
    let countdownValue = countdownDuration;
    let countdownCancelled = false;
    
    // Create a countdown timer
    const countdownTimer = setInterval(() => {
      // Check if countdown was cancelled
      if (countdownCancelled) {
        clearInterval(countdownTimer);
        return;
      }
      
      countdownValue -= 1;
      
      if (countdownValue > 0) {
        // Update countdown
        dispatch({ type: ActionType.UPDATE_COUNTDOWN, count: countdownValue });
      } else {
        // Countdown complete, clear interval and start recording
        clearInterval(countdownTimer);
  
        // Signal countdown is complete
        dispatch({ type: ActionType.COMPLETE_COUNTDOWN });
        
        const recorder = audioManager.current;
        
        // Set up recording actions for the manager to use
        recorder.setRecordingActions({
          setSilenceCountdown: (countdown: number | null) => {
            dispatch({ type: ActionType.DETECT_SILENCE, countdown });
          },
          setStatus: (status: string) => {
            dispatch({ 
              type: ActionType.UPDATE_STATE, 
              updates: { statusMessage: status } 
            });
          },
          stopRecordingWithTranslation: async () => {
            try {
              await stopRecordingAndTranslateRef.current();
            } catch (error) {
              console.error('Error in stopRecordingWithTranslation:', error);
              dispatch({ 
                type: ActionType.RECORDING_ERROR, 
                error: `Error while processing recording: ${error instanceof Error ? error.message : 'Unknown error'}` 
              });
            }
          }
        });
        
        // Start recording with the AudioRecordingManager
        recorder.startRecording()
          .then((analyserNode) => {
            if (analyserNode) {
              dispatch({ 
                type: ActionType.START_RECORDING, 
                analyserNode
              });
              
              console.log('START RECORDING: Recording started successfully with analyzer node');
            } else {
              // If analyserNode is null or undefined, treat it as a failure to start recording
              throw new Error('Failed to initialize audio analyzer for visualization.');
            }
          })
          .catch((error) => {
            console.error('Failed to start recording:', error);
            dispatch({ 
              type: ActionType.RECORDING_ERROR, 
              error: `Recording failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
            });
            
            // Ensure we clean up resources on error
            audioManager.current.cleanup();
          });
      }
    }, 1000);
    
    // Return a function to cancel countdown if needed
    return () => {
      countdownCancelled = true;
      clearInterval(countdownTimer);
    };
  }, [dispatch, state.operationState]);
  
  // startRecordingRef will be updated at the end of the component

  // 4. COMBINED OPERATIONS
  // Stop recording and reset
  const resetRecording = useCallback(async () => {
    console.log('%cRESET: Starting reset', 'background: #FF9800; color: white;');
    console.log('Current operation state:', state.operationState);
    
    // First cleanup audio manager resources to ensure we're starting fresh
    audioManager.current.cleanup();
    
    // Reset state to IDLE
    dispatch({ type: ActionType.RESET_AUDIO });
    
    // Use setTimeout to ensure state update has completed before starting recording
    // This avoids race conditions where startRecording would use stale state
    setTimeout(() => {
      console.log('%cRESET: Restarting recording after reset', 'background: #FF9800; color: white;');
      // By passing OperationState.IDLE, we bypass the stale state check inside startRecording
      startRecordingRef.current(OperationState.IDLE);
    }, 50); // Small delay to ensure state update completes
  }, [dispatch, state.operationState]);

  // Stop recording and translate
  const stopRecordingAndTranslate = useCallback(async () => {
    console.log('%cSTOP AND TRANSLATE: Function called', 'background: #E91E63; color: white;');
    try {
      // First, attempt to stop recording and get the audio blob
      const audioBlob = await stopRecording();
      
      // Check if we got a valid audio blob
      if (audioBlob && audioBlob.size > 0) {
        console.log(`STOP AND TRANSLATE: Got valid audio blob (${audioBlob.size} bytes), proceeding to translation`);
        
        // Update state to reflect that recording has stopped
        dispatch({ type: ActionType.STOP_RECORDING });
        
        // Proceed with translation
        return await translateAudio(audioBlob);
      } else {
        console.log('STOP AND TRANSLATE: No valid audio detected, resuming recording');
        
        // If no valid audio was detected, reset and restart recording
        // Use setTimeout to ensure state updates have completed
        setTimeout(() => {
          if (state.sessionState === SessionState.ACTIVE) {
            console.log('STOP AND TRANSLATE: Session active, restarting recording');
            audioManager.current.cleanup();
            dispatch({ type: ActionType.RESET_AUDIO });
            setTimeout(() => startRecordingRef.current(OperationState.IDLE), 50);
          }
        }, 100);
        
        return undefined;
      }
    } catch (error) {
      console.error('Error in stopRecordingAndTranslate:', error);
      
      // Handle errors and try to recover
      dispatch({ 
        type: ActionType.RECORDING_ERROR, 
        error: `Error processing recording: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
      
      // Try to restart recording after error
      setTimeout(() => {
        if (state.sessionState === SessionState.ACTIVE) {
          audioManager.current.cleanup();
          dispatch({ type: ActionType.RESET_AUDIO });
          setTimeout(() => startRecordingRef.current(OperationState.IDLE), 50);
        }
      }, 1000);
      
      return undefined;
    }
  }, [stopRecording, translateAudio, dispatch, state.sessionState]);

  // 5. OTHER CONTROL OPERATIONS
  // Stop playback
  const stopPlayback = useCallback(() => {
    playbackManager.current.stop();
    dispatch({ type: ActionType.COMPLETE_PLAYBACK });
  }, [dispatch]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (state.operationState === OperationState.RECORDING) {
      audioManager.current.cleanup();
      dispatch({ type: ActionType.PAUSE_SESSION });
    }
  }, [dispatch, state.operationState]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    dispatch({ type: ActionType.RESUME_SESSION });
    // Use the function reference to avoid circular dependency
    startRecordingRef.current();
  }, [dispatch]);

  // Replay last translation
  const replayLastTranslation = useCallback(async () => {
    if (state.lastAudioUrl) {
      // Start playback process
      dispatch({ type: ActionType.START_TRANSLATION });
      
      const audioBlob = await fetch(state.lastAudioUrl)
        .then(response => response.blob());
      
      await playTranslationAudio(audioBlob, state.lastAudioUrl);
    }
  }, [dispatch, state.lastAudioUrl, playTranslationAudio]);

  // Clean up resources
  const cleanup = useCallback(() => {
    if (state.operationState === OperationState.RECORDING) {
      audioManager.current.cleanup();
    }
    playbackManager.current.stop();
    dispatch({ type: ActionType.SET_ANALYZER_NODE, node: null });
  }, [dispatch, state.operationState]);

  // Update function references to break circular dependencies
  // This must be done after all functions are defined
  startRecordingRef.current = startRecording;
  stopRecordingAndTranslateRef.current = stopRecordingAndTranslate;
  
  return {
    // State
    isRecording: state.operationState === OperationState.RECORDING,
    isPlaying: state.operationState === OperationState.PLAYING,
    isPaused: state.sessionState === SessionState.PAUSED,
    isProcessing: state.operationState === OperationState.PROCESSING || 
                  state.operationState === OperationState.TRANSLATING,
    lastTranslation: state.lastTranslation,
    lastAudioUrl: state.lastAudioUrl,
    analyserNode: state.analyserNode,
    
    // Recording operations
    startRecording,
    resetRecording,
    
    // Translation operation
    translateAudio,
    
    // Playback operations
    playTranslationAudio,
    stopPlayback,
    replayLastTranslation,
    
    // Combined operations
    stopRecordingAndTranslate,
    
    // Session control
    pauseRecording,
    resumeRecording,
    cleanup
  };
};