import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { languages } from '../constants/languages';
import { StateEvent, SessionState, OperationState } from '../types/StateEnums';
import { StateManager, AppState as StateManagerAppState } from '../types/StateManager';

// Import the AppState from StateManager and extend it
export type AppState = StateManagerAppState;

// Export session and operation state enums
export { SessionState, OperationState };

/**
 * Interface for conversation history items
 */
export interface ConversationItem {
  text: string;
  language: string;
  speaker: string;
  timestamp: string;
}

/**
 * Action types for app state transitions
 * These map directly to StateEvents where possible
 */
export enum ActionType {
  // Session state transitions
  START_SESSION = 'START_SESSION',
  PAUSE_SESSION = 'PAUSE_SESSION', 
  RESUME_SESSION = 'RESUME_SESSION',
  REQUEST_END_SESSION = 'REQUEST_END_SESSION',
  CONFIRM_END_SESSION = 'CONFIRM_END_SESSION',
  CANCEL_END_SESSION = 'CANCEL_END_SESSION',
  
  // Operation state transitions
  START_COUNTDOWN = 'START_COUNTDOWN',
  UPDATE_COUNTDOWN = 'UPDATE_COUNTDOWN',
  COMPLETE_COUNTDOWN = 'COMPLETE_COUNTDOWN',
  START_RECORDING = 'START_RECORDING',
  DETECT_SILENCE = 'DETECT_SILENCE',
  STOP_RECORDING = 'STOP_RECORDING',
  START_TRANSLATION = 'START_TRANSLATION',
  COMPLETE_TRANSLATION = 'COMPLETE_TRANSLATION',
  START_PLAYBACK = 'START_PLAYBACK',
  COMPLETE_PLAYBACK = 'COMPLETE_PLAYBACK',
  
  // Error handling
  RECORDING_ERROR = 'RECORDING_ERROR',
  TRANSLATION_ERROR = 'TRANSLATION_ERROR',
  PLAYBACK_ERROR = 'PLAYBACK_ERROR',
  INVALID_AUDIO = 'INVALID_AUDIO',
  CLEAR_ERROR = 'CLEAR_ERROR',
  
  // Reset actions
  RESET = 'RESET',
  RESET_AUDIO = 'RESET_AUDIO',
  
  // App-specific actions (not direct state events)
  SET_MAIN_LANGUAGE = 'SET_MAIN_LANGUAGE',
  SET_OTHER_LANGUAGE = 'SET_OTHER_LANGUAGE', 
  SET_PREMIUM = 'SET_PREMIUM',
  SWAP_LANGUAGES = 'SWAP_LANGUAGES',
  ADD_CONVERSATION_ITEM = 'ADD_CONVERSATION_ITEM',
  CLEAR_CONVERSATION = 'CLEAR_CONVERSATION',
  SET_ANALYZER_NODE = 'SET_ANALYZER_NODE',
  
  // Browser refresh/close handling
  RESTORE_SESSION = 'RESTORE_SESSION',
  SAVE_SESSION = 'SAVE_SESSION',
  
  // Direct state updates
  UPDATE_STATE = 'UPDATE_STATE'
}

/**
 * Union type representing all possible actions
 */
type Action = 
  // Session actions
  | { type: ActionType.START_SESSION; id: string; expiry: number }
  | { type: ActionType.PAUSE_SESSION }
  | { type: ActionType.RESUME_SESSION }
  | { type: ActionType.REQUEST_END_SESSION }
  | { type: ActionType.CONFIRM_END_SESSION }
  | { type: ActionType.CANCEL_END_SESSION }
  | { type: ActionType.RESTORE_SESSION; id: string; expiry: number; conversation?: ConversationItem[]; mainLanguage: string; otherLanguage: string; isPremium: boolean; sessionState?: SessionState }
  | { type: ActionType.SAVE_SESSION }
  
  // Operation actions
  | { type: ActionType.START_COUNTDOWN; count: number }
  | { type: ActionType.UPDATE_COUNTDOWN; count: number }
  | { type: ActionType.COMPLETE_COUNTDOWN }
  | { type: ActionType.START_RECORDING; analyserNode: AnalyserNode }
  | { type: ActionType.DETECT_SILENCE; countdown: number | null }
  | { type: ActionType.STOP_RECORDING }
  | { type: ActionType.START_TRANSLATION }
  | { type: ActionType.COMPLETE_TRANSLATION; translation: string; audioUrl: string | null }
  | { type: ActionType.START_PLAYBACK; url: string }
  | { type: ActionType.COMPLETE_PLAYBACK }
  
  // Error actions
  | { type: ActionType.RECORDING_ERROR; error: string }
  | { type: ActionType.TRANSLATION_ERROR; error: string }
  | { type: ActionType.PLAYBACK_ERROR; error: string }
  | { type: ActionType.INVALID_AUDIO; error: string }
  | { type: ActionType.CLEAR_ERROR }
  
  // Reset actions
  | { type: ActionType.RESET }
  | { type: ActionType.RESET_AUDIO }
  
  // App-specific actions
  | { type: ActionType.SET_MAIN_LANGUAGE; language: string }
  | { type: ActionType.SET_OTHER_LANGUAGE; language: string }
  | { type: ActionType.SET_PREMIUM; isPremium: boolean }
  | { type: ActionType.SWAP_LANGUAGES }
  | { type: ActionType.ADD_CONVERSATION_ITEM; item: ConversationItem }
  | { type: ActionType.CLEAR_CONVERSATION }
  | { type: ActionType.SET_ANALYZER_NODE; node: AnalyserNode | null }
  | { type: ActionType.UPDATE_STATE; updates: Partial<AppState> };

/**
 * Singleton StateManager instance
 * We use a singleton to maintain consistent state and transition handling
 */
export const getStateManager = (() => {
  let instance: StateManager | null = null;
  
  return () => {
    if (!instance) {
      instance = new StateManager({
        // Language settings 
        mainLanguage: languages[0].value,
        otherLanguage: languages[1].value,
        isPremium: false,
        
        // Conversation data
        conversation: [],
        lastTranslation: '',
        lastAudioUrl: null,
        lastRecordedAudio: null,
        
        // Session info
        sessionId: null,
        sessionExpiry: null
      });
    }
    return instance;
  };
})();

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
      
    case ActionType.ADD_CONVERSATION_ITEM:
      manager.updateState({
        conversation: [...state.conversation, action.item]
      });
      break;
      
    case ActionType.CLEAR_CONVERSATION:
      manager.updateState({ conversation: [] });
      break;
      
    case ActionType.SET_ANALYZER_NODE:
      manager.updateState({ analyserNode: action.node });
      break;
      
    case ActionType.UPDATE_STATE:
      manager.updateState(action.updates);
      break;
  }
  
  trackOperationStateChange(manager.getState(), action.type);
  // Return the new state
  return manager.getState();
}

// Create the context
type AppStateContextType = {
  state: AppState;
  dispatch: React.Dispatch<Action>;
};

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

// Create the provider component
export const AppStateProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      {children}
    </AppStateContext.Provider>
  );
};

// Create a hook to use the context
export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}
