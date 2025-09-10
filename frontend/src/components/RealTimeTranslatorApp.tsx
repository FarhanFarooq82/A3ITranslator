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
import { SessionState, OperationState } from '../context/AppStateContext';
import { useAppState } from '../hooks/useAppState';

export const RealTimeTranslatorApp = () => {
  // Use our hooks
  const session = useSession();
  const language = useLanguage();
  const recording = useRecording();
  const conversation = useConversation();
  const { state } = useAppState();

  // State for temporary assistant (direct LLM) response
  const [assistantResponse, setAssistantResponse] = useState<string | null>(null);
  
  // Add welcome message state
  const [showWelcome, setShowWelcome] = useState(false);
  
  // Debug session state changes
  useEffect(() => {
    console.log('Session state changed:', state.sessionState);
    console.log('Operation state changed:', state.operationState);
  }, [state.sessionState, state.operationState]);

  // Listen for new assistant (direct LLM) responses in state
  useEffect(() => {
    // If lastAudioAnalysis is present and intent is 'assistant_query', show assistant response
    const analysis = state.lastAudioAnalysis;
    if (analysis && analysis.intent === 'assistant_query') {
      // Prefer expert_response.answer, fallback to direct_response
      const answer = analysis.expert_response?.answer || analysis.direct_response || '';
      setAssistantResponse(answer);
    } else {
      setAssistantResponse(null);
    }
  }, [state.lastAudioAnalysis]);
  // Clear assistant response when user continues conversation (e.g., new recording/translation)
  useEffect(() => {
    if (state.lastAudioAnalysis && state.lastAudioAnalysis.intent === 'translation') {
      setAssistantResponse(null);
    }
  }, [state.lastAudioAnalysis]);
  
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
    <div className="app-root" style={{ display: 'flex', minHeight: '100vh', background: '#f7f7fa' }}>
      {/* Left: Conversation Panel */}
      <div className="conversation-panel">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">A3I Translator</h1>
        {showWelcome && (
          <WelcomeMessage
            mainLanguage={language.mainLanguage}
            targetLanguage={language.otherLanguage}
            isPremium={state.isPremium}
            onComplete={handleWelcomeComplete}
            onSkip={handleWelcomeSkip}
          />
        )}
        {viewState.session.showMainUI && (
          <>
            {assistantResponse && (
              <div className="mb-4 w-full max-w-xl p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-900 rounded shadow">
                <div className="font-semibold mb-1">Assistant Response</div>
                <div>{assistantResponse}</div>
              </div>
            )}
            <ConversationHistory
              conversation={conversation.conversation}
              mainLanguage={language.mainLanguage}
              conversationEndRef={conversationEndRef}
            />
          </>
        )}
        <div ref={conversationEndRef} />
      </div>
      {/* Right: Controls Panel */}
      <div className="controls-panel">
        {viewState.session.showConfirmDialog ? (
          <SessionDialog onCancel={session.cancelEndConfirmation} onConfirm={session.confirmEndSession} />
        ) : !showWelcome && (
          <>
            {viewState.session.showStopButton && (
              <Button onClick={session.showEndConfirmation} className="session-button">
                Stop Session
              </Button>
            )}
            {viewState.recording.showResumeButton && (
              <Button
                onClick={recording.resumeSessionRecording}
                className="session-button"
                title="Resume recording after browser restart or interruption"
              >
                Resume Recording
              </Button>
            )}
            {viewState.recording.showResumeFromPause && (
              <Button
                onClick={recording.resumeRecording}
                className="session-button"
                title="Continue recording after being paused"
              >
                Unpause Recording
              </Button>
            )}
            <LanguageControls
              mainLanguage={language.mainLanguage}
              setMainLanguage={language.setMainLanguage}
              otherLanguage={language.otherLanguage}
              setOtherLanguage={language.setOtherLanguage}
              isPremium={language.isPremium}
              setPremium={language.setPremium}
              swapLanguages={language.swapLanguages}
            />
            {viewState.session.showStartButton && (
              <Button
                type="button"
                onClick={startSessionWithCountdown}
                className="session-button"
              >
                Start Session
              </Button>
            )}
            {viewState.session.showMainUI && (
              <>
                <StatusDisplay
                  status={state.statusMessage}
                  silenceCountdown={state.silenceCountdown}
                  error={state.error}
                />
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
                {viewState.recording.showVisualizer && (
                  <div className="audio-visualizer-wrapper">
                    <AudioVisualizer
                      stream={null}
                      isVisible={true}
                      analyserNode={state.analyserNode}
                    />
                  </div>
                )}
                <div className="audio-section">
                  <TranslationDisplay
                    audioUrl={state.lastAudioUrl}
                    translation={state.lastTranslation}
                    isPlaying={state.operationState === OperationState.PLAYING}
                  />
                </div>
                {state.sessionState === SessionState.ACTIVE && (
                  <div className="recording-label">Recording...</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RealTimeTranslatorApp;
