/**
 * Represents the overall session state
 */
export enum SessionState {
  IDLE = 'idle',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ENDING_CONFIRMATION = 'ending_confirmation',
  ENDED = 'ended'
}

/**
 * Represents the current operation being performed
 */
export enum OperationState {
  IDLE = 'idle',                // Waiting for action
  PREPARING = 'preparing',      // When counting down or initializing
  RECORDING = 'recording',      // When actively recording audio
  PROCESSING = 'processing',    // When analyzing/validating audio
  VALIDATION_FAILED = 'validation_failed', // When audio validation fails
  TRANSLATING = 'translating',  // When sending to API and waiting
  PLAYING = 'playing',          // When playing back audio
  ERROR = 'error'               // Error state
}

/**
 * Represents a state transition event
 */
export enum StateEvent {
  // Session events
  START_SESSION = 'start_session',
  PAUSE_SESSION = 'pause_session',
  RESUME_SESSION = 'resume_session',
  REQUEST_END_SESSION = 'request_end_session',
  CONFIRM_END_SESSION = 'confirm_end_session',
  CANCEL_END_SESSION = 'cancel_end_session',
  
  // Operation events
  START_COUNTDOWN = 'start_countdown',
  UPDATE_COUNTDOWN = 'update_countdown',
  COMPLETE_COUNTDOWN = 'complete_countdown',
  START_RECORDING = 'start_recording',
  DETECT_SILENCE = 'detect_silence',
  STOP_RECORDING = 'stop_recording',
  START_TRANSLATION = 'start_translation',
  COMPLETE_TRANSLATION = 'complete_translation',
  START_PLAYBACK = 'start_playback',
  COMPLETE_PLAYBACK = 'complete_playback',
    // Error events
  RECORDING_ERROR = 'recording_error',
  TRANSLATION_ERROR = 'translation_error',
  PLAYBACK_ERROR = 'playback_error',
  INVALID_AUDIO = 'invalid_audio',
  
  // Reset events
  CLEAR_ERROR = 'clear_error',
  RESET = 'reset',
  RESET_AUDIO = 'reset_audio',
  
  // Direct state update (for complex state changes)
  UPDATE_STATE = 'update_state'
}
