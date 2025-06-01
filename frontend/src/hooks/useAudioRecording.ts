import { useCallback, useRef } from 'react';
import { useTranslationContext } from '../context/translationContext.utils';
import { TranslationService } from '../services/TranslationService';
import { SpeechRecognitionService } from '../services/SpeechRecognitionService';
import type { TranslationResponse } from '../services/TranslationService';

export const useAudioRecording = () => {
  const {
    setStatus,
    mainLanguage,
    setAudioUrl,
    setIsPlaying,
    setTranslation,
    setConversation,
    triggerRecording,
    stopRecording,
    startListening
  } = useTranslationContext();

  // Keep services in refs to avoid recreating them on each render
  const translationServiceRef = useRef<TranslationService>(new TranslationService());
  const speechServiceRef = useRef<SpeechRecognitionService>(new SpeechRecognitionService());

  const handlePlayback = useCallback((response: TranslationResponse, afterPlayback?: () => void) => {
    setTranslation(response.translation || '');

    // Stop speech recognition while playing audio
    speechServiceRef.current.stop();

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
      const url = translationServiceRef.current.playTranslation(translatedAudioBlob, () => {
        setIsPlaying(false);

        // Don't clear status or audio URL - keep them visible
        // Only clear them when a new recording starts or trigger word is detected

        afterPlayback?.();
        startListening(); // Resume speech recognition after playback
      });
      setAudioUrl(url);
    } else {
      setAudioUrl(null);
      afterPlayback?.();
      startListening(); // Resume speech recognition if no audio to play
    }
  }, [mainLanguage, setAudioUrl, setConversation, setIsPlaying, setStatus, setTranslation, startListening]);

  const stopPlayback = useCallback(() => {
    translationServiceRef.current.stop();
    setIsPlaying(false);
    // Don't clear status or audio URL here, let them persist
  }, [setIsPlaying]);

  return {
    startRecording: triggerRecording,
    stopRecording,
    handlePlayback,
    stopPlayback
  };
};
