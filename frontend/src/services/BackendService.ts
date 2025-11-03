import { ConversationItem, ConversationSummary, BackendContext, ComprehensiveAudioResult } from '../context/AppStateContext';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

/**
 * Backend service for conversation storage and AI assistant functionality
 */

/**
 * Sync conversation to backend storage
 */
export async function syncConversationToBackend(
  sessionId: string, 
  conversation: ConversationItem[]
): Promise<{ success: boolean; lastSyncTime: number }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/conversation/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        conversation,
        timestamp: Date.now()
      }),
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.statusText}`);
    }

    await response.json();
    return {
      success: true,
      lastSyncTime: Date.now()
    };
  } catch (error) {
    console.error('Failed to sync conversation to backend:', error);
    throw error;
  }
}

/**
 * Load conversation from backend storage
 */
export async function loadConversationFromBackend(
  sessionId: string
): Promise<{ conversation: ConversationItem[]; contextSummary?: ConversationSummary }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/conversation/load/${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Load failed: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      conversation: result.conversation || [],
      contextSummary: result.contextSummary
    };
  } catch (error) {
    console.error('Failed to load conversation from backend:', error);
    throw error;
  }
}

/**
 * Get optimized backend context for LLM processing
 */
export async function getBackendContext(sessionId: string): Promise<BackendContext> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/context/optimize/${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Context retrieval failed: ${response.statusText}`);
    }

    const context: BackendContext = await response.json();
    return context;
  } catch (error) {
    console.error('Failed to get backend context:', error);
    throw error;
  }
}

/**
 * Process audio with backend context for comprehensive analysis
 */
export async function processAudioWithBackendContext(
  audioData: Blob,
  sessionId: string
): Promise<ComprehensiveAudioResult> {
  try {
    const formData = new FormData();
    formData.append('audio', audioData, 'recording.wav');
    formData.append('sessionId', sessionId);

    const response = await fetch(`${API_BASE_URL}/api/audio/analyze-comprehensive`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Audio analysis failed: ${response.statusText}`);
    }

    const result: ComprehensiveAudioResult = await response.json();
    return result;
  } catch (error) {
    console.error('Failed to process audio with backend context:', error);
    throw error;
  }
}

/**
 * Generate conversation summary for context compression
 */
export async function generateConversationSummary(
  sessionId: string
): Promise<ConversationSummary> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/context/summarize/${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Summary generation failed: ${response.statusText}`);
    }

    const summary: ConversationSummary = await response.json();
    return summary;
  } catch (error) {
    console.error('Failed to generate conversation summary:', error);
    throw error;
  }
}

/**
 * Delete conversation from backend storage
 */
export async function deleteConversationFromBackend(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/conversation/delete/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Delete failed: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to delete conversation from backend:', error);
    throw error;
  }
}
