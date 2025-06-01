export const SILENCE_THRESHOLD = 0.05;
export const SILENCE_DURATION = 3000;
export const SAMPLE_RATE = 100;
export const BUFFER_SIZE = 30;

export class SilenceDetectionService {
  private volumeBuffer: number[] = [];
  private silenceTimeout: NodeJS.Timeout | null = null;
  private silenceCountdownInterval: NodeJS.Timeout | null = null;
  private isActive = false;
  private lastCheckTime = 0;

  startDetection(
    analyser: AnalyserNode,
    onSilenceStart: (countdown: number) => void,
    onSilenceEnd: () => void,
    onSilenceComplete: () => void
  ): void {
    this.isActive = true;
    this.lastCheckTime = Date.now();
    const data = new Uint8Array(analyser.frequencyBinCount);

    const checkSilence = () => {
      if (!this.isActive) return;

      const currentTime = Date.now();
      if (currentTime - this.lastCheckTime >= SAMPLE_RATE) {
        analyser.getByteFrequencyData(data);
        const normalizedRMS = this.calculateRMS(data);
        this.volumeBuffer.push(normalizedRMS);
        
        if (this.volumeBuffer.length > BUFFER_SIZE) {
          this.volumeBuffer.shift();
        }

        const averageVolume = this.calculateAverageVolume();

        if (this.volumeBuffer.length === BUFFER_SIZE && averageVolume < SILENCE_THRESHOLD) {
          this.handleSilence(onSilenceStart, onSilenceEnd, onSilenceComplete);
        } else {
          this.clearSilenceTimers();
          onSilenceEnd();
        }

        this.lastCheckTime = currentTime;
      }

      requestAnimationFrame(() => checkSilence());
    };

    checkSilence();
  }

  private calculateRMS(data: Uint8Array): number {
    let sumOfSquares = 0;
    for (let i = 0; i < data.length; i++) {
      sumOfSquares += data[i] * data[i];
    }
    const rms = Math.sqrt(sumOfSquares / data.length);
    return rms / 256;
  }

  private calculateAverageVolume(): number {
    return this.volumeBuffer.reduce((a, b) => a + b, 0) / this.volumeBuffer.length;
  }

  private handleSilence(
    onSilenceStart: (countdown: number) => void,
    onSilenceEnd: () => void,
    onSilenceComplete: () => void
  ): void {
    if (!this.silenceTimeout) {
      let countdown = SILENCE_DURATION / 1000;
      onSilenceStart(countdown);

      if (this.silenceCountdownInterval) {
        clearInterval(this.silenceCountdownInterval);
      }      this.silenceCountdownInterval = setInterval(() => {
        countdown -= 1;
        onSilenceStart(countdown);
        if (countdown <= 0) {
          this.clearSilenceTimers();
          onSilenceComplete(); // Call onSilenceComplete when countdown reaches 0
        }
      }, 1000);      this.silenceTimeout = setTimeout(() => {
        // Silence check handled by the countdown interval
      }, SILENCE_DURATION);
    }
  }

  stop(): void {
    this.isActive = false;
    this.clearSilenceTimers();
    this.volumeBuffer = [];
  }

  private clearSilenceTimers(): void {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    if (this.silenceCountdownInterval) {
      clearInterval(this.silenceCountdownInterval);
      this.silenceCountdownInterval = null;
    }
  }
}
