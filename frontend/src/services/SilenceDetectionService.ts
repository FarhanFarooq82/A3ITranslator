export const SILENCE_THRESHOLD = 0.05;
export const SILENCE_DURATION = 3000;
export const SAMPLE_RATE = 100;
export const BUFFER_SIZE = 30;
export const TRIM_THRESHOLD = 0.045;    // Threshold for silence trimming (more lenient than detection to avoid over-trimming)
export const MIN_TRIM_CHUNK_MS = 250;   // Minimum chunk size (ms) to analyze during trimming

export class SilenceDetectionService {
  private volumeBuffer: number[] = [];
  private silenceTimeout: NodeJS.Timeout | null = null;
  private silenceCountdownInterval: NodeJS.Timeout | null = null;
  private isActive = false;
  private lastCheckTime = 0;
  private silentPeriodStart: number | null = null;  startDetection( 
    analyser: AnalyserNode,
    onSilenceStart: (countdown: number) => void,
    onSoundResumed: () => void,
    onSilenceComplete: () => void
  ): void {
    this.isActive = true;
    this.lastCheckTime = Date.now();
    this.volumeBuffer = [];
    this.silentPeriodStart = null;
    
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    
    const checkSilence = () => {
      if (!this.isActive) return;

      try {
        const currentTime = Date.now();
        if (currentTime - this.lastCheckTime >= SAMPLE_RATE) {          
          try {
            // Get audio data - wrapped in try/catch to handle disconnected analyzer
            analyser.getByteFrequencyData(freqData);
          } catch (error) {
            console.warn('Analyzer node disconnected or unavailable:', error);
            this.isActive = false; // Stop the detection loop
            return;
          }
          
          // Check if we're getting audio data
          const hasAudioData = freqData.some(value => value > 0);
          if (!hasAudioData && currentTime % 3000 < SAMPLE_RATE) {
            console.warn('No audio data detected in analyzer! Check microphone permissions.');
          }
          
          // Calculate RMS (volume)
          const normalizedRMS = this.calculateRMS(freqData);
          this.volumeBuffer.push(normalizedRMS);
          
          // Keep buffer size consistent
          if (this.volumeBuffer.length > BUFFER_SIZE) {
            this.volumeBuffer.shift();
          }        // Calculate average volume
          
          const averageVolume = this.calculateAverageVolume();
        
          // Debug log every second
          if (currentTime % 1000 < SAMPLE_RATE) {
            console.log(`Audio metrics: Volume=${averageVolume.toFixed(4)}, Threshold=${SILENCE_THRESHOLD.toFixed(4)}`);
            console.log(`Silent state: ${this.silentPeriodStart !== null}`);
          }
        
          // Handle silence detection
          if (this.volumeBuffer.length === BUFFER_SIZE && averageVolume < SILENCE_THRESHOLD) {
              // Silence detected
              this.handleSilence(onSilenceStart, onSilenceComplete);
            } else {
              this.clearSilenceTimers();
              onSoundResumed();            
            }
          
          this.lastCheckTime = currentTime;
        }
      } 
      catch (error) {
        console.error('Error in silence detection:', error);
        this.isActive = false; // Stop the detection loop on error
      }

      if (this.isActive) {
        requestAnimationFrame(() => checkSilence());
      }
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
    onSilenceComplete: () => void
  ): void {
    if (!this.silenceTimeout) {
      let countdown = SILENCE_DURATION / 1000;
      console.log(`Silence countdown started: ${countdown} seconds remaining`);
      onSilenceStart(countdown);

      if (this.silenceCountdownInterval) {
        clearInterval(this.silenceCountdownInterval);
      }
      
      this.silenceCountdownInterval = setInterval(() => {
        countdown -= 1;
        console.log(`Silence countdown: ${countdown} seconds remaining`);
        onSilenceStart(countdown);
        if (countdown <= 0) {
          console.log(`SILENCE COUNTDOWN COMPLETE`);
          
          // Need to stop detection first and clean up before callback
          // to prevent accessing disconnected nodes in the callback chain
          this.clearSilenceTimers();
          this.isActive = false; // Stop detection loop immediately

          // Call onSilenceComplete after we've ensured resources are cleaned up
          try {
            onSilenceComplete();
          } catch (error) {
            console.error('Error in silence completion callback:', error);
          }
        }
      }, 1000);
      
      this.silenceTimeout = setTimeout(() => {
        // Silence check handled by the countdown interval
      }, SILENCE_DURATION);
    }
  }
  stop(): void {
    this.isActive = false;
    this.clearSilenceTimers();
    this.volumeBuffer = [];
    this.silentPeriodStart = null;
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

  /**
   * Trims silence from the beginning and end of an audio blob
   * @param audioBlob The original audio blob to trim
   * @returns Promise with the trimmed audio blob
   */  async trimSilence(audioBlob: Blob): Promise<Blob> {
    try {
      console.log(`Trimming silence from audio... Blob size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      
      // Check if the blob is valid
      if (!audioBlob || audioBlob.size === 0) {
        console.warn('Invalid audio blob provided for trimming');
        return audioBlob;
      }
      
      // Get original duration for comparison
      let originalDuration;
      try {
        originalDuration = await this.getAudioDuration(audioBlob);
        console.log(`Original audio duration: ${originalDuration.toFixed(2)}s`);
        
        // Add additional check - if duration is too short, skip trimming
        if (originalDuration < 0.5) {
          console.warn('Audio is too short to trim (< 0.5s), returning original');
          return audioBlob;
        }
      } catch (error) {
        console.warn('Could not determine audio duration, skipping silence trimming', error);
        return audioBlob;
      }
      
      // Convert blob to array buffer for analysis
      console.log('Converting blob to AudioBuffer...');
      const audioBuffer = await this.blobToAudioBuffer(audioBlob);
      if (!audioBuffer) {
        console.warn('Could not convert audio to buffer for trimming, returning original');
        return audioBlob;
      }
      console.log(`AudioBuffer created: ${audioBuffer.numberOfChannels} channels, ${audioBuffer.length} samples, ${audioBuffer.duration.toFixed(2)}s`);
      
        // Find the start and end points of actual audio content
      console.log('Finding audio boundaries...');
      const { startTime, endTime } = this.findAudioBoundaries(audioBuffer);
      
      if (startTime >= endTime) {
        console.warn('No valid audio content found or trim failed - boundaries calculation returned invalid range');
        return audioBlob;
      }
      
      const trimmedDuration = endTime - startTime;
      console.log(`Identified audio boundaries: ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s (${trimmedDuration.toFixed(2)}s)`);
      
      // Safety check - if we're about to trim everything, return original
      if (trimmedDuration < 0.1) {
        console.warn('Calculated trim would remove almost all audio (less than 0.1s remaining), returning original');
        return audioBlob;
      }
      
      // Check if trimming is worth it (at least 0.5s difference)
      const timeSaved = originalDuration - trimmedDuration;
      if (timeSaved < 0.5) {
        console.log(`Not enough silence to trim (only ${timeSaved.toFixed(2)}s), returning original audio`);
        return audioBlob;
      }
        // Extract the portion with actual content
      console.log(`Extracting audio segment from ${startTime.toFixed(3)}s to ${endTime.toFixed(3)}s...`);
      const trimmedBuffer = this.extractAudioSegment(audioBuffer, startTime, endTime);
      console.log(`Extracted segment: ${trimmedBuffer.numberOfChannels} channels, ${trimmedBuffer.length} samples, ${trimmedBuffer.duration.toFixed(3)}s`);
      
      // Convert back to blob
      console.log('Converting AudioBuffer back to blob...');
      const trimmedBlob = await this.audioBufferToBlob(trimmedBuffer, audioBlob.type);
      console.log(`Created blob of size ${trimmedBlob?.size || 0} bytes`);
      
      // Validate the trimmed blob
      if (!trimmedBlob || trimmedBlob.size === 0) {
        console.warn('Trimming produced an invalid blob, returning original');
        return audioBlob;
      }
      
      try {
        const trimmedBlobDuration = await this.getAudioDuration(trimmedBlob);
        console.log(`Trimmed audio duration: ${trimmedBlobDuration.toFixed(2)}s (saved ${timeSaved.toFixed(2)}s, ${Math.round((timeSaved/originalDuration)*100)}% reduction)`);
        
        // Final size validation
        if (trimmedBlob.size < 100) {
          console.warn(`Warning: Trimmed blob is very small (${trimmedBlob.size} bytes), might be corrupted. Returning original.`);
          return audioBlob;
        }
        
        return trimmedBlob;
      } catch (error) {
        console.error('Error validating trimmed audio', error);
        return audioBlob; // Return original on error
      }
      
    } catch (error) {
      console.error('Error during silence trimming:', error);
      return audioBlob; // Return original on any error
    }
  }
  /**
   * Find the start and end times of actual audio content (non-silence)
   */  
  private findAudioBoundaries(audioBuffer: AudioBuffer): { startTime: number; endTime: number } {
    const sampleRate = audioBuffer.sampleRate;
    const audioData = audioBuffer.getChannelData(0); // Use first channel for analysis
    
    // Calculate RMS values in small chunks for analysis
    const chunkSize = Math.max(Math.floor(sampleRate * (MIN_TRIM_CHUNK_MS / 1000)), 1024);
    const numChunks = Math.floor(audioData.length / chunkSize);
    const rmsValues: number[] = [];
    
    console.log(`Audio analysis: ${numChunks} chunks of ${chunkSize} samples (${MIN_TRIM_CHUNK_MS}ms) each`);
    
    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, audioData.length);
      let sumOfSquares = 0;
      
      for (let j = start; j < end; j++) {
        sumOfSquares += audioData[j] * audioData[j];
      }
      
      const rms = Math.sqrt(sumOfSquares / (end - start));
      rmsValues.push(rms);
    }
    
    // Log a sample of the RMS values for debugging
    if (rmsValues.length > 0) {
      const maxRms = Math.max(...rmsValues);
      console.log(`Audio RMS analysis: Max RMS = ${maxRms.toFixed(4)}, Threshold = ${TRIM_THRESHOLD.toFixed(4)}`);
      console.log(`First 5 chunks: ${rmsValues.slice(0, 5).map(v => v.toFixed(4)).join(', ')}`);
      console.log(`Last 5 chunks: ${rmsValues.slice(-5).map(v => v.toFixed(4)).join(', ')}`);
    }
    
    // Forward scan from start to find first non-silent chunk
    let startChunk = 0;
    while (startChunk < rmsValues.length && rmsValues[startChunk] < TRIM_THRESHOLD) {
      startChunk++;
    }
    
    // Backward scan from end to find last non-silent chunk
    let endChunk = rmsValues.length - 1;
    while (endChunk > startChunk && rmsValues[endChunk] < TRIM_THRESHOLD) {
      endChunk--;
    }
    
    // Convert chunk indices to time
    const startTime = Math.max(0, (startChunk * chunkSize) / sampleRate);
    const endTime = Math.min(
      audioBuffer.duration, 
      ((endChunk + 1) * chunkSize) / sampleRate
    );
    
    console.log(`Trimming boundaries: Keeping ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s (removing ${startTime.toFixed(2)}s from start, ${(audioBuffer.duration - endTime).toFixed(2)}s from end)`);
    
    return { startTime, endTime };
  }

  /**
   * Extract a segment of audio from an AudioBuffer
   */
  private extractAudioSegment(audioBuffer: AudioBuffer, startTime: number, endTime: number): AudioBuffer {
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.min(
      Math.ceil(endTime * sampleRate),
      audioBuffer.length
    );
    
    const segmentLength = endSample - startSample;
    
    // Create a new AudioBuffer for the segment
    const audioContext = new (window.AudioContext )();
    const segmentBuffer = audioContext.createBuffer(
      numChannels, 
      segmentLength, 
      sampleRate
    );
    
    // Copy data from original buffer to segment buffer for each channel
    for (let channel = 0; channel < numChannels; channel++) {
      const sourceChannel = audioBuffer.getChannelData(channel);
      const targetChannel = segmentBuffer.getChannelData(channel);
      
      for (let i = 0; i < segmentLength; i++) {
        targetChannel[i] = sourceChannel[startSample + i];
      }
    }
    
    audioContext.close();
    return segmentBuffer;
  }

  /**
   * Convert a blob to an AudioBuffer for processing
   */
  private async blobToAudioBuffer(blob: Blob): Promise<AudioBuffer | null> {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new (window.AudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      audioContext.close();
      return audioBuffer;
    } catch (error) {
      console.error('Error converting blob to AudioBuffer:', error);
      return null;
    }
  }

  /**
   * Convert an AudioBuffer back to a Blob
   */
  private async audioBufferToBlob(buffer: AudioBuffer, mimeType: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        const audioContext = new (window.AudioContext)();
        const numChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const sampleRate = buffer.sampleRate;
        
        // Create an offline context to render the audio
        const offlineContext = new OfflineAudioContext(numChannels, length, sampleRate);
        
        // Create a buffer source
        const source = offlineContext.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineContext.destination);
        source.start();
        
        // Render the audio
        offlineContext.startRendering().then(renderedBuffer => {
          // Convert the rendered buffer to WAV format
          const wavBlob = this.audioBufferToWav(renderedBuffer);
          audioContext.close();
          resolve(new Blob([wavBlob], { type: mimeType }));
        }).catch(err => {
          audioContext.close();
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Convert AudioBuffer to WAV format (binary)
   */  private audioBufferToWav(buffer: AudioBuffer): Uint8Array {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitDepth = 16; // 16 bit
    
    // Calculate sizes
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = buffer.length * blockAlign;
    const bufferSize = 44 + dataSize;
    
    // Create the WAV buffer
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
    
    // Write WAV header
    this.writeWavHeader(view, {
      numChannels,
      sampleRate,
      bitDepth,
      dataSize
    });
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = buffer.getChannelData(channel)[i];
        // Convert float32 to int16
        const value = Math.max(-1, Math.min(1, sample));
        const int = value < 0 ? value * 32768 : value * 32767;
        view.setInt16(offset, int, true);
        offset += 2;
      }
    }
    
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Write WAV header to DataView
   */  private writeWavHeader(view: DataView, options: { 
    numChannels: number; 
    sampleRate: number; 
    bitDepth: number; 
    dataSize: number; 
  }): void {
    const { numChannels, sampleRate, bitDepth, dataSize } = options;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign; // Define byteRate here before using it
    
    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');
    
    // FMT sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    
    // Data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
  }

  /**
   * Write a string to a DataView
   */
  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Get the duration of an audio blob in seconds
   */
  private async getAudioDuration(blob: Blob): Promise<number> {
    return new Promise((resolve, reject) => {
      const audioEl = document.createElement('audio');
      audioEl.preload = 'metadata';
      
      const objectUrl = URL.createObjectURL(blob);
      
      const onLoad = () => {
        const duration = audioEl.duration;
        URL.revokeObjectURL(objectUrl);
        audioEl.removeEventListener('loadedmetadata', onLoad);
        audioEl.remove();
        resolve(duration);
      };
      
      const onError = () => {
        URL.revokeObjectURL(objectUrl);
        audioEl.removeEventListener('error', onError);
        audioEl.remove();
        reject(new Error('Could not load audio metadata'));
      };
      
      audioEl.addEventListener('loadedmetadata', onLoad);
      audioEl.addEventListener('error', onError);
      audioEl.src = objectUrl;
    });
  }
}

// NOTE: The variables below have linter warnings but are actually used within the class methods.
// The TypeScript analyzer sometimes doesn't recognize usage within complex promise chains and closures.
