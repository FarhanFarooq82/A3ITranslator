import { useRef, useEffect, useState } from 'react';
import { Button } from './ui/button';
import ConversationHistory from './ConversationHistory';
import { SessionDialog } from './SessionDialog';
import { TranslationDisplay } from './TranslationDisplay';
import AudioVisualizer from './AudioVisualizer';
import LanguageControls from './LanguageControls';
import StatusDisplay from './StatusDisplay';
import RecordingControls from './RecordingControls';
import { WelcomeMessage } from './WelcomeMessage';

// Import hooks
import { useSession } from '../hooks/useSession';
import { useLanguage } from '../hooks/useLanguage';
import { useRecording } from '../hooks/useRecording';
import { useConversation } from '../hooks/useConversation';
import { useAppState, SessionState, OperationState } from '../context/AppStateContext';

export const RealTimeTranslatorApp = () => {
  // Use our hooks
  const session = useSession();
  const language = useLanguage();
  const recording = useRecording();
  const conversation = useConversation();
  const { state } = useAppState();
  
  // Add welcome message state
  const [showWelcome, setShowWelcome] = useState(false);
  
  // Debug session state changes
  useEffect(() => {
    console.log('Session state changed:', state.sessionState);
    console.log('Operation state changed:', state.operationState);
  }, [state.sessionState, state.operationState]);
  
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Keep conversation scrolled to bottom
  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation.conversation]);
  // Simplified session and UI control functions
  
  const startSessionWithCountdown = () => {
    // Show welcome message first
    setShowWelcome(true);
  };
  
  // Called when welcome message is complete
  const handleWelcomeComplete = () => {
    console.log('Welcome message complete, starting session and recording');
    setShowWelcome(false);
    
    // Start the actual session
    session.startSession();
    
    // Add a small delay before starting recording to ensure state transitions properly
    setTimeout(() => {
      console.log('Starting recording after session initialization, current session state:', state.sessionState);
      if (state.sessionState === SessionState.ACTIVE) { // Only start recording if session is active
        recording.startRecording();
      } else {
        console.warn('Session state is not ACTIVE after welcome message completion, current state:', state.sessionState);
        // Try to recover by forcing the session state to ACTIVE
        console.log('Attempting to recover by starting session again...');
        session.startSession();
        setTimeout(() => {
          console.log('Recovery attempt - session state:', state.sessionState);
          recording.startRecording();
        }, 200);
      }
    }, 300); // Increase the delay to ensure state is updated
  };
  
  // Called when user skips the welcome message
  const handleWelcomeSkip = () => {
    console.log('Welcome message skipped, starting session and recording');
    setShowWelcome(false);
    
    // Start the actual session
    session.startSession();
    
    // Add a small delay before starting recording to ensure state transitions properly
    setTimeout(() => {
      console.log('Starting recording after session initialization (skipped), current session state:', state.sessionState);
      if (state.sessionState === SessionState.ACTIVE) { // Only start recording if session is active
        recording.startRecording();
      } else {
        console.warn('Session state is not ACTIVE after skipping welcome message, current state:', state.sessionState);
        // Try to recover by forcing the session state to ACTIVE
        console.log('Attempting to recover by starting session again...');
        session.startSession();
        setTimeout(() => {
          console.log('Recovery attempt - session state:', state.sessionState);
          recording.startRecording();
        }, 200);
      }
    }, 300); // Increase the delay to ensure state is updated
  };

  // Clear/Restart logic with cleaner implementation
  const handleClearRestart = () => {
    recording.resetRecording(); // Uses default callbacks from the hook
  };

  // Handle manual translation
  const handleManualTranslate = async () => {
    await recording.stopRecordingAndTranslate();
  };
  // Organized UI state for easier maintenance
  const viewState = {
    session: {
      showStartButton: (state.sessionState === SessionState.IDLE || state.sessionState === SessionState.ENDED) && state.operationState !== OperationState.PREPARING,
      showStopButton: state.sessionState === SessionState.ACTIVE || state.sessionState === SessionState.PAUSED,
      showConfirmDialog: state.sessionState === SessionState.ENDING_CONFIRMATION,
      showCountdown: state.operationState === OperationState.PREPARING,
      showMainUI: state.sessionState === SessionState.ACTIVE || state.sessionState === SessionState.PAUSED
    },
    recording: {
      showPauseButton: state.operationState === OperationState.RECORDING && state.sessionState === SessionState.ACTIVE,
      showUnpauseButton: state.sessionState === SessionState.PAUSED,
      showResumeButton: state.sessionState === SessionState.ACTIVE &&
                      state.operationState === OperationState.IDLE &&
                      !!state.sessionId,
      showResumeFromPause: state.sessionState === SessionState.PAUSED,
      showRestartButton: state.operationState === OperationState.RECORDING && state.sessionState === SessionState.ACTIVE,
      showVisualizer: state.operationState === OperationState.RECORDING &&
                     state.sessionState === SessionState.ACTIVE &&
                     !!state.analyserNode
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">A3I Translator</h1>

      {/* Welcome message component */}
      {showWelcome && (
        <WelcomeMessage
          mainLanguage={language.mainLanguage}
          targetLanguage={language.otherLanguage}
          isPremium={state.isPremium}
          onComplete={handleWelcomeComplete}
          onSkip={handleWelcomeSkip}
        />
      )}

      {/* Show conversation history only when session is active */}
      {viewState.session.showMainUI && (
        <ConversationHistory
          conversation={conversation.conversation}
          mainLanguage={language.mainLanguage}
          conversationEndRef={conversationEndRef}
        />
      )}
      {viewState.session.showConfirmDialog ? (
        <SessionDialog onCancel={session.cancelEndConfirmation} onConfirm={session.confirmEndSession} />
      ) : !showWelcome && (
        <>
          {/* Show Stop Session button when session is active */}
          {viewState.session.showStopButton && (
            <div className="w-full flex justify-end mb-2">
              <Button onClick={session.showEndConfirmation} variant="destructive" size="sm">
                Stop Session
              </Button>
            </div>
          )}

          {/* Resume Session button (when active but not recording) */}
          {viewState.recording.showResumeButton && (
            <div className="w-full flex justify-end mb-2">
              <Button
                onClick={recording.resumeSessionRecording}
                variant="default"
                size="sm"
                title="Resume recording after browser restart or interruption"
              >
                Resume Recording
              </Button>
            </div>
          )}

          {/* Unpause button when session is paused */}
          {viewState.recording.showResumeFromPause && (
            <div className="w-full flex justify-end mb-2">
              <Button
                onClick={recording.resumeRecording}
                variant="default"
                size="sm"
                title="Continue recording after being paused"
              >
                Unpause Recording
              </Button>
            </div>
          )}

          {/* Language selection controls - always visible */}
          <LanguageControls
            mainLanguage={language.mainLanguage}
            setMainLanguage={language.setMainLanguage}
            otherLanguage={language.otherLanguage}
            setOtherLanguage={language.setOtherLanguage}
            isPremium={language.isPremium}
            setPremium={language.setPremium}
            swapLanguages={language.swapLanguages}
          />

          {/* Start Session button - only shown on landing page */}
          {viewState.session.showStartButton && (
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

          {/* Only show the following elements when session is active */}
          {viewState.session.showMainUI && (
            <>
              {/* Status display showing errors or current status */}
              <StatusDisplay
                status={state.statusMessage}
                silenceCountdown={state.silenceCountdown}
                error={state.error}
              />

              {/* Recording control buttons */}
              <RecordingControls
                showPause={viewState.recording.showPauseButton}
                showUnpause={viewState.recording.showUnpauseButton}
                showClearRestart={viewState.recording.showRestartButton}
                isRecording={state.operationState === OperationState.RECORDING}
                isPaused={state.sessionState === SessionState.PAUSED}
                handlePause={recording.pauseRecording}
                handleUnpause={recording.resumeRecording}
                handleClearRestart={handleClearRestart}
                handleManualTranslate={handleManualTranslate}
              />

              {/* Audio visualizer */}
              {viewState.recording.showVisualizer && (
                <AudioVisualizer
                  stream={null}
                  isVisible={true}
                  analyserNode={state.analyserNode}
                />
              )}

              {/* Translation display */}
              <TranslationDisplay
                audioUrl={state.lastAudioUrl}
                translation={state.lastTranslation}
                isPlaying={state.operationState === OperationState.PLAYING}
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
