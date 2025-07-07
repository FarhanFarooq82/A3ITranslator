import hark from 'hark';

export interface SpeechEvents {
  /** Called when speech is detected */
  onSpeaking?: () => void;
  /** Called with the countdown value when silence is detected */
  onSilence?: (countdown: number) => void;
  /** Called when silence has continued for the threshold duration */
  onSilenceComplete?: () => void;
}

export class AudioService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private activeStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private speechEvents: ReturnType<typeof hark> | null = null;
  private silenceTimeout: number | null = null;
  private silenceCountdown: number | null = null;
  private silenceCountdownInterval: number | null = null;
  private speechCallbacks: SpeechEvents = {};
  private speechDetected = false; // Track if speech was detected during recording


  
  // Constants for silence detection
  private SILENCE_THRESHOLD = -65; // Adjust based on testing
  private SILENCE_DURATION = 3000; // 3 seconds of silence before stopping

  async startRecording(): Promise<{ 
    stream: MediaStream; 
    analyser: AnalyserNode; 
  }> {
    try {
      // Clean up any existing recording
      this.cleanup();
      
      // Reset speech detection state at the beginning of recording
      this.speechDetected = false;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.activeStream = stream;
      
      // Set up audio context and analyser for visualizations
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 2048;
      this.analyserNode = analyser;
      source.connect(analyser);

      // Determine supported MIME type
      const mimeType = this.getSupportedMimeType();
      
      // Set up MediaRecorder
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      // Start recording with small chunks for better responsiveness
      this.mediaRecorder.start(100); // Collect data every 100ms
      console.log(`AudioService: Recording started with mime type ${mimeType}`);
      
      // Set up speech detection with Hark
      this.setupSpeechDetection(stream);
      
      return { stream, analyser };
    } catch (error) {
      console.error('Error starting recording:', error);
      throw new Error('Failed to start recording: ' + error);
    }
  }
  
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    
    console.warn('None of the preferred MIME types are supported, using default');
    return ''; // Let browser choose default
  }
  
  private setupSpeechDetection(stream: MediaStream): void {
    // Set up speech detection with Hark
    this.speechEvents = hark(stream, {
      threshold: this.SILENCE_THRESHOLD,
      interval: 100 // Check every 100ms
    });
    
    // Handle speaking events
    this.speechEvents.on('speaking', () => {
      console.log('AudioService: Speech detected');
      
      // Mark that speech was detected in this recording session
      this.speechDetected = true;
      
      // Clear any existing silence timers
      this.clearSilenceTimers();
      
      // Call the speaking callback if provided
      if (this.speechCallbacks.onSpeaking) {
        this.speechCallbacks.onSpeaking();
      }
    });
    
    // Handle silence events
    this.speechEvents.on('stopped_speaking', () => {
      console.log('AudioService: Speech stopped, starting silence detection');
      
      // Start silence countdown
      this.startSilenceCountdown();
    });
  }
  
  private clearSilenceTimers(): void {
    if (this.silenceTimeout) {
      window.clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    
    if (this.silenceCountdownInterval) {
      window.clearInterval(this.silenceCountdownInterval);
      this.silenceCountdownInterval = null;
    }
    
    // Reset countdown
    this.silenceCountdown = null;
    
    // Update UI if callback provided
    if (this.speechCallbacks.onSilence) {
      this.speechCallbacks.onSilence?.(null as unknown as number);
    }
  }
  
  private startSilenceCountdown(): void {
    this.clearSilenceTimers();
    
    // Set initial countdown value (3 seconds)
    this.silenceCountdown = Math.floor(this.SILENCE_DURATION / 1000);
    
    if (this.speechCallbacks.onSilence) {
      this.speechCallbacks.onSilence(this.silenceCountdown);
    }
    
    // Create interval to update countdown every second
    this.silenceCountdownInterval = window.setInterval(() => {
      if (this.silenceCountdown !== null && this.silenceCountdown > 0) {
        this.silenceCountdown--;
        
        if (this.speechCallbacks.onSilence) {
          this.speechCallbacks.onSilence(this.silenceCountdown);
        }
      } else {
        // Clear interval when countdown reaches zero
        this.clearSilenceTimers();
      }
    }, 1000);
    
    // Set timeout for when silence duration is reached
    this.silenceTimeout = window.setTimeout(() => {
      // Silence duration reached, trigger callback
      if (this.speechCallbacks.onSilenceComplete) {
        console.log('AudioService: Silence complete, triggering callback');
        this.speechCallbacks.onSilenceComplete();
      }
      this.clearSilenceTimers();
    }, this.SILENCE_DURATION);
  }
  
  /**
   * Set callbacks for speech events
   */
  setSpeechCallbacks(callbacks: SpeechEvents): void {
    this.speechCallbacks = { ...callbacks };
  }
  
  /**
   * Checks if speech was detected during the current recording session
   * @returns True if speech was detected, false otherwise
   */
  hasSpeechDetected(): boolean {
    return this.speechDetected;
  }
  
  /**
   * Stop recording and get the audio blob
   * @returns A promise that resolves to the audio blob if recording was successful
   */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('No active recording'));
        return;
      }
      
      // Clear any speech detection timers
      this.clearSilenceTimers();
      
      console.log('AudioService: Stopping recording');
      
      // Create a handler for the stop event
      this.mediaRecorder.onstop = () => {
        if (this.audioChunks.length === 0) {
          console.warn('AudioService: No audio data recorded');
          reject(new Error('No audio data recorded'));
          this.cleanup();
          return;
        }
        
        // Determine MIME type from recorder
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        console.log(`AudioService: Creating blob with MIME type ${mimeType}`);
        
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        
        if (audioBlob.size > 0) {
          console.log(`AudioService: Recording stopped, blob size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
          resolve(audioBlob);
        } else {
          console.error('AudioService: Empty audio recording');
          reject(new Error('Empty audio recording'));
        }
        
        this.cleanup();
      };

      // Some browsers might not trigger the onstop event if there are no data chunks
      // Add a safety timeout to ensure we don't hang
      const stopTimeout = setTimeout(() => {
        if (this.mediaRecorder?.state !== 'inactive') {
          console.warn('AudioService: Stop event never fired, cleaning up');
          
          const audioBlob = this.audioChunks.length > 0
            ? new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' }) 
            : null;
            
          if (audioBlob && audioBlob.size > 0) {
            resolve(audioBlob);
          } else {
            reject(new Error('Failed to get recording blob'));
          }
          
          this.cleanup();
        }
      }, 1000);

      try {
        // Request data before stopping to ensure we get the latest chunks
        // Only request data if recorder is still in recording state
        if (this.mediaRecorder.state === 'recording') {
          try {
            this.mediaRecorder.requestData();
          } catch (e) {
            console.warn('Could not request data before stopping:', e);
          }
        }

        // Stop recording
        this.mediaRecorder.stop();
      } catch (error) {
        clearTimeout(stopTimeout);
        console.error('Error stopping media recorder:', error);
        reject(new Error(`Error stopping recording: ${error}`));
        this.cleanup();
      }
    });
  }

  cleanup(): void {
    console.log('AudioService: Cleaning up resources');
    
    // Clean up speech detection
    if (this.speechEvents) {
      this.speechEvents.stop();
      this.speechEvents = null;
    }
    
    // We don't reset speechDetected here to preserve its value after recording stops
    
    this.clearSilenceTimers();
    
    // Clean up MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.warn('Error stopping media recorder:', e);
      }
    }
    this.mediaRecorder = null;

    // Clean up AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close().catch(err => console.warn('Error closing audio context:', err));
      } catch (e) {
        console.warn('Error closing audio context:', e);
      }
      this.audioContext = null;
    }

    // Clean up MediaStream
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping media track:', e);
        }
      });
      this.activeStream = null;
    }

    this.analyserNode = null;
    this.audioChunks = [];

  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }
}
