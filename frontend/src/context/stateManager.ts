import { StateManager } from '../types/StateManager';
import { languages } from '../constants/languages';

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
        sessionExpiry: null,
        
        // Backend storage state
        isConversationSyncing: false,
        lastSyncTime: undefined,
        backendSyncError: undefined,
        conversationSummary: undefined,
        
        // AI Assistant state
        assistantResponse: undefined,
        assistantAudioUrl: undefined,
        isProcessingAssistantQuery: false,
        lastAudioAnalysis: undefined
      });
    }
    return instance;
  };
})();
