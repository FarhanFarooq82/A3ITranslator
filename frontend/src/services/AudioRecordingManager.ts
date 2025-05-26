import { AudioService } from './AudioService';
import { SilenceDetectionService } from './SilenceDetectionService';

export class AudioRecordingManager {
  private audioService: AudioService;
  private silenceDetectionService: SilenceDetectionService;
  
  constructor() {
    this.audioService = new AudioService();
    this.silenceDetectionService = new SilenceDetectionService();
  }

  async startRecording(
    onSilenceCountdown: (countdown: number) => void,
    onSilenceEnd: () => void,
    onSilenceComplete: () => void
  ) {
    const { analyser } = await this.audioService.startRecording();
    this.silenceDetectionService.startDetection(
      analyser,
      onSilenceCountdown,
      onSilenceEnd,
      onSilenceComplete
    );
    return analyser;
  }

  async stopRecording() {
    this.silenceDetectionService.stop();
    return await this.audioService.stopRecording();
  }

  cleanup() {
    this.audioService.cleanup();
    this.silenceDetectionService.stop();
  }

  isRecording() {
    return this.audioService.isRecording();
  }
}
