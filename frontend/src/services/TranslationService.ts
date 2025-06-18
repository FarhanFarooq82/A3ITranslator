import { b64toBlob } from '../utils/blobUtils';

interface TranslationResponse {
  translation?: string;
  transcription?: string;
  audio_language?: string;
  translation_language?: string;
  translation_audio?: string;
  translation_audio_mime_type?: string;
  timestamp?: string;
}

export class TranslationService {
  private backendApiUrl: string;

  constructor(apiUrl: string = 'http://localhost:8000/process-audio') {
    this.backendApiUrl = apiUrl;
  }
  async sendAudioForTranslation(
    audioBlob: Blob,
    mainLanguage: string,
    otherLanguage: string,
    isPremium: boolean = false
  ): Promise<TranslationResponse> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('main_language', mainLanguage);
    formData.append('other_language', otherLanguage);
    formData.append('is_premium', isPremium.toString());

    const response = await fetch(this.backendApiUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }  b64toBlob(b64Data: string, contentType: string): Blob {
    return b64toBlob(b64Data, contentType);
  }
}

export type { TranslationResponse };
