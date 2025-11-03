export interface TranslationApiResponse {
  translation?: string;
  transcription?: string;
  audio_language?: string;
  translation_language?: string;
  translation_audio?: string;
  translation_audio_mime_type?: string;
  timestamp?: string;
}

export interface ConversationMessage {
  text: string;
  language: string;
  speaker: string;
  timestamp: string;
}
