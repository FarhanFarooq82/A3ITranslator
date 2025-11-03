import { AudioService } from './AudioService';

/**
 * Configuration options for audio validation
 */
export interface AudioValidationOptions {
  /** Sensitivity threshold for audio detection (0-1) */
  threshold?: number;
  /** Minimum recording duration in milliseconds */
  minimumDuration?: number;
}

/**
 * Actions that recording manager can dispatch
 */
export interface RecordingActions {
  setSilenceCountdown: (countdown: number | null) => void;
  setStatus: (status: string) => void;
  stopRecordingWithTranslation: () => Promise<void>;
}

/**
 * Manager for audio recording operations
 */
export class AudioRecordingManager {
  private audioService: AudioService;
  private currentAnalyser: AnalyserNode | null = null;
  private audioSamples: Float32Array[] = [];
  private recordingStartTime: number | null = null;
  private audioThreshold = 0.01; // Default sensitivity threshold
  private minimumRecordingMs = 750; // Minimum 0.75 seconds
  private recordingActions: RecordingActions | null = null;
  private isRecording = false;
  private processingRequest = false;
  private resourcesCleanedUp = true;
  
  constructor() {
    this.audioService = new AudioService();
    
    // Log instance creation for debugging
    console.log('AudioRecordingManager: Instance created');
  }

  /**
   * Configure the audio validation settings
   * @param options Configuration options for audio validation
   */
  setAudioValidationOptions(options: AudioValidationOptions) {
    console.log(`AudioRecordingManager: Setting validation options - threshold: ${options.threshold}, minDuration: ${options.minimumDuration}ms`);
    
    if (options.threshold !== undefined) {
      this.audioThreshold = options.threshold;
    }
    if (options.minimumDuration !== undefined) {
      this.minimumRecordingMs = options.minimumDuration;
    }
  }
  
  /**
   * Set the recording actions to be called during recording
   * @param actions Object containing actions to call during recording
   */
  setRecordingActions(actions: RecordingActions): void {
    console.log('AudioRecordingManager: Setting recording actions');
    this.recordingActions = actions;
  }

  /**
   * Start recording audio with silence detection
   * @returns The analyzer node for visualizations
   */
  async startRecording(): Promise<AnalyserNode> {
    console.log('AudioRecordingManager: Starting recording');
    
    // Prevent multiple concurrent startRecording calls
    if (this.processingRequest) {
      console.warn('AudioRecordingManager: Already processing a recording request, ignoring');
      throw new Error('Already processing a recording request');
    }
    
    try {
      this.processingRequest = true;
      
      // Make sure we're starting with a clean slate
      if (!this.resourcesCleanedUp) {
        console.log('AudioRecordingManager: Cleaning up resources before starting new recording');
        this.cleanup();
      }
      
      this.audioSamples = []; // Clear previous samples
      this.recordingStartTime = Date.now();
      this.isRecording = true;
      this.resourcesCleanedUp = false;
      
      console.log('AudioRecordingManager: Initializing audio recording');
      const { analyser } = await this.audioService.startRecording();
      this.currentAnalyser = analyser;
      
      // Set up audio sampling
      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);
      
      const collectSamples = () => {
        if (this.isRecording && this.currentAnalyser && this.audioService.isRecording()) {
          try {
            this.currentAnalyser.getFloatTimeDomainData(dataArray);
            this.audioSamples.push(new Float32Array(dataArray));
            requestAnimationFrame(collectSamples);
          } catch (error) {
            console.error('AudioRecordingManager: Error collecting audio samples:', error);
            // Don't request another frame if there was an error
          }
        }
      };
      
      // Start collecting samples
      requestAnimationFrame(collectSamples);

      console.log('AudioRecordingManager: Setting up speech detection callbacks');
      
      // Set up speech callbacks in AudioService instead of using SilenceDetectionService
      this.audioService.setSpeechCallbacks({
        onSpeaking: () => {
          if (this.recordingActions && this.isRecording) {
            console.log('AudioRecordingManager: Speech detected');
            this.recordingActions.setSilenceCountdown(null);
            this.recordingActions.setStatus('Listening...');
          }
        },
        onSilence: (countdown: number | null) => {
          if (this.recordingActions && this.isRecording && countdown !== null) {
            console.log(`AudioRecordingManager: Silence countdown: ${countdown}`);
            this.recordingActions.setSilenceCountdown(countdown);
          }
        },
        onSilenceComplete: async () => {
          // Silence detected, stop recording
          if (this.recordingActions && this.isRecording) {
            console.log('AudioRecordingManager: Complete silence detected, stopping listening');
            this.recordingActions.setSilenceCountdown(null);
            
            // Set this flag to prevent new attempts to start recording while we're stopping
            this.isRecording = false;
            
            try {
              await this.recordingActions.stopRecordingWithTranslation();
            } catch (error) {
              console.error('AudioRecordingManager: Error in stopRecordingWithTranslation:', error);
              // Ensure we reset isRecording if there's an error
              this.isRecording = false;
            }
          }
        }
      });
      
      console.log('AudioRecordingManager: Recording started successfully');
      return analyser;
    } catch (error) {
      console.error('AudioRecordingManager: Error starting recording:', error);
      this.isRecording = false;
      this.cleanup();
      throw error;
    } finally {
      this.processingRequest = false;
    }
  }
  
  /**
   * Get the current analyzer node for audio visualization
   */
  getAnalyserNode(): AnalyserNode | null {
    return this.currentAnalyser;
  }
  
  /**
   * Check if the recorded audio contains valid speech 
   * Enhanced with improved audio quality analysis
   */
  hasValidAudioContent(): boolean {
    if (this.audioSamples.length === 0) {
      console.log('AudioRecordingManager: No audio samples collected');
      return false;
    }
    
    // Check recording duration
    const recordingDuration = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
    if (recordingDuration < this.minimumRecordingMs) {
      console.log(`AudioRecordingManager: Recording too short: ${recordingDuration}ms < ${this.minimumRecordingMs}ms`);
      return false;
    }
    
    // Calculate RMS (Root Mean Square) of audio data
    let sumOfSquares = 0;
    let sampleCount = 0;
    let peakVolume = 0;
    let significantSamples = 0;
    let zeroCrossings = 0;
    let prevSample = 0;
    let consecutiveFlats = 0;
    let maxConsecutiveFlats = 0;
    let dynamicRange = 0;
    
    // Enhanced audio analysis
    for (const buffer of this.audioSamples) {
      for (let i = 0; i < buffer.length; i++) {
        const sampleValue = buffer[i];
        sumOfSquares += sampleValue * sampleValue;
        peakVolume = Math.max(peakVolume, Math.abs(sampleValue));
        sampleCount++;
        
        // Count significant samples (above noise floor)
        if (Math.abs(sampleValue) > 0.005) {
          significantSamples++;
        }
        
        // Count zero-crossings (indicator of audio frequency content)
        if ((prevSample < 0 && sampleValue >= 0) || (prevSample >= 0 && sampleValue < 0)) {
          zeroCrossings++;
        }
        
        // Detect flat regions (indicator of digital silence or clipping)
        if (i > 0 && Math.abs(sampleValue - buffer[i-1]) < 0.0001) {
          consecutiveFlats++;
        } else {
          maxConsecutiveFlats = Math.max(maxConsecutiveFlats, consecutiveFlats);
          consecutiveFlats = 0;
        }
        
        prevSample = sampleValue;
      }
    }
    
    if (sampleCount === 0) return false;
    
    // Calculate advanced audio metrics
    const rms = Math.sqrt(sumOfSquares / sampleCount);
    const significantRatio = significantSamples / sampleCount;
    const zeroCrossingRate = zeroCrossings / sampleCount;
    const flatRatio = maxConsecutiveFlats / sampleCount;
    
    // Sort all samples to calculate dynamic range (difference between quietest and loudest non-zero samples)
    const allSamples = this.audioSamples.flatMap(buffer => Array.from(buffer));
    const nonZeroSamples = allSamples.filter(s => Math.abs(s) > 0.001);
    if (nonZeroSamples.length > 0) {
      nonZeroSamples.sort((a, b) => Math.abs(a) - Math.abs(b));
      const lowest = Math.abs(nonZeroSamples[0]);
      const highest = Math.abs(nonZeroSamples[nonZeroSamples.length - 1]);
      dynamicRange = highest / (lowest || 0.001); // Avoid division by zero
    }
    
    console.log(`AudioRecordingManager: Enhanced audio metrics: RMS=${rms.toFixed(6)}, Peak=${peakVolume.toFixed(6)}, ` +
                `Significant=${(significantRatio*100).toFixed(2)}%, ZeroCrossings=${zeroCrossingRate.toFixed(4)}, ` +
                `FlatRatio=${flatRatio.toFixed(4)}, DynamicRange=${dynamicRange.toFixed(1)}, Threshold=${this.audioThreshold}`);
    
    // Enhanced decision logic:
    // 1. Base checks for volume (RMS and peak amplitude)
    const volumeCheck = rms > this.audioThreshold || 
                        (peakVolume > this.audioThreshold * 3 && significantRatio > 0.02);
    
    // 2. Check for normal speech pattern indicators (speech typically has 0.01-0.1 zero crossing rate)
    const speechPatternCheck = zeroCrossingRate > 0.005 && zeroCrossingRate < 0.15;
    
    // 3. Check for unnatural patterns (like digital silence, consistent noise, or tones)
    const naturalSoundCheck = flatRatio < 0.1 && dynamicRange > 2.0;
    
    const isValid = volumeCheck && speechPatternCheck && naturalSoundCheck;
    console.log(`AudioRecordingManager: Audio validation result: ${isValid ? 'VALID' : 'INVALID'} audio content`);
    
    // Return true only if all checks pass
    return isValid;
  }
  
  /**
   * Check if the manager is currently recording
   */
  getRecordingState(): boolean {
    return this.isRecording && this.audioService.isRecording();
  }
  
  /**
   * Stop recording and get the audio blob
   * @returns Audio blob if valid speech detected, null otherwise
   */
  async stopRecording(): Promise<Blob | null> {
    console.log('AudioRecordingManager: Stopping recording');
    
    // Prevent stopping if already stopped
    if (!this.isRecording && !this.audioService.isRecording()) {
      console.warn('AudioRecordingManager: Not currently recording, ignoring stop request');
      return null;
    }
    
    // Prevent multiple concurrent stopRecording calls
    if (this.processingRequest) {
      console.warn('AudioRecordingManager: Already processing a recording request, ignoring');
      return null;
    }
    
    try {
      this.processingRequest = true;
      this.isRecording = false;
      
      // Get the audio blob
      console.log('AudioRecordingManager: Stopping audio service recording');
      const audioBlob = await this.audioService.stopRecording();
      
      // If no blob was returned, return null
      if (!audioBlob) {
        console.log('AudioRecordingManager: No audio blob was returned');
        return null;
      }
      
      console.log(`AudioRecordingManager: Original audio blob size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      
      if (audioBlob.size === 0) {
        console.warn('AudioRecordingManager: Warning: Original audio blob is empty (0 bytes)');
        return null;
      }

      // For now, we skip trimming since we no longer have SilenceDetectionService
      // Future: Implement a trimSilence function in AudioService if needed
      
      // Check if speech was detected using Hark's real-time detection
      const speechWasDetected = this.audioService.hasSpeechDetected();
      
      if (speechWasDetected) {
        // Return the audio blob if speech was detected during recording
        console.log('AudioRecordingManager: Speech was detected during recording, returning audio blob');
        return audioBlob;
      } else {
        console.log('AudioRecordingManager: Audio rejected: No speech detected during recording');
        
        // Update status if we have actions available
        if (this.recordingActions) {
          this.recordingActions.setStatus('No speech detected. Please try again.');
        }
        
        return null;
      }
    } catch (error) {
      console.error('AudioRecordingManager: Error in stopRecording:', error);
      return null;
    } finally {
      // Reset samples for next recording
      this.audioSamples = [];
      this.recordingStartTime = null;
      this.processingRequest = false;
    }
  }
  
  /**
   * Clean up all resources used by the recording manager
   */
  cleanup(): void {
    console.log('AudioRecordingManager: Cleaning up resources');
    
    this.isRecording = false;
    this.audioService.cleanup();
    this.currentAnalyser = null;
    this.audioSamples = [];
    this.recordingStartTime = null;
    this.resourcesCleanedUp = true;
    
    console.log('AudioRecordingManager: Resource cleanup complete');
  }
}
