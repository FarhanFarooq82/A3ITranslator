import { useCallback } from 'react';
import { ActionType, ConversationItem } from '../context/AppStateContext';
import { useAppState } from './useAppState';


/**
 * Hook for managing conversation history
 * @returns Conversation state and actions
 */
export const useConversation = () => {
  const { state, dispatch } = useAppState();

  // Only add to conversation if type is 'translation' or 'transcription' (not assistant_query)
  const addConversationItem = useCallback((
    text: string,
    language: string,
    speaker: string,
    type: 'transcription' | 'translation' | 'assistant_query' = 'transcription',
    timestamp?: string
  ) => {
    if (type === 'assistant_query') {
      // Do not add direct LLM queries to conversation history
      return;
    }
    const item: ConversationItem = {
      text,
      language,
      speaker,
      type: type as 'transcription' | 'translation',
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
