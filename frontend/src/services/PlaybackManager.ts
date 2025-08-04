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
    try {
      this.onPlaybackComplete = onComplete;
      console.log('Creating audio URL from blob, size:', audioBlob.size);
      const url = this.createAudioUrl(audioBlob);

      // Stop any currently playing audio
      if (this.currentAudio) {
        console.log('Stopping previous audio');
        this.currentAudio.pause();
        URL.revokeObjectURL(this.currentAudio.src);
        this.currentAudio = null;
      }

      console.log('Creating new Audio element');
      this.currentAudio = new Audio(url);
      
      // Handle successful completion
      this.currentAudio.onended = () => {
        console.log('Audio playback completed normally');
        URL.revokeObjectURL(url);
        if (this.onPlaybackComplete) {
          console.log('Calling completion callback');
          this.onPlaybackComplete();
        }
        this.currentAudio = null;
      };
      
      // Handle playback errors
      this.currentAudio.onerror = (e) => {
        console.error('Audio playback error:', e);
        URL.revokeObjectURL(url);
        if (this.onPlaybackComplete) {
          console.log('Calling completion callback after error');
          this.onPlaybackComplete();
        }
        this.currentAudio = null;
      };

      // Start playback
      console.log('Starting audio playback');
      const playPromise = this.currentAudio.play();
      
      // Handle play promise rejection (common in browsers that restrict autoplay)
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('Audio play promise rejected:', error);
          URL.revokeObjectURL(url);
          if (this.onPlaybackComplete) {
            this.onPlaybackComplete();
          }
          this.currentAudio = null;
        });
      }
      
      return url;
    } catch (error) {
      console.error('Error in playAudio:', error);
      if (onComplete) {
        onComplete();
      }
      return '';
    }
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
