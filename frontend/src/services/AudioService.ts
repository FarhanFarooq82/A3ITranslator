import RecordRTC, { StereoAudioRecorder } from 'recordrtc';

export class AudioService {
  private RTCRecorder: RecordRTC | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private activeStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];

  async startRecording(): Promise<{ 
    stream: MediaStream; 
    analyser: AnalyserNode; 
  }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.activeStream = stream;
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 2048;
      this.analyserNode = analyser;
      source.connect(analyser);

      this.RTCRecorder = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/ogg',
        recorderType: StereoAudioRecorder,
        numberOfAudioChannels: 1,
        desiredSampRate: 16000,
        timeSlice: 1000,
        ondataavailable: (blob: Blob) => {
          if (blob.size > 0) {
            this.audioChunks.push(blob);
          }
        }
      });

      this.RTCRecorder.startRecording();
      return { stream, analyser };
    } catch (error) {
      throw new Error('Failed to start recording: ' + error);
    }
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.RTCRecorder) {
        reject(new Error('No active recording'));
        return;
      }

      this.RTCRecorder.stopRecording(() => {
        const blob = this.RTCRecorder?.getBlob();
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to get recording blob'));
        }
        this.cleanup();
      });
    });
  }

  cleanup(): void {
    if (this.RTCRecorder) {
      this.RTCRecorder.destroy();
      this.RTCRecorder = null;
    }

    if (this.audioContext?.state !== 'closed') {
      this.audioContext?.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => track.stop());
      this.activeStream = null;
    }

    this.analyserNode = null;
    this.audioChunks = [];
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  isRecording(): boolean {
    return this.RTCRecorder !== null;
  }
}
