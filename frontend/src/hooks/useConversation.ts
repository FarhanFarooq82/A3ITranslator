import { useCallback } from 'react';
import { ActionType, ConversationItem } from '../context/AppStateContext';
import { useAppState } from './useAppState';


/**
 * Hook for managing conversation history
 * @returns Conversation state and actions
 */
export const useConversation = () => {
  const { state, dispatch } = useAppState();

  // Add conversation items including AI responses
  const addConversationItem = useCallback((
    text: string,
    language: string,
    speaker: string,
    type: 'transcription' | 'translation' | 'ai_response' = 'transcription',
    timestamp?: string,
    aiResponse?: {
      answer_in_audio_language?: string;
      answer_translated?: string;
      answer_with_gestures?: string;
      confidence?: number;
      expertise_area?: string;
    }
  ) => {
    const item: ConversationItem = {
      text,
      language,
      speaker,
      type,
      timestamp: timestamp || new Date().toISOString(),
      aiResponse
    };
    dispatch({
      type: ActionType.ADD_CONVERSATION_ITEM,
      item
    });
  }, [dispatch]);


  const clearConversation = useCallback(() => {
    dispatch({ type: ActionType.CLEAR_CONVERSATION });
  }, [dispatch]);

  return {
    conversation: state.conversation,
    lastTranslation: state.lastTranslation,
    addConversationItem,
    clearConversation
  };
};
