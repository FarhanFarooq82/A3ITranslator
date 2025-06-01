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
  private onPlaybackComplete?: () => void;
  private currentAudio: HTMLAudioElement | null = null;

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
  }

  playTranslation(audioBlob: Blob, onComplete?: () => void): string {
    this.onPlaybackComplete = onComplete;
    const url = this.createAudioUrl(audioBlob);

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.revokeAudioUrl(url);
    }

    this.currentAudio = new Audio(url);
    this.currentAudio.onended = () => {
      this.revokeAudioUrl(url);
      this.onPlaybackComplete?.();
      this.currentAudio = null;
    };

    this.currentAudio.play();
    return url;
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  b64toBlob(b64Data: string, contentType: string): Blob {
    return b64toBlob(b64Data, contentType);
  }

  createAudioUrl(audioBlob: Blob): string {
    return URL.createObjectURL(audioBlob);
  }

  revokeAudioUrl(url: string): void {
    URL.revokeObjectURL(url);
  }
}

export type { TranslationResponse };
