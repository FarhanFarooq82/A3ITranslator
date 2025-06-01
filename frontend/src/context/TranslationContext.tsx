import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioRecordingManager } from '../services/AudioRecordingManager';
import { TranslationService } from '../services/TranslationService';
import { SpeechRecognitionService } from '../services/SpeechRecognitionService';
import { languages } from '../constants/languages';
import { TranslationContext, type TranslationContextType } from './translationContext.utils';

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State declarations
  const [sessionStarted, setSessionStarted] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [targetWord, setTargetWord] = useState<string>('Translate');
  const [mainLanguage, setMainLanguage] = useState<string>(languages[0].value);
  const [otherLanguage, setOtherLanguage] = useState<string>(languages[1].value);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isProcessingStop, setIsProcessingStop] = useState<boolean>(false);
  const [translation, setTranslation] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Array<{ text: string; language: string; speaker: string; timestamp: string }>>([]);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState<boolean>(false);
  const [lastTranslation, setLastTranslation] = useState<string>('');
  const [lastAudioUrl, setLastAudioUrl] = useState<string | null>(null);
  const [recognitionStream, setRecognitionStream] = useState<MediaStream | null>(null);

  // Service refs
  const recordingManager = useRef(new AudioRecordingManager());
  const translationService = useRef(new TranslationService());
  const speechServiceRef = useRef<SpeechRecognitionService>(new SpeechRecognitionService());

  // Refs for breaking dependency cycles with proper types
  const startListeningRef = useRef<() => void>(() => {});
  const stopRecordingRef = useRef<() => Promise<TranslationResponse | undefined>>(() => Promise.resolve(undefined));
  const triggerRecordingRef = useRef<() => Promise<void>>(async () => {});

  // Function declarations with refs to break cycles
  const startListening = useCallback(() => {
    console.log('Starting listening from context...'); // Debug log
    setStatus('Listening for trigger word...');

    
    speechServiceRef.current.setupRecognition(
      'en-US', // Assuming 'en-US' is the main language
      // onStart
      () => {
        console.log('Recognition started'); // Debug log
        setError(null);
      },
      // onResult
      (transcript: string) => {
        console.log('Transcript received:', transcript); // Debug log
        const lowerCaseTranscript = transcript.toLowerCase();
        const lowerCaseTargetWord = targetWord.toLowerCase();
        if (lowerCaseTranscript.includes(lowerCaseTargetWord)) {
          console.log('Trigger word detected:', targetWord); // Debug log
          setStatus('Trigger word detected! Recording...');
          speechServiceRef.current.stop();
          setIsListening(false);
          setStatus(''); // Clear status
          setAudioUrl(null); // Clear previous audio
          setTranslation(''); // Clear previous translation
          triggerRecordingRef.current();
        }
      },
      // onError
      (error: string) => {
        console.log('Recognition error:', error); // Debug log
        if (error === 'no-speech') {
          setStatus('Listening for trigger word...');
          setTimeout(() => {
            if (sessionStarted) {
              startListeningRef.current();
            }
          }, 100);
        } else {
          setError(error);
          setIsListening(false);
        }
      },
      // onEnd
      () => {
        console.log('Recognition ended'); // Debug log
        setIsListening(false);
      }
    );

    // Get microphone stream for visualizer
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => setRecognitionStream(stream))
      .catch(() => setRecognitionStream(null));
    
      setIsListening(true);
    speechServiceRef.current.start();
  }, [ sessionStarted, targetWord, setAudioUrl, setTranslation]);

  const stopRecording = useCallback(async () => {
    if (!recordingManager.current.isRecording() || isProcessingStop) return;

    try {
      setIsProcessingStop(true);
      const audioBlob = await recordingManager.current.stopRecording();      const response = await translationService.current.sendAudioForTranslation(
        audioBlob,
        mainLanguage,
        otherLanguage,
        isPremium
      );      // Update conversation with transcription
      if (response.transcription && response.audio_language === mainLanguage) {
        setConversation(prev => [
          ...prev,
          {
            text: response.transcription,
            language: response.audio_language,
            speaker: response.audio_language,
            timestamp: response.timestamp || new Date().toISOString()
          }
        ]);
      }

      // Also add translation to conversation
      if (response.translation && response.translation_language === mainLanguage) {
        setConversation(prev => [
          ...prev,
          {
            text: response.translation,
            language: response.audio_language,
            speaker: response.audio_language,
            timestamp: response.timestamp || new Date().toISOString()
          }
        ]);
      }

      // Handle audio playback
      if (response.translation_audio && response.translation_audio_mime_type) {
        const translatedAudioBlob = translationService.current.b64toBlob(
          response.translation_audio,
          response.translation_audio_mime_type
        );
        const url = translationService.current.createAudioUrl(translatedAudioBlob);
        setAudioUrl(url);
        setTranslation(response.translation || '');
        setIsPlaying(true);

        // Stop recognition while audio is playing
        speechServiceRef.current.stop();

        translationService.current.playTranslation(translatedAudioBlob, () => {
          setIsPlaying(false);
          setTranslation('');
          setAudioUrl(null);
          // Resume recognition after playback ends
          if (sessionStarted) {
            startListeningRef.current();
          }
        });
      } else {
        if (sessionStarted) {
          startListeningRef.current();
        }
      }

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to process recording: ' + errorMessage);
      throw err;
    } finally {
      setIsProcessingStop(false);
      setIsRecording(false);
      recordingManager.current.cleanup();
      setRecognitionStream(null); // Hide visualizer when recording
    }
  }, [isProcessingStop, mainLanguage, otherLanguage, sessionStarted, isPremium]);
  const triggerRecording = useCallback(async () => {
    // Clear previous audio and translation when starting a new recording
    setStatus('Recording...');
    setIsRecording(true);
    setAudioUrl(null);
    setTranslation('');
    
    try {
      await recordingManager.current.startRecording(
        (countdown) => setSilenceCountdown(countdown),
        () => {
          setSilenceCountdown(null);
          setStatus('Recording...');
        },
        async () => {
          setSilenceCountdown(null);
          await stopRecordingRef.current();
        }
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('No audio stream available for recording: ' + errorMessage);
      setIsRecording(false);
    }
  }, []);
  // Add swapLanguages function to swap main and target languages
  const swapLanguages = useCallback(() => {
    const tempLanguage = mainLanguage;
    setMainLanguage(otherLanguage);
    setOtherLanguage(tempLanguage);
  }, [mainLanguage, otherLanguage]);

  // Update refs after function declarations
  useEffect(() => {
    startListeningRef.current = startListening;
    stopRecordingRef.current = stopRecording;
    triggerRecordingRef.current = triggerRecording;
  }, [startListening, stopRecording, triggerRecording]);

  // Persist the last translation and audio until a new recording starts
  useEffect(() => {
    if (audioUrl) setLastAudioUrl(audioUrl);
    if (translation) setLastTranslation(translation);
  }, [audioUrl, translation]);

  // When a new recording starts, clear the persistent copy
  useEffect(() => {
    if (isRecording) {
      setLastAudioUrl(null);
      setLastTranslation('');
    }
  }, [isRecording]);

  const cleanup = useCallback(() => {
    // Stop and cleanup speech recognition
    speechServiceRef.current.stop();
    speechServiceRef.current.cleanup();

    // Stop and cleanup audio recording
    if (recordingManager.current.isRecording()) {
      recordingManager.current.cleanup();
    }

    // Stop audio playback
    translationService.current.stop();

    // Reset all state
    setTargetWord('Translate');
    setIsListening(false);
    setIsRecording(false);
    setIsPlaying(false);
    setError(null);
    setIsProcessingStop(false);
    setTranslation('');
    setAudioUrl(null);
    setStatus('');
    setSilenceCountdown(null);
    setMainLanguage(languages[0].value);
    setOtherLanguage(languages[1].value);
    setConversation([]);
  }, []);
  const value: TranslationContextType = {
    sessionStarted,
    setSessionStarted,
    sessionId,
    setSessionId,
    targetWord,
    setTargetWord,
    mainLanguage,
    setMainLanguage,
    otherLanguage,
    setOtherLanguage,
    isPremium,
    setIsPremium,
    error,
    setError,
    status,
    setStatus,
    silenceCountdown,
    setSilenceCountdown,
    isListening,
    setIsListening,
    isRecording,
    setIsRecording,
    isPlaying,
    setIsPlaying,
    isProcessingStop,
    setIsProcessingStop,
    translation,
    setTranslation,
    audioUrl,
    setAudioUrl,
    conversation,
    setConversation,
    showEndSessionConfirm,
    setShowEndSessionConfirm,
    triggerRecording,
    stopRecording,
    startListening,
    cleanup,
    lastTranslation,
    lastAudioUrl,
    recognitionStream,
    setRecognitionStream,
    swapLanguages, // Add swapLanguages to context value
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
};
