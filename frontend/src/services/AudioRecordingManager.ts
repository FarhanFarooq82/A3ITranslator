import { AudioService } from './AudioService';
import { SilenceDetectionService } from './SilenceDetectionService';

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
 * Callbacks for recording lifecycle events
 */
export interface RecordingCallbacks {
  /** Called when silence countdown is active with remaining seconds */
  onSilenceCountdown: (countdown: number) => void;
  /** Called when sound is detected after silence (speech resumes) */
  onSoundResumed: () => void;
  /** Called when silence is detected for the configured duration */
  onSilenceComplete: () => void;
}

/**
 * Manager for audio recording operations
 */
export class AudioRecordingManager {
  private audioService: AudioService;
  private silenceDetectionService: SilenceDetectionService;
  private currentAnalyser: AnalyserNode | null = null;
  private audioSamples: Float32Array[] = [];
  private recordingStartTime: number | null = null;
  private audioThreshold = 0.01; // Default sensitivity threshold
  private minimumRecordingMs = 750; // Minimum 0.75 seconds
  
  constructor() {
    this.audioService = new AudioService();
    this.silenceDetectionService = new SilenceDetectionService();
  }

  /**
   * Configure the audio validation settings
   * @param options Configuration options for audio validation
   */
  setAudioValidationOptions(options: AudioValidationOptions) {
    if (options.threshold !== undefined) {
      this.audioThreshold = options.threshold;
    }
    if (options.minimumDuration !== undefined) {
      this.minimumRecordingMs = options.minimumDuration;
    }
  }

  /**
   * Start recording audio with silence detection
   * @param callbacks Functions to call during recording process
   * @returns The analyzer node for visualizations
   */
  async startRecording(callbacks: RecordingCallbacks): Promise<AnalyserNode> {
    this.audioSamples = []; // Clear previous samples
    this.recordingStartTime = Date.now();
    
    const { analyser } = await this.audioService.startRecording();
    this.currentAnalyser = analyser;
    
    // Set up audio sampling
    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    
    const collectSamples = () => {
      if (this.currentAnalyser && this.audioService.isRecording()) {
        this.currentAnalyser.getFloatTimeDomainData(dataArray);
        this.audioSamples.push(new Float32Array(dataArray));
        requestAnimationFrame(collectSamples);
      }
    };
    
    // Start collecting samples
    requestAnimationFrame(collectSamples);
      this.silenceDetectionService.startDetection(
      analyser,
      callbacks.onSilenceCountdown,
      callbacks.onSoundResumed,
      callbacks.onSilenceComplete
    );
    
    return analyser;
  }
  
  /**
   * Get the current analyzer node for audio visualization
   */
  getAnalyserNode(): AnalyserNode | null {
    return this.currentAnalyser;
  }

  /**
   * Check if the recorded audio contains valid speech 
   */
  hasValidAudioContent(): boolean {
    if (this.audioSamples.length === 0) return false;
    
    // Check recording duration
    const recordingDuration = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
    if (recordingDuration < this.minimumRecordingMs) {
      console.log(`Recording too short: ${recordingDuration}ms < ${this.minimumRecordingMs}ms`);
      return false;
    }
    
    // Calculate RMS (Root Mean Square) of audio data
    let sumOfSquares = 0;
    let sampleCount = 0;
    let peakVolume = 0;
    let significantSamples = 0;
    
    // First pass: calculate RMS and find peak volume
    for (const buffer of this.audioSamples) {
      for (let i = 0; i < buffer.length; i++) {
        const sampleValue = buffer[i];
        sumOfSquares += sampleValue * sampleValue;
        peakVolume = Math.max(peakVolume, Math.abs(sampleValue));
        sampleCount++;
        
        // Count samples that are above a minimal threshold
        if (Math.abs(sampleValue) > 0.005) {
          significantSamples++;
        }
      }
    }
    
    if (sampleCount === 0) return false;
    
    const rms = Math.sqrt(sumOfSquares / sampleCount);
    const significantRatio = significantSamples / sampleCount;
    
    console.log(`Audio metrics: RMS=${rms.toFixed(6)}, Peak=${peakVolume.toFixed(6)}, Significant=${(significantRatio*100).toFixed(2)}%, Threshold=${this.audioThreshold}`);
    
    // Consider audio valid if:
    // 1. RMS is above threshold OR
    // 2. Peak volume is significant and we have enough significant samples
    return (
      rms > this.audioThreshold || 
      (peakVolume > this.audioThreshold * 3 && significantRatio > 0.02)
    );
  }

  /**
   * Stop recording and get the audio blob
   * @returns Audio blob if valid speech detected, null otherwise
   */
  async stopRecording(): Promise<Blob | null> {
    this.silenceDetectionService.stop();
    
    // Check if we have valid audio before processing
    if (!this.hasValidAudioContent()) {
      console.log("Audio rejected: No valid speech detected");
      // Don't clear audio context yet, just return null to indicate invalid audio
      return null;
    }
    
    // Reset samples for next recording
    this.audioSamples = [];
    this.recordingStartTime = null;
    
    return await this.audioService.stopRecording();
  }
  
  /**
   * Clean up all resources used by the recording manager
   */
  cleanup(): void {
    this.audioService.cleanup();
    this.silenceDetectionService.stop();
    this.currentAnalyser = null;
    this.audioSamples = [];
    this.recordingStartTime = null;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.audioService.isRecording();
  }
}
