import { SessionState, OperationState, StateEvent } from './StateEnums';

// Debug flag - can be set to false to disable logging
const DEBUG = true;

/**
 * Application state interface
 */
export interface AppState {
  sessionState: SessionState;
  operationState: OperationState;
  countdown: number | null;
  error: string | null;
  statusMessage: string;
  
  // Additional state properties
  mainLanguage: string;
  otherLanguage: string;
  isPremium: boolean;
  
  // Silence detection
  silenceCountdown: number | null;
    // Translation results
  lastTranslation: string;
  lastAudioUrl: string | null;
  lastRecordedAudio: Blob | null;
  
  // Audio visualization
  analyserNode: AnalyserNode | null;
    // Conversation history
  conversation: Array<{ text: string; language: string; speaker: string; timestamp: string; }>;
  
  // Session info
  sessionId: string | null; 
  sessionExpiry: number | null;
}

/**
 * Defines allowed state transitions and their resulting states
 */
const sessionTransitions: Record<SessionState, Partial<Record<StateEvent, SessionState>>> = {
  [SessionState.IDLE]: {
    [StateEvent.START_SESSION]: SessionState.ACTIVE,
  },
  [SessionState.ACTIVE]: {
    [StateEvent.PAUSE_SESSION]: SessionState.PAUSED,
    [StateEvent.REQUEST_END_SESSION]: SessionState.ENDING_CONFIRMATION,
    [StateEvent.RESET]: SessionState.IDLE,
  },
  [SessionState.PAUSED]: {
    [StateEvent.RESUME_SESSION]: SessionState.ACTIVE,
    [StateEvent.REQUEST_END_SESSION]: SessionState.ENDING_CONFIRMATION,
    [StateEvent.RESET]: SessionState.IDLE,
  },
  [SessionState.ENDING_CONFIRMATION]: {
    [StateEvent.CONFIRM_END_SESSION]: SessionState.ENDED,
    [StateEvent.CANCEL_END_SESSION]: SessionState.ACTIVE,
  },
  [SessionState.ENDED]: {
    [StateEvent.RESET]: SessionState.IDLE,
  },
};

const operationTransitions: Record<OperationState, Partial<Record<StateEvent, OperationState>>> = {
  [OperationState.IDLE]: {
    [StateEvent.START_COUNTDOWN]: OperationState.PREPARING,
    [StateEvent.START_RECORDING]: OperationState.RECORDING,
  },
  [OperationState.PREPARING]: {
    [StateEvent.COMPLETE_COUNTDOWN]: OperationState.RECORDING,
    [StateEvent.RESET]: OperationState.IDLE,
  },
  [OperationState.RECORDING]: {
    [StateEvent.STOP_RECORDING]: OperationState.PROCESSING,
    [StateEvent.RECORDING_ERROR]: OperationState.ERROR,
    [StateEvent.RESET_AUDIO]: OperationState.IDLE,
    [StateEvent.RESET]: OperationState.IDLE,
  },  
  [OperationState.PROCESSING]: {
    [StateEvent.START_TRANSLATION]: OperationState.TRANSLATING,
    [StateEvent.INVALID_AUDIO]: OperationState.VALIDATION_FAILED,
    [StateEvent.RESET]: OperationState.IDLE,
  },
  [OperationState.VALIDATION_FAILED]: {
    [StateEvent.RESET_AUDIO]: OperationState.PREPARING,
    [StateEvent.RESET]: OperationState.IDLE,
  },
  [OperationState.TRANSLATING]: {
    [StateEvent.COMPLETE_TRANSLATION]: OperationState.PLAYING,
    [StateEvent.TRANSLATION_ERROR]: OperationState.ERROR,
    [StateEvent.RESET]: OperationState.IDLE,
  },
  [OperationState.PLAYING]: {
    [StateEvent.COMPLETE_PLAYBACK]: OperationState.IDLE,
    [StateEvent.PLAYBACK_ERROR]: OperationState.ERROR,
    [StateEvent.RESET]: OperationState.IDLE,
  },
  [OperationState.ERROR]: {
    [StateEvent.CLEAR_ERROR]: OperationState.IDLE,
    [StateEvent.RESET]: OperationState.IDLE,
  },
};

/**
 * Payload for state events that need additional data
 */
export interface StateEventPayload {
  countdown?: number;
  error?: string;
  statusMessage?: string;
  [key: string]: unknown;
}

/**
 * Manages state transitions according to defined rules
 */
export class StateManager {
  private state: AppState;
  
  constructor(initialState?: Partial<AppState>) {
    this.state = {
      // State machine states
      sessionState: SessionState.IDLE,
      operationState: OperationState.IDLE,
      countdown: null,
      error: null,
      statusMessage: 'Ready',
      
      // App-specific states
      mainLanguage: '',
      otherLanguage: '',
      isPremium: false,
      silenceCountdown: null,
      lastTranslation: '',
      lastAudioUrl: null,
      lastRecordedAudio: null,
      analyserNode: null,
      conversation: [],
      sessionId: null,
      sessionExpiry: null,
      
      // Override with provided initial state
      ...initialState
    };
  }
  
  /**
   * Process an event and update state accordingly
   */  
  dispatch(event: StateEvent, payload?: StateEventPayload): AppState {
    // Create a snapshot of the state before any changes
    const prevState = { ...this.state };
    const prevSessionState = this.state.sessionState;
    const prevOperationState = this.state.operationState;
    
    // Get stack trace to track where dispatch was called from
    let stackTrace = '';
    if (DEBUG) {
      // Get stack trace without throwing an error
      const stack = new Error().stack || '';
      stackTrace = stack.split('\n').slice(2).join('\n');
    }
    
    // Debug log for dispatch call
    if (DEBUG) {
      const payloadStr = payload ? JSON.stringify(payload, (key, value) => {
        // Handle circular references and complex objects
        if (key === 'analyserNode' && value !== null) return '[AnalyserNode]';
        if (key === 'lastRecordedAudio' && value !== null) return '[Blob]';
        return value;
      }, 2) : 'undefined';
      
      console.group(`🔄 StateManager.dispatch: ${event} (${this.getEventName(event)})`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log(`Previous SessionState: ${prevSessionState}`);
      console.log(`Previous OperationState: ${prevOperationState}`);
      console.log(`Event: ${this.getEventName(event)} (${event})`);
      console.log(`Payload:`, payloadStr);
      console.log(`Called from:`);
      console.log(stackTrace);
    }

    // Handle special case for direct state updates
    if (event === StateEvent.UPDATE_STATE && payload) {
      const result = this.updateState(payload);
      
      // Debug log for state after UPDATE_STATE
      if (DEBUG) {
        console.log(`📊 After UPDATE_STATE - SessionState: ${this.state.sessionState}, OperationState: ${this.state.operationState}`);
        const differences = this.getStateDifferences(prevState, this.state);
        console.log(`State changes:`, differences);
        console.groupEnd();
      }
      
      return result;
    }
    
    // Update session state if there's a valid transition
    const nextSessionState = sessionTransitions[this.state.sessionState]?.[event];
    if (nextSessionState) {
      if (DEBUG && this.state.sessionState !== nextSessionState) {
        console.log(`🔷 Session state transition: ${this.state.sessionState} -> ${nextSessionState}`);
      }
      
      this.state.sessionState = nextSessionState;
      
      // Update related session data when state changes
      this.updateRelatedStates();
    }
    
    // Update operation state if there's a valid transition
    const nextOperationState = operationTransitions[this.state.operationState]?.[event];
    if (nextOperationState) {
      // Log operation state changes
      if (DEBUG && this.state.operationState !== nextOperationState) {
        console.log(`🔶 Operation state transition: ${this.state.operationState} -> ${nextOperationState}`);
      }
      
      this.state.operationState = nextOperationState;
    }
    
    // Handle special case events
    this.handleSpecialEvents(event, payload);
    
    // Update status message based on new states
    this.updateStatusMessage();
    
    // Debug log for final state after all processing
    if (DEBUG) {
      console.log(`📊 Final state after dispatch - SessionState: ${this.state.sessionState}, OperationState: ${this.state.operationState}`);
      const differences = this.getStateDifferences(prevState, this.state);
      console.log(`State changes:`, differences);
      console.groupEnd();
    }
    
    return { ...this.state };
  }
  
  /**
   * Get current state
   */
  getState(): AppState {
    return { ...this.state };
  }
  
  /**
   * Update a specific state property
   */
  updateState(updates: Partial<AppState>): AppState {
    if (DEBUG) {
      const prevState = { ...this.state };
      
      // Get stack trace to track where updateState was called from
      let stackTrace = '';
      // Get stack trace without throwing an error
      const stack = new Error().stack || '';
      stackTrace = stack.split('\n').slice(2).join('\n');
      
      console.group(`🔄 StateManager.updateState()`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log(`Previous SessionState: ${prevState.sessionState}`);
      console.log(`Previous OperationState: ${prevState.operationState}`);
      
      // Log if any important state is changing
      if (updates.sessionState && updates.sessionState !== prevState.sessionState) {
        console.log(`🔷 Direct session state update: ${prevState.sessionState} -> ${updates.sessionState}`);
      }
      
      if (updates.operationState && updates.operationState !== prevState.operationState) {
        console.log(`🔶 Direct operation state update: ${prevState.operationState} -> ${updates.operationState}`);
      }
      
      console.log(`Updates:`, this.getSafeObject(updates));
      console.log(`Called from:`);
      console.log(stackTrace);
      
      this.state = { ...this.state, ...updates };
      
      console.log(`📊 State after update - SessionState: ${this.state.sessionState}, OperationState: ${this.state.operationState}`);
      const differences = this.getStateDifferences(prevState, this.state);
      console.log(`State changes:`, differences);
      console.groupEnd();
    } else {
      this.state = { ...this.state, ...updates };
    }
    
    return { ...this.state };
  }
  
  /**
   * Handle special case events that need custom logic
   */
  private handleSpecialEvents(event: StateEvent, payload?: StateEventPayload): void {
    switch (event) {
      case StateEvent.RESET:
        this.state.countdown = null;
        this.state.error = null;
        this.state.silenceCountdown = null;
        break;
        
      case StateEvent.RECORDING_ERROR:
      case StateEvent.TRANSLATION_ERROR:
      case StateEvent.PLAYBACK_ERROR:
        if (payload?.error) {
          this.state.error = payload.error;
        }
        break;
        
      case StateEvent.START_COUNTDOWN:
        this.state.countdown = payload?.countdown ?? 3; // Default countdown value
        break;
        
      case StateEvent.UPDATE_COUNTDOWN:
        this.state.countdown = payload?.countdown ?? this.state.countdown;
        if (this.state.countdown === 0) {
          this.dispatch(StateEvent.COMPLETE_COUNTDOWN);
        }
        break;
        
      case StateEvent.COMPLETE_COUNTDOWN:
        this.state.countdown = null;
        break;
        
      case StateEvent.DETECT_SILENCE:
        // Update silence countdown
        if (payload?.countdown !== undefined) {
          this.state.silenceCountdown = payload.countdown;
        }
        break;
    }
    
    // Apply any additional payload changes directly
    if (payload) {
      // Exclude properties we've already handled
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { countdown: _, error: __, statusMessage: ___, ...restPayload } = payload;
      if (Object.keys(restPayload).length > 0) {
        this.updateState(restPayload);
      }
    }
  }
    /**
   * Helper methods to check current state
   */
  isRecording(): boolean {
    return this.state.operationState === OperationState.RECORDING;
  }

  isPaused(): boolean {
    return this.state.sessionState === SessionState.PAUSED;
  }

  isPlaying(): boolean {
    return this.state.operationState === OperationState.PLAYING;
  }

  isProcessing(): boolean {
    return this.state.operationState === OperationState.PROCESSING || 
           this.state.operationState === OperationState.TRANSLATING;
  }

  isSessionActive(): boolean {
    return this.state.sessionState === SessionState.ACTIVE;
  }

  isShowingEndConfirmation(): boolean {
    return this.state.sessionState === SessionState.ENDING_CONFIRMATION;
  }
  
  /**
   * Update related state flags based on session state changes
   */
  private updateRelatedStates(): void {
    const { sessionState } = this.state;
    
    // Update session-related data
    switch (sessionState) {
      case SessionState.IDLE:
        this.state.sessionId = null;
        this.state.sessionExpiry = null;
        break;
      case SessionState.ENDED:
        // Clear session data when ended
        this.state.sessionId = null;
        this.state.sessionExpiry = null;
        break;
    }
  }
    // We removed this method as it's no longer needed
  // All state can be derived from enums using helper methods
  
  /**
   * Update status message based on current state
   */
  private updateStatusMessage(): void {
    // If there's an explicit status message from a payload, don't override it
    if (this.state.statusMessage.startsWith('Error:')) {
      return;
    }
    
    const { sessionState, operationState, error, countdown, silenceCountdown } = this.state;
    
    if (error) {
      this.state.statusMessage = `Error: ${error}`;
      return;
    }
    
    if (sessionState === SessionState.IDLE) {
      this.state.statusMessage = 'Ready to start';
      return;
    }
    
    if (sessionState === SessionState.ENDED) {
      this.state.statusMessage = 'Session ended';
      return;
    }
    
    if (sessionState === SessionState.PAUSED) {
      this.state.statusMessage = 'Paused';
      return;
    }
    
    // Show countdown if present
    if (countdown !== null) {
      this.state.statusMessage = `Starting in ${countdown}...`;
      return;
    }
    
    // Show silence countdown if present
    if (silenceCountdown !== null) {
      this.state.statusMessage = `Silence detected, stopping in ${silenceCountdown}...`;
      return;
    }
    
    // For active session, message depends on operation
    switch (operationState) {
      case OperationState.PREPARING:
        this.state.statusMessage = 'Preparing...';
        break;
      case OperationState.RECORDING:
        this.state.statusMessage = 'Recording...';
        break;      
      case OperationState.PROCESSING:
        this.state.statusMessage = 'Processing audio...';
        break;
      case OperationState.VALIDATION_FAILED:
        this.state.statusMessage = error || 'No speech detected. Please try again.';
        break;
      case OperationState.TRANSLATING:
        this.state.statusMessage = 'Translating...';
        break;
      case OperationState.PLAYING:
        this.state.statusMessage = 'Playing translation...';
        break;
      case OperationState.ERROR:
        this.state.statusMessage = 'Error occurred';
        break;
      default:
        this.state.statusMessage = 'Ready';
    }
  }
  
  /**
   * Helper to get a human-readable name for a StateEvent
   */
  private getEventName(event: StateEvent): string {
    // Map the numeric enum values back to their string names
    const eventNames: Record<string, string> = {};
    Object.keys(StateEvent).forEach(key => {
      const value = StateEvent[key as keyof typeof StateEvent];
      if (typeof value === 'string') {
        eventNames[value] = key;
      }
    });
    
    return eventNames[event] || event.toString();
  }
  
  /**
   * Creates a safe object for logging that handles special cases
   */
  private getSafeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const safeObj: Record<string, unknown> = {};
    
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      
      // Handle special cases
      if (key === 'analyserNode') {
        safeObj[key] = value === null ? 'null' : '[AnalyserNode]';
      } else if (key === 'lastRecordedAudio') {
        safeObj[key] = value === null ? 'null' : '[Blob]';
      } else if (Array.isArray(value)) {
        safeObj[key] = `Array (length: ${value.length})`;
      } else {
        safeObj[key] = value;
      }
    });
    
    return safeObj;
  }
  
  /**
   * Compare two states and return an object describing the differences
   * for logging purposes only
   */
  private getStateDifferences(prevState: AppState, currentState: AppState): Record<string, unknown> {
    const diff: Record<string, unknown> = {};
    
    Object.keys(currentState).forEach(key => {
      const typedKey = key as keyof AppState;
      const prevValue = prevState[typedKey];
      const currentValue = currentState[typedKey];
      
      // Handle special cases for complex objects
      if (typedKey === 'analyserNode') {
        if ((prevValue === null && currentValue !== null) || 
            (prevValue !== null && currentValue === null)) {
          diff[key] = currentValue === null ? 'null' : '[AnalyserNode]';
        }
        return;
      }
      
      if (typedKey === 'lastRecordedAudio') {
        if ((prevValue === null && currentValue !== null) || 
            (prevValue !== null && currentValue === null)) {
          diff[key] = currentValue === null ? 'null' : '[Blob]';
        }
        return;
      }
      
      // For arrays (like conversation), do a shallow string comparison
      if (Array.isArray(prevValue) && Array.isArray(currentValue)) {
        if (JSON.stringify(prevValue) !== JSON.stringify(currentValue)) {
          diff[key] = `Array (length: ${currentValue.length})`;
        }
        return;
      }
      
      // For simple values, compare directly
      if (prevValue !== currentValue) {
        diff[key] = currentValue;
      }
    });
    
    return diff;
  }
}
