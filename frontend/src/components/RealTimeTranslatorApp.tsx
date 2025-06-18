// Add these imports and interfaces at the top of the file
import React, { useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { AlertCircle, ArrowLeftRight } from "lucide-react";
import LanguageSelector from './LanguageSelector';
import ConversationHistory from './ConversationHistory';
import { SessionDialog } from './SessionDialog';
import { TranslationDisplay } from './TranslationDisplay';
import { useTranslationContext } from '../context/translationContext.utils';
import { fetchAvailableVoices } from '../utils/azureApi';
import AudioVisualizer from './AudioVisualizer';
// Define interfaces for the sub-component props
interface LanguageControlsProps {
  mainLanguage: string;
  setMainLanguage: (lang: string) => void;
  otherLanguage: string;
  setOtherLanguage: (lang: string) => void;
  isPremium: boolean;
  setIsPremium: (isPremium: boolean) => void;
  swapLanguages: () => void;
}

// Updated components with interfaces
const LanguageControls: React.FC<LanguageControlsProps> = ({ 
  mainLanguage, 
  setMainLanguage, 
  otherLanguage, 
  setOtherLanguage,
  isPremium,
  setIsPremium,
  swapLanguages 
}) => (
  <div className="flex flex-col md:flex-row gap-4 mb-6 items-center">
    <LanguageSelector
      label="Main Language:"
      value={mainLanguage}
      onChange={setMainLanguage}
    />
    <Button 
      onClick={swapLanguages}
      variant="outline"
      size="icon"
      className="rounded-full h-10 w-10 flex-shrink-0 mt-6"
      title="Swap languages"
    >
      <ArrowLeftRight className="h-5 w-5" />
    </Button>
    <LanguageSelector
      label="Target Language:"
      value={otherLanguage}
      onChange={setOtherLanguage}
    />
    <div className="flex items-center mt-3 md:mt-6">
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="premium-checkbox"
          checked={isPremium}
          onChange={(e) => setIsPremium(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="premium-checkbox" className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Premium
        </label>
      </div>
    </div>
  </div>
);

interface StatusDisplayProps {
  status: string;
  silenceCountdown: number | null;
  error: string | null;
}


const StatusDisplay: React.FC<StatusDisplayProps> = ({ status, silenceCountdown, error }) => (
  <>
    {error && (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )}

    {status && status.includes("No speech detected") && (
      <div className="py-2 px-4 bg-yellow-100 text-yellow-800 rounded-md mb-4">
        <span className="font-medium">Audio too quiet:</span> {status}
      </div>
    )}

    {status && !status.includes("No speech detected") && (
      <div className="text-gray-600 mb-4">
        {status}
        {silenceCountdown !== null && ` (${silenceCountdown})`}
      </div>
    )}
  </>
);
interface RecordingControlsProps {
  showPause: boolean;
  showUnpause: boolean;
  showClearRestart: boolean;
  isRecording: boolean;
  isPaused: boolean;
  handlePause: () => void;
  handleUnpause: () => void;
  handleClearRestart: () => void;
  handleManualTranslate: () => void;
}

const RecordingControls: React.FC<RecordingControlsProps> = ({
  showPause,
  showUnpause,
  showClearRestart,
  isRecording,
  isPaused,
  handlePause,
  handleUnpause,
  handleClearRestart,
  handleManualTranslate
}) => (
  <div className="flex gap-2 mb-4">
    {showPause && (
      <Button variant="secondary" onClick={handlePause}>Pause</Button>
    )}
    {showUnpause && (
      <Button variant="secondary" onClick={handleUnpause}>Unpause</Button>
    )}
    {showClearRestart && (
      <Button variant="outline" onClick={handleClearRestart}>Clear/Restart</Button>
    )}
    {isRecording && !isPaused && (
      <Button variant="default" onClick={handleManualTranslate}>Translate</Button>
    )}
  </div>
);
 /////////////////////////////////////// Main Component///////////////////////////////////////////////////
const RealTimeTranslatorApp = () => {
  const {
    // Language settings
    mainLanguage,
    setMainLanguage,
    otherLanguage,
    setOtherLanguage,
    isPremium,
    setIsPremium,
    swapLanguages,
    
    // Session state
    sessionStarted,
    showEndSessionConfirm,
    
    // Session actions
    startSession,
    handleStopSession,
    cancelEndSession,
    confirmEndSession,
    
    // Recording state
    isRecording,
    isPlaying,
    isPaused,
    
    // UI state
    error,
    status,
    silenceCountdown,
    isCountingDown,
    countdown,
    conversation,
    lastTranslation,
    lastAudioUrl,
    analyserNode,
    
    // Actions
    triggerRecording,
    stopRecording,
    handlePause,
    handleUnpause,
    cleanup
  } = useTranslationContext();

  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Keep conversation scrolled to bottom
useEffect(() => {
  if (conversationEndRef.current) {
    conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }
}, [conversation]);

  // Preload voices for future use
  useEffect(() => {
    fetchAvailableVoices().catch(() => {});
  }, []);  // Simplified session and UI control functions
  const startSessionWithCountdown = () => {
    startSession();
    triggerRecording();
  };

  // Use the custom handle functions for the UI
  // Note: handleStopSession is already imported from context
  
  // Clear/Restart logic with cleaner implementation
  const handleClearRestart = () => {
    if (isRecording) {
      stopRecording();
    }
    triggerRecording();
  };

  // Organized UI state for easier maintenance
  const uiState = {
    session: {
      showStartButton: !sessionStarted && !isCountingDown,
      showStopButton: sessionStarted,
      showConfirmDialog: showEndSessionConfirm,
      showCountdown: isCountingDown,
      showMainUI: sessionStarted
    },
    recording: {
      showPauseButton: isRecording && !isPaused,
      showUnpauseButton: isPaused,
      showResumeButton: sessionStarted && !isRecording && !isPlaying && !isPaused,
      showRestartButton: isRecording && !isPaused,
      showVisualizer: isRecording && !isPaused && !!analyserNode
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">A3I Translator</h1>

      {/* Show conversation history only when session is active */}
      {uiState.session.showMainUI && (
        <ConversationHistory
          conversation={conversation}
          mainLanguage={mainLanguage}
          conversationEndRef={conversationEndRef}
        />
      )}      
      {uiState.session.showConfirmDialog ? (
        <SessionDialog onCancel={cancelEndSession} onConfirm={confirmEndSession} />
      ) : (
        <>
          {/* Show Stop Session button when session is active */}
          {uiState.session.showStopButton && (
            <div className="w-full flex justify-end mb-2">
              <Button onClick={handleStopSession} variant="destructive" size="sm">
                Stop Session
              </Button>
            </div>
          )}
          
          {/* Resume Session button (when paused) */}
          {uiState.recording.showResumeButton && (
            <div className="w-full flex justify-end mb-2">
              <Button onClick={handleUnpause} variant="default" size="sm">
                Resume Session
              </Button>
            </div>
          )}
          
          {/* Language selection controls - always visible */}
          <LanguageControls 
            mainLanguage={mainLanguage}
            setMainLanguage={setMainLanguage}
            otherLanguage={otherLanguage}
            setOtherLanguage={setOtherLanguage}
            isPremium={isPremium}
            setIsPremium={setIsPremium}
            swapLanguages={swapLanguages}
          />

          {/* Start Session button - only shown on landing page */}
          {uiState.session.showStartButton && (
            <div className="mb-4">
              <Button 
                type="button" 
                onClick={startSessionWithCountdown} 
                size="lg"
                className="px-8 py-6 text-lg"
              >
                Start Session
              </Button>
            </div>
          )}
          
          {/* Show countdown status during countdown */}
          {uiState.session.showCountdown && (
            <div className="text-2xl font-bold text-blue-600 mb-4">
              {status}
            </div>
          )}

          {/* Only show the following elements when session is active */}
          {uiState.session.showMainUI && (
            <>
              {/* Status display showing errors or current status */}
              <StatusDisplay 
                status={status}
                silenceCountdown={silenceCountdown}
                error={error}
              />
              
              {/* Recording control buttons */}
              <RecordingControls
                showPause={uiState.recording.showPauseButton}
                showUnpause={uiState.recording.showUnpauseButton}
                showClearRestart={uiState.recording.showRestartButton}
                isRecording={isRecording}
                isPaused={isPaused}
                handlePause={handlePause}
                handleUnpause={handleUnpause}
                handleClearRestart={handleClearRestart}
                handleManualTranslate={stopRecording}
              />

              {/* Translation display */}
              <TranslationDisplay 
                audioUrl={lastAudioUrl}
                translation={lastTranslation}
                isPlaying={isPlaying}
              />
              
              {/* Audio visualizer */}
              {uiState.recording.showVisualizer && (
                <AudioVisualizer 
                  stream={null} 
                  isVisible={true}
                  analyserNode={analyserNode} 
                />
              )}
            </>
          )}
        </>
      )}

      {/* <div ref={conversationEndRef} /> */}
    </div>
  );
};

export default RealTimeTranslatorApp;