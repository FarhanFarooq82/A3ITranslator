/**
 * PlaybackManager - Handles audio playback functionality for translations
 */
export class PlaybackManager {
  private onPlaybackComplete?: () => void;
  private currentAudio: HTMLAudioElement | null = null;

  /**
   * Play an audio blob and invoke the completion callback when finished
   * @param audioBlob The audio blob to play
   * @param onComplete Callback function to call when playback completes
   * @returns URL to the audio resource
   */
  playAudio(audioBlob: Blob, onComplete?: () => void): string {
    this.onPlaybackComplete = onComplete;
    const url = this.createAudioUrl(audioBlob);

    // Stop any currently playing audio
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

  /**
   * Stop any currently playing audio
   */
  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  /**
   * Create a URL from an audio blob
   * @param audioBlob The audio blob
   * @returns URL to the audio resource
   */
  createAudioUrl(audioBlob: Blob): string {
    return URL.createObjectURL(audioBlob);
  }

  /**
   * Release the resources associated with an audio URL
   * @param url URL to revoke
   */
  revokeAudioUrl(url: string): void {
    URL.revokeObjectURL(url);
  }
}
