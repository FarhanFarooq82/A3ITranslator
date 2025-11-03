import { b64toBlob } from '../utils/blobUtils';

interface TranslationResponse {
  translation?: string;
  transcription?: string;
  audio_language?: string;
  translation_language?: string;
  translation_audio?: string;
  translation_audio_mime_type?: string;
  timestamp?: string;
  // AI Response fields (for direct queries)
  is_direct_query?: boolean;
  ai_response?: {
    answer_in_audio_language?: string;
    answer_translated?: string;
    answer_with_gestures?: string;
    confidence?: number;
    expertise_area?: string;
  };
  // Speaker analysis (with language field)
  speaker_analysis?: {
    gender?: string;
    language?: string;
    estimated_age_range?: string;
    is_known_speaker?: boolean;
    speaker_identity?: string;
    confidence?: number;
  };
}

export class TranslationService {
  private backendApiUrl: string;
  private originalAudioBlob: Blob | null = null; // Store original audio for potential retry

  constructor(apiUrl: string = 'http://localhost:8000/process-audio') {
    this.backendApiUrl = apiUrl;
  }

  /**
   * Send audio for translation with retry logic for trimmed audio
   * @param audioBlob The audio blob to translate (possibly trimmed)
   * @param mainLanguage The user's main language
   * @param otherLanguage The language to translate to/from
   * @param isPremium Whether the user has premium features
   * @param sessionId The session ID to maintain conversation context
   * @param isRetry Whether this is a retry with original untrimmed audio
   * @returns Translation response from the API
   */
  async sendAudioForTranslation(
    audioBlob: Blob,
    mainLanguage: string,
    otherLanguage: string,
    isPremium: boolean = false,
    sessionId?: string,
    isRetry: boolean = false
  ): Promise<TranslationResponse> {
    // Store original audio on first attempt for potential retry
    if (!isRetry) {
      this.originalAudioBlob = audioBlob;
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('main_language', mainLanguage);
    formData.append('other_language', otherLanguage);
    formData.append('is_premium', isPremium.toString());
    
    // Include session ID if provided to maintain conversation context
    if (sessionId) {
      formData.append('session_id', sessionId);
    }

    try {
      const response = await fetch(this.backendApiUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      // If this was the first attempt with trimmed audio and we got an error related to audio quality
      // Retry with the original untrimmed audio
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!isRetry && 
          this.originalAudioBlob && 
          audioBlob !== this.originalAudioBlob &&
          (errorMessage.includes('audio') || 
           errorMessage.includes('speech') || 
           errorMessage.includes('transcription'))) {
        
        console.log('Translation failed with trimmed audio. Retrying with original audio...');
        return this.sendAudioForTranslation(
          this.originalAudioBlob,
          mainLanguage,
          otherLanguage,
          isPremium,
          sessionId, // pass the session ID
          true // mark as retry
        );
      }
      
      // If we already tried with original audio or error is not related to audio quality, rethrow
      throw error;
    } finally {
      // Clear stored blob if this was a retry or if we're not going to retry
      if (isRetry) {
        this.originalAudioBlob = null;
      }
    }
  } 
  b64toBlob(b64Data: string, contentType: string): Blob {
    return b64toBlob(b64Data, contentType);
  }
}

export type { TranslationResponse };
