import { useCallback } from 'react';
import { useAppState, ActionType, ConversationItem } from '../context/AppStateContext';

/**
 * Hook for managing conversation history
 * @returns Conversation state and actions
 */
export const useConversation = () => {
  const { state, dispatch } = useAppState();

  const addConversationItem = useCallback((
    text: string, 
    language: string, 
    speaker: string,
    timestamp?: string
  ) => {
    const item: ConversationItem = {
      text,
      language,
      speaker,
      timestamp: timestamp || new Date().toISOString()
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
