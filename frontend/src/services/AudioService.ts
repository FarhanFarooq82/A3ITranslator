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
        console.log(`AudioService: Recording stopped, blob size: ${blob?.size || 0} bytes, type: ${blob?.type || 'unknown'}`);
        
        if (blob && blob.size > 0) {
          resolve(blob);
        } else {
          // If the RecordRTC blob is empty but we have chunks, try to create a blob from chunks
          if (this.audioChunks.length > 0) {
            console.log(`AudioService: Using ${this.audioChunks.length} collected chunks as fallback`);
            const combinedBlob = new Blob(this.audioChunks, { type: 'audio/ogg' });
            if (combinedBlob.size > 0) {
              console.log(`AudioService: Created fallback blob of ${combinedBlob.size} bytes`);
              resolve(combinedBlob);
              this.cleanup();
              return;
            }
          }
          
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
