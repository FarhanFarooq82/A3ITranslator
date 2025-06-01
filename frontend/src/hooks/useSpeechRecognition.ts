import { useCallback, useRef } from 'react';
import { useTranslationContext } from '../context/translationContext.utils';
import { SpeechRecognitionService } from '../services/SpeechRecognitionService';

export const useSpeechRecognition = () => {
  const {
    setIsListening,
    setStatus,
    setError,
    targetWord,
    isListening,
    triggerRecording,
  } = useTranslationContext();

  const speechServiceRef = useRef<SpeechRecognitionService>(new SpeechRecognitionService());

  const startListening = useCallback(() => {
    console.log('Starting listening...'); // Debug log
    setStatus('Listening for trigger word...');
    setIsListening(true);

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
          triggerRecording();
        }
      },
      // onError
      (error: string) => {
        console.log('Recognition error:', error); // Debug log
        if (error === 'no-speech') {
          setStatus('Listening for trigger word...');
          setTimeout(() => {
            startListening();
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

    speechServiceRef.current.start();
  }, [ targetWord, setError, setIsListening, setStatus, triggerRecording]);

  const stopListening = useCallback(() => {
    console.log('Stopping listening...'); // Debug log
    speechServiceRef.current.stop();
    speechServiceRef.current.cleanup();
  }, []);

  return {
    startListening,
    stopListening,
    isListening,
  };
};
