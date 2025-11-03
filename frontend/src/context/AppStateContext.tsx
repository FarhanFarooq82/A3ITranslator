import React, { useReducer, ReactNode } from 'react';
import { StateEvent, SessionState, OperationState } from '../types/StateEnums';
import { AppState } from '../types/StateManager';
import { 
  syncConversationToBackend, 
  loadConversationFromBackend, 
  getBackendContext, 
  processAudioWithBackendContext 
} from '../services/BackendService';
import { 
  ActionType, 
  Action, 
  ConversationItem 
} from './types';
import { getStateManager } from './stateManager';
import { AppStateContext } from './context';

// Export session and operation state enums
export { SessionState, OperationState };

// Export types from the types file
export { ActionType } from './types';
export type { Action, ConversationItem, ConversationSummary, BackendContext, ComprehensiveAudioResult } from './types';

// Add this at the top of your file - just after imports
let lastOperationState: OperationState | null = null;

// Add this function before the appReducer
function trackOperationStateChange(state: AppState, source: string) {
  if (lastOperationState !== state.operationState) {
    console.log(
      `%cOperation State: ${lastOperationState} => ${state.operationState} (Source: ${source})`,
      'color: #ff5722; font-weight: bold'
    );
    lastOperationState = state.operationState;
  }
}

// Get initial state from our singleton
const initialState = getStateManager().getState();

/**
 * State reducer that maps actions to state machine transitions
 */
function appReducer(state: AppState, action: Action): AppState {
  // Update the singleton StateManager with current state
  const manager = getStateManager();
  manager.updateState(state);
    switch (action.type) {
    // SESSION STATE TRANSITIONS
    case ActionType.START_SESSION:
      manager.dispatch(StateEvent.START_SESSION);
      manager.updateState({
        sessionId: action.id,
        sessionExpiry: action.expiry
      });
      break;
      
    case ActionType.PAUSE_SESSION:
      manager.dispatch(StateEvent.PAUSE_SESSION);
      // When pausing, update the operation state to idle
      manager.updateState({ 
        operationState: OperationState.IDLE,
        analyserNode: null
      });
      break;
      
    case ActionType.RESUME_SESSION:
      manager.dispatch(StateEvent.RESUME_SESSION);
      // When resuming a session, immediately start recording again
      setTimeout(() => {
        // Need to use setTimeout because this is a reducer
        // and we can't dispatch during a reducer
        manager.dispatch(StateEvent.START_COUNTDOWN, { countdown: 3 });
      }, 0);
      break;
      
    case ActionType.REQUEST_END_SESSION:
      manager.dispatch(StateEvent.REQUEST_END_SESSION);
      break;
      
    case ActionType.CONFIRM_END_SESSION:
      manager.dispatch(StateEvent.CONFIRM_END_SESSION);
      // Clear stored session
      localStorage.removeItem('translatorSession');
      break;
      
    case ActionType.CANCEL_END_SESSION:
      manager.dispatch(StateEvent.CANCEL_END_SESSION);
      break;
      
    case ActionType.RESTORE_SESSION:
      manager.dispatch(StateEvent.START_SESSION);
      manager.updateState({
        sessionId: action.id,
        sessionExpiry: action.expiry,
        conversation: action.conversation || [],
        mainLanguage: action.mainLanguage,
        otherLanguage: action.otherLanguage,
        isPremium: action.isPremium,
        sessionState: action.sessionState || SessionState.ACTIVE,
        operationState: OperationState.IDLE,
        statusMessage: 'Session restored. Click Resume to continue recording.'
      });
      break;
      
    case ActionType.SAVE_SESSION:
      if (state.sessionState === SessionState.ACTIVE || 
          state.sessionState === SessionState.PAUSED) {
        const sessionData = {
          sessionId: state.sessionId,
          sessionExpiry: state.sessionExpiry,
          sessionState: state.sessionState,
          mainLanguage: state.mainLanguage,
          otherLanguage: state.otherLanguage,
          isPremium: state.isPremium,
          conversation: state.conversation,
          lastTimestamp: Date.now()
        };
        localStorage.setItem('translatorSession', JSON.stringify(sessionData));
      }
      break;
      
    // OPERATION STATE TRANSITIONS
    case ActionType.START_COUNTDOWN:
      manager.dispatch(StateEvent.START_COUNTDOWN, { countdown: action.count });
      break;
      
    case ActionType.UPDATE_COUNTDOWN:
      manager.dispatch(StateEvent.UPDATE_COUNTDOWN, { countdown: action.count });
      break;
      
    case ActionType.COMPLETE_COUNTDOWN:
      manager.dispatch(StateEvent.COMPLETE_COUNTDOWN);
      break;
      
    case ActionType.START_RECORDING:
      manager.dispatch(StateEvent.START_RECORDING);
      manager.updateState({ analyserNode: action.analyserNode });
      break;
        
    case ActionType.DETECT_SILENCE:
      if (action.countdown === null) {
        manager.updateState({ silenceCountdown: null });
      } else {
        manager.dispatch(StateEvent.DETECT_SILENCE, { countdown: action.countdown });
      }
      break;
      
    case ActionType.STOP_RECORDING:
      manager.dispatch(StateEvent.STOP_RECORDING);
      break;
      
    case ActionType.INVALID_AUDIO:
      manager.dispatch(StateEvent.INVALID_AUDIO, { error: action.error });
      break;
      
    case ActionType.RESET_AUDIO:
      manager.dispatch(StateEvent.RESET_AUDIO);
      break;
      
    case ActionType.START_TRANSLATION:
      manager.dispatch(StateEvent.START_TRANSLATION);
      break;
      
    case ActionType.COMPLETE_TRANSLATION:
      manager.dispatch(StateEvent.COMPLETE_TRANSLATION);
      manager.updateState({
        lastTranslation: action.translation,
        lastAudioUrl: action.audioUrl,
        lastRecordedAudio: null // Clear the recorded audio after successful translation
      });
      break;
      
    case ActionType.START_PLAYBACK:
      manager.dispatch(StateEvent.START_PLAYBACK);
      manager.updateState({ lastAudioUrl: action.url });
      break;
      
    case ActionType.COMPLETE_PLAYBACK:
      manager.dispatch(StateEvent.COMPLETE_PLAYBACK);
      // Auto restart recording if session is active and not paused
      if (state.sessionState === SessionState.ACTIVE ) {
        setTimeout(() => {
          manager.dispatch(StateEvent.START_COUNTDOWN, { countdown: 3 });
        }, 500);
      }
      break;
      
    // ERROR HANDLING
    case ActionType.RECORDING_ERROR:
      manager.dispatch(StateEvent.RECORDING_ERROR, { error: action.error });
      break;
      
    case ActionType.TRANSLATION_ERROR:
      manager.dispatch(StateEvent.TRANSLATION_ERROR, { error: action.error });
      break;
      
    case ActionType.PLAYBACK_ERROR:
      manager.dispatch(StateEvent.PLAYBACK_ERROR, { error: action.error });
      break;
      
    case ActionType.CLEAR_ERROR:
      manager.dispatch(StateEvent.CLEAR_ERROR);
      break;
      
    // RESET ACTIONS
    case ActionType.RESET:
      manager.dispatch(StateEvent.RESET);
      manager.updateState({
        operationState: OperationState.IDLE,
        lastRecordedAudio: null,
        lastAudioUrl: null,
        lastTranslation: '',
        analyserNode: null,
        silenceCountdown: null,
        error: null
      });
      break;
      
    // APP-SPECIFIC ACTIONS
    case ActionType.SET_MAIN_LANGUAGE:
      manager.updateState({ mainLanguage: action.language });
      break;
      
    case ActionType.SET_OTHER_LANGUAGE:
      manager.updateState({ otherLanguage: action.language });
      break;
      
    case ActionType.SET_PREMIUM:
      manager.updateState({ isPremium: action.isPremium });
      break;
      
    case ActionType.SWAP_LANGUAGES:
      manager.updateState({ 
        mainLanguage: state.otherLanguage, 
        otherLanguage: state.mainLanguage 
      });
      break;
      
    case ActionType.ADD_CONVERSATION_ITEM: {
      const newConversation = [...state.conversation, action.item];
      manager.updateState({
        conversation: newConversation
      });
      
      // Auto-sync to backend every 3 messages
      if (newConversation.length % 3 === 0 && state.sessionId) {
        setTimeout(() => {
          // Dispatch sync action - backend functions will be added separately
          console.log(`Auto-syncing conversation to backend for session ${state.sessionId}`);
        }, 1000); // 1 second delay to batch operations
      }
      break;
    }
      
    case ActionType.CLEAR_CONVERSATION:
      manager.updateState({ conversation: [] });
      break;
      
    case ActionType.SET_ANALYZER_NODE:
      manager.updateState({ analyserNode: action.node });
      break;
      
    case ActionType.UPDATE_STATE:
      manager.updateState(action.updates);
      break;
      
    // BACKEND CONVERSATION STORAGE
    case ActionType.SYNC_CONVERSATION_TO_BACKEND:
      manager.updateState({
        statusMessage: 'Syncing conversation to server...'
      });
      
      // Auto-sync conversation to backend
      setTimeout(async () => {
        try {
          await syncConversationToBackend(action.sessionId, state.conversation);
          manager.updateState({
            statusMessage: 'Conversation synced'
          });
        } catch (err) {
          console.error('Sync error:', err);
          manager.updateState({
            statusMessage: 'Sync failed'
          });
        }
      }, 0);
      break;

    case ActionType.CONVERSATION_SYNCED:
      manager.updateState({
        statusMessage: 'Conversation synced successfully'
      });
      break;

    case ActionType.LOAD_CONVERSATION_FROM_BACKEND:
      manager.updateState({
        statusMessage: 'Loading conversation from server...'
      });
      
      // Load conversation from backend
      setTimeout(async () => {
        try {
          const backendData = await loadConversationFromBackend(action.sessionId);
          manager.updateState({
            conversation: backendData.conversation,
            statusMessage: 'Conversation loaded from server'
          });
        } catch (err) {
          console.error('Load error:', err);
          manager.updateState({
            statusMessage: 'Failed to load conversation'
          });
        }
      }, 0);
      break;

    case ActionType.CONVERSATION_LOADED:
      manager.updateState({
        conversation: action.conversation,
        statusMessage: 'Conversation loaded successfully'
      });
      break;

    case ActionType.BACKEND_SYNC_ERROR:
      manager.updateState({
        statusMessage: 'Backend sync error'
      });
      break;

    // AI ASSISTANT WITH BACKEND CONTEXT
    case ActionType.PROCESS_AUDIO_WITH_BACKEND_CONTEXT:
      manager.dispatch(StateEvent.START_TRANSLATION);
      manager.updateState({
        statusMessage: 'Analyzing audio with backend context...'
      });
      
      // Process audio with backend context
      setTimeout(async () => {
        try {
          const result = await processAudioWithBackendContext(action.audioData, action.sessionId);
          
          if (result.intent === 'translation') {
            manager.dispatch(StateEvent.COMPLETE_TRANSLATION);
            manager.updateState({
              lastTranslation: result.translation?.text || '',
              lastAudioUrl: result.translation?.audio_url || null,
              statusMessage: 'Translation complete'
            });
          } else {
            manager.updateState({
              statusMessage: 'Expert assistance provided'
            });
          }
        } catch (err) {
          console.error('Audio analysis error:', err);
          manager.dispatch(StateEvent.TRANSLATION_ERROR, { error: err instanceof Error ? err.message : 'Audio analysis failed' });
          manager.updateState({
            statusMessage: 'Audio analysis failed'
          });
        }
      }, 0);
      break;

    case ActionType.AUDIO_ANALYSIS_COMPLETE: {
      const result = action.result;
      // Always update lastAudioAnalysis for UI
      manager.updateState({ lastAudioAnalysis: result });

      if (result.intent === 'translation') {
        manager.dispatch(StateEvent.COMPLETE_TRANSLATION);
        manager.updateState({
          lastTranslation: result.translation?.text || '',
          lastAudioUrl: result.translation?.audio_url || null,
          statusMessage: 'Translation complete'
        });

        // Auto-add to conversation and sync to backend
        setTimeout(() => {
          const transcriptionItem: ConversationItem = {
            text: result.transcription,
            language: result.spoken_language,
            speaker: 'user',
            timestamp: new Date().toISOString(),
            type: 'transcription'
          };

          const translationItem: ConversationItem = {
            text: result.translation?.text || '',
            language: result.translation?.target_language || '',
            speaker: 'user',
            timestamp: new Date().toISOString(),
            type: 'translation'
          };

          manager.updateState({
            conversation: [...state.conversation, transcriptionItem, translationItem]
          });

          // Auto-sync to backend every 5 messages
          if (state.conversation.length % 5 === 0 && state.sessionId) {
            syncConversationToBackend(state.sessionId, state.conversation);
          }
        }, 0);

      } else if (result.intent === 'assistant_query') {
        // Expert response - NOT added to conversation, but update status and lastAudioAnalysis
        manager.updateState({
          statusMessage: 'Expert assistance provided',
          // lastAudioAnalysis already set above
        });
      }
      break;
    }

    case ActionType.ASSISTANT_RESPONSE_RECEIVED:
      manager.updateState({
        statusMessage: 'Assistant response ready'
      });
      break;

    case ActionType.CLEAR_ASSISTANT_RESPONSE:
      manager.updateState({
        statusMessage: 'Assistant response cleared'
      });
      break;

    case ActionType.GET_BACKEND_CONTEXT:
      manager.updateState({
        statusMessage: 'Getting optimized context from backend...'
      });
      
      setTimeout(async () => {
        try {
          const context = await getBackendContext(action.sessionId);
          manager.updateState({
            statusMessage: `Context ready (${context.tokenEstimate} tokens)`
          });
        } catch (err) {
          console.error('Context error:', err);
          manager.updateState({
            statusMessage: 'Failed to get context'
          });
        }
      }, 0);
      break;

    case ActionType.BACKEND_CONTEXT_READY:
      manager.updateState({
        statusMessage: 'Backend context ready for processing'
      });
      break;
  }
  
  trackOperationStateChange(manager.getState(), action.type);
  // Return the new state
  return manager.getState();
}

// Create the provider component
export const AppStateProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      {children}
    </AppStateContext.Provider>
  );
};
