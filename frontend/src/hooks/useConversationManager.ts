import { useState, useCallback } from 'react';

export interface ConversationItem {
  text: string;
  language: string;
  speaker: string;
  timestamp: string;
}

export interface ConversationManager {
  // State
  conversation: ConversationItem[];
  
  // Actions
  addConversationItem: (text: string, language: string, speaker: string, timestamp?: string) => void;
  clearConversation: () => void;
}

/**
 * Hook for managing conversation history
 * @returns Conversation state and actions
 */
export const useConversationManager = (): ConversationManager => {
  const [conversation, setConversation] = useState<ConversationItem[]>([]);

  // Add a new item to the conversation
  const addConversationItem = useCallback((
    text: string, 
    language: string, 
    speaker: string,
    timestamp?: string
  ) => {
    setConversation(prev => [...prev, {
      text,
      language,
      speaker,
      timestamp: timestamp || new Date().toISOString()
    }]);
  }, []);

  // Clear all conversation items
  const clearConversation = useCallback(() => {
    setConversation([]);
  }, []);

  return {
    conversation,
    addConversationItem,
    clearConversation
  };
};
