import { useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { AlertCircle } from "lucide-react";
import LanguageSelector from './LanguageSelector';
import ControlButtons from './ControlButtons';
import ConversationHistory from './ConversationHistory';
import { SessionDialog } from './SessionDialog';
import { TranslationDisplay } from './TranslationDisplay';
import { useTranslationContext } from '../context/translationContext.utils';
import { useSession } from '../hooks/useSession';
import { useAudioRecording } from '../hooks/useAudioRecording';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { languages } from '../constants/languages';

const RealTimeTranslatorApp = () => {
  const {
    targetWord,
    setTargetWord,
    mainLanguage,
    setMainLanguage,
    otherLanguage,
    setOtherLanguage,
    error,
    status,
    silenceCountdown,
    sessionStarted,
    showEndSessionConfirm,
    conversation,
    isListening,
    isRecording,
    isPlaying,
    lastTranslation,
    lastAudioUrl,
  } = useTranslationContext();

  const { startSession, handleStopSession, cancelEndSession, confirmEndSession } = useSession();
  const { startRecording: handleManualRecord, stopRecording: handleManualTranslate } = useAudioRecording();
  const { startListening, stopListening } = useSpeechRecognition();

  const conversationEndRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;

  // Start listening when session starts
  useEffect(() => {
    if (sessionStarted) {
      startListening();
    }
  }, [sessionStarted, startListening]);

  // Cleanup listening when session ends
  useEffect(() => {
    return () => {
      if (!sessionStarted) {
        stopListening();
      }
    };
  }, [sessionStarted, stopListening]);

  // Keep conversation scrolled to bottom
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  // Button visibility logic
  const showStartSession = !sessionStarted;
  const showMainUI = sessionStarted;
  const showStopSession = sessionStarted;
  const showRecord = showMainUI && isListening && !isRecording && !isPlaying;
  const showTranslate = showMainUI && isRecording && !isPlaying;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">A3I Translator</h1>

      {showMainUI && (
        <ConversationHistory
          conversation={conversation}
          mainLanguage={mainLanguage}
          conversationEndRef={conversationEndRef}
        />
      )}

      {showEndSessionConfirm ? (
        <SessionDialog onCancel={cancelEndSession} onConfirm={confirmEndSession} />
      ) : (
        <>
          {showStopSession && (
            <div className="w-full flex justify-end mb-2">
              <Button onClick={handleStopSession} variant="destructive" size="sm">
                Stop Session
              </Button>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <LanguageSelector
              label="Main Language:"
              value={mainLanguage}
              onChange={setMainLanguage}
              options={languages.map(l => ({ value: l.value, label: l.name }))}
            />
            <LanguageSelector
              label="Target Language:"
              value={otherLanguage}
              onChange={setOtherLanguage}
              options={languages.map(l => ({ value: l.value, label: l.name }))}
            />
          </div>

          {showStartSession && (
            <div className="mb-4">
              <Button type="button" onClick={startSession} size="lg">
                Start Session
              </Button>
            </div>
          )}

          {showMainUI && (
            <>
              <Input
                type="text"
                value={targetWord}
                onChange={(e) => setTargetWord(e.target.value)}
                placeholder="Enter trigger word..."
                className="mb-4 max-w-sm"
              />

              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {status && (
                <div className="text-gray-600 mb-4">
                  {status}
                  {silenceCountdown !== null && ` (${silenceCountdown})`}
                </div>
              )}              
              <ControlButtons
                showRecord={showRecord}
                showTranslate={showTranslate}
                onRecord={handleManualRecord}
                onTranslate={handleManualTranslate}
              />

              <TranslationDisplay 
                audioUrl={lastAudioUrl}
                translation={lastTranslation}
                isPlaying={isPlaying}
              />
            </>
          )}
        </>
      )}

      <div ref={conversationEndRef} />
    </div>
  );
};

export default RealTimeTranslatorApp;