import { useCallback, useRef } from 'react';
import { useTranslationContext } from '../context/translationContext.utils';
import { TranslationService } from '../services/TranslationService';
import { PlaybackManager } from '../services/PlaybackManager';
import type { TranslationResponse } from '../services/TranslationService';

export const useAudioRecording = () => {
  const {
    setStatus,
    setAudioUrl,
    setIsPlaying,
    setTranslation,
    setIsRecording,
    setConversation,
    mainLanguage,
    stopRecording: contextStopRecording, // Import the stopRecording function from context
  } = useTranslationContext();

  // Keep services in refs to avoid recreating them on each render
  const translationServiceRef = useRef<TranslationService>(new TranslationService());
  const playbackManagerRef = useRef<PlaybackManager>(new PlaybackManager());

  // Start a new recording
  const startRecording = useCallback(() => {
    setStatus('Recording...');
    setIsRecording(true);
    setAudioUrl(null);
    setTranslation('');
    // Start actual recording logic here (e.g., via AudioRecordingManager)
    // ...
  }, [setStatus, setIsRecording, setAudioUrl, setTranslation]);

  // Stop the current recording and process the audio
  const stopRecording = useCallback(async () => {
    // Call the stopRecording function from context which handles sending to backend
    return contextStopRecording();
  }, [contextStopRecording]);

  // Handle playback of translation audio and update conversation
  const handlePlayback = useCallback((response: TranslationResponse, afterPlayback?: () => void) => {
    setTranslation(response.translation || '');

    // Update conversation based on language
    if (response.audio_language === mainLanguage && response.transcription) {
      setConversation((prev: Array<{ text: string; language: string; speaker: string; timestamp: string }>) => [
        ...prev,
        {
          text: response.transcription!,
          language: response.audio_language!,
          speaker: response.audio_language!,
          timestamp: response.timestamp || ''
        }
      ]);
    } else if (response.translation_language === mainLanguage && response.translation) {
      setConversation((prev: Array<{ text: string; language: string; speaker: string; timestamp: string }>) => [
        ...prev,
        {
          text: response.translation!,
          language: response.audio_language!,
          speaker: response.audio_language!,
          timestamp: response.timestamp || ''
        }
      ]);
    }

    if (response.translation_audio && response.translation_audio_mime_type) {
      const translatedAudioBlob = translationServiceRef.current.b64toBlob(
        response.translation_audio,
        response.translation_audio_mime_type
      );

      setStatus(response.translation || '');
      setIsPlaying(true);
      const url = playbackManagerRef.current.playAudio(translatedAudioBlob, () => {
        setIsPlaying(false);
        afterPlayback?.();
        startRecording();
      });
      setAudioUrl(url);
    } else {
      setAudioUrl(null);
      afterPlayback?.();
      startRecording();
    }
  }, [mainLanguage, setAudioUrl, setConversation, setIsPlaying, setStatus, setTranslation, startRecording]);

  // Stop playback
  const stopPlayback = useCallback(() => {
    playbackManagerRef.current.stop();
    setIsPlaying(false);
  }, [setIsPlaying]);

  // Clear and restart recording
  const clearAndRestart = useCallback(() => {
    stopRecording();
    setTimeout(() => {
      startRecording();
    }, 100);
  }, [stopRecording, startRecording]);

  return {
    startRecording,
    stopRecording,
    handlePlayback,
    stopPlayback,
    clearAndRestart
  };
};
