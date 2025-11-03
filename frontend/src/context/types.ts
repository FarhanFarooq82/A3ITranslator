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
  
  // Backend conversation storage actions
  SYNC_CONVERSATION_TO_BACKEND = 'SYNC_CONVERSATION_TO_BACKEND',
  CONVERSATION_SYNCED = 'CONVERSATION_SYNCED',
  LOAD_CONVERSATION_FROM_BACKEND = 'LOAD_CONVERSATION_FROM_BACKEND',
  CONVERSATION_LOADED = 'CONVERSATION_LOADED',
  BACKEND_SYNC_ERROR = 'BACKEND_SYNC_ERROR',
  
  // AI Assistant with backend context
  PROCESS_AUDIO_WITH_BACKEND_CONTEXT = 'PROCESS_AUDIO_WITH_BACKEND_CONTEXT',
  AUDIO_ANALYSIS_COMPLETE = 'AUDIO_ANALYSIS_COMPLETE',
  ASSISTANT_RESPONSE_RECEIVED = 'ASSISTANT_RESPONSE_RECEIVED',
  CLEAR_ASSISTANT_RESPONSE = 'CLEAR_ASSISTANT_RESPONSE',
  
  // Context management
  GET_BACKEND_CONTEXT = 'GET_BACKEND_CONTEXT',
  BACKEND_CONTEXT_READY = 'BACKEND_CONTEXT_READY',
  
  // Direct state updates
  UPDATE_STATE = 'UPDATE_STATE'
}

/**
 * Interface for conversation history items
 */
export interface ConversationItem {
  text: string;
  language: string;
  speaker: string;
  timestamp: string;
  type: 'transcription' | 'translation' | 'ai_response'; // Removed ai_response_translated since translation is embedded
  // AI Response specific fields
  isDirectQuery?: boolean;
  aiResponse?: {
    answer_in_audio_language?: string;
    answer_translated?: string;
    answer_with_gestures?: string;
    confidence?: number;
    expertise_area?: string;
  };
  // Legacy support (deprecated)
  directResponse?: string;
  targetLanguage?: string;
}

/**
 * Interface for conversation summary (for context compression)
 */
export interface ConversationSummary {
  topics: string[];
  keyDecisions: string[];
  domainTerms: string[];
  timeRange: { start: string; end: string };
  messageCount: number;
  tokenEstimate: number;
}

/**
 * Interface for backend context optimization
 */
export interface BackendContext {
  recentMessages: ConversationItem[];
  conversationSummary?: ConversationSummary;
  sessionInfo: {
    duration: number;
    totalMessages: number;
    lastActivity: string;
  };
  tokenEstimate: number;
}

/**
 * Interface for comprehensive audio analysis result
 */
export interface ComprehensiveAudioResult {
  transcription: string;
  spoken_language: string;
  intent: 'translation' | 'assistant_query';
  intent_confidence: number;
  detected_domain?: string;
  conversation_tone?: 'formal' | 'casual' | 'urgent' | 'friendly' | 'professional';
  translation?: {
    text: string;
    target_language: string;
    audio_url?: string;
    context_adjusted: boolean;
  };
  expert_response?: {
    answer: string;
    response_language: string;
    audio_url?: string;
    expertise_area: string;
    confidence: number;
  };
}

/**
 * Union type representing all possible actions
 */
export type Action = 
  // Session actions
  | { type: ActionType.START_SESSION; id: string; expiry: number }
  | { type: ActionType.PAUSE_SESSION }
  | { type: ActionType.RESUME_SESSION }
  | { type: ActionType.REQUEST_END_SESSION }
  | { type: ActionType.CONFIRM_END_SESSION }
  | { type: ActionType.CANCEL_END_SESSION }
  | { type: ActionType.RESTORE_SESSION; id: string; expiry: number; conversation?: ConversationItem[]; mainLanguage: string; otherLanguage: string; isPremium: boolean; sessionState?: import('../types/StateEnums').SessionState }
  | { type: ActionType.SAVE_SESSION }
  
  // Backend storage actions
  | { type: ActionType.SYNC_CONVERSATION_TO_BACKEND; sessionId: string }
  | { type: ActionType.CONVERSATION_SYNCED; success: boolean }
  | { type: ActionType.LOAD_CONVERSATION_FROM_BACKEND; sessionId: string }
  | { type: ActionType.CONVERSATION_LOADED; conversation: ConversationItem[]; contextSummary?: ConversationSummary }
  | { type: ActionType.BACKEND_SYNC_ERROR; error: string }
  
  // AI Assistant actions
  | { type: ActionType.PROCESS_AUDIO_WITH_BACKEND_CONTEXT; audioData: Blob; sessionId: string }
  | { type: ActionType.AUDIO_ANALYSIS_COMPLETE; result: ComprehensiveAudioResult }
  | { type: ActionType.ASSISTANT_RESPONSE_RECEIVED; response: string; audioUrl?: string }
  | { type: ActionType.CLEAR_ASSISTANT_RESPONSE }
  
  // Context actions
  | { type: ActionType.GET_BACKEND_CONTEXT; sessionId: string }
  | { type: ActionType.BACKEND_CONTEXT_READY; context: BackendContext }
  
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
  | { type: ActionType.UPDATE_STATE; updates: Partial<import('../types/StateManager').AppState> };
