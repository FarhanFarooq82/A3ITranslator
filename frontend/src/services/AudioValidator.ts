/**
 * Service for validating recorded audio to ensure it contains meaningful sounds
 * Focuses on detecting speech in office environments with potential road noise
 */
export class AudioValidator {
  /**
   * Validates if a recording contains any speech/sound above threshold
   * @param audioBlob The recorded audio blob
   * @param threshold Volume threshold to consider as valid sound (0-1)
   * @returns Promise resolving to true if valid sound is detected
   */
  static async validateRecording(
    audioBlob: Blob, 
    threshold: number = 0.045  // Slightly lower threshold for post-validation
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Early return if no blob
      if (!audioBlob || audioBlob.size === 0) {
        console.log('AudioValidator: No audio blob to validate');
        resolve(false);
        return;
      }      // Create audio context and element
      // Handle different browser implementations of AudioContext
      const audioContext = new AudioContext();
      // Note: If you need Safari support, you would need to add proper TypeScript declarations
      // for webkitAudioContext or use a polyfill package
      const audioElement = new Audio();
      const audioURL = URL.createObjectURL(audioBlob);
      
      // Analysis setup
      let containsValidSound = false;
      let analysisDone = false;
      
      // Clean up function
      const cleanup = () => {
        if (analysisDone) return;
        analysisDone = true;
        URL.revokeObjectURL(audioURL);
        if (audioElement) {
          audioElement.pause();
        }
        if (audioContext) {
          audioContext.close();
        }
      };
      
      // Set up audio element
      audioElement.src = audioURL;
      
      // Set up analyzer node
      audioElement.addEventListener('canplaythrough', () => {
        try {
          const source = audioContext.createMediaElementSource(audioElement);
          const analyzer = audioContext.createAnalyser();
          analyzer.fftSize = 2048;
          const bufferLength = analyzer.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          
          // Connect audio pipeline (but mute output)
          source.connect(analyzer);
          // Skip connecting to destination to keep analysis silent
          
          // Start playback (silent)
          audioElement.play().catch(err => {
            console.error('Error playing audio for analysis:', err);
            cleanup();
            resolve(false);
          });
          
          // Define frequency bands focused on speech
          const frequencyBands = [
            { minHz: 85, maxHz: 255, weight: 1.5 },  // Fundamental speech
            { minHz: 255, maxHz: 2000, weight: 1.0 }, // Mid frequencies
            { minHz: 2000, maxHz: 8000, weight: 0.8 } // High frequencies
          ];
          
          // Analysis function
          const analyzeFrame = () => {
            if (analysisDone) return;
            
            // Get frequency data
            analyzer.getByteFrequencyData(dataArray);
            
            // Two-pronged analysis approach
            
            // 1. Basic volume analysis
            let sumOfSquares = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sumOfSquares += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sumOfSquares / dataArray.length);
            const normalizedRMS = rms / 256; // Normalize to 0-1
            
            // 2. Speech-focused frequency analysis
            let speechLikelihood = 0;
            let totalWeight = 0;
            
            frequencyBands.forEach(band => {
              const minBin = Math.floor(band.minHz * dataArray.length / audioContext.sampleRate);
              const maxBin = Math.floor(band.maxHz * dataArray.length / audioContext.sampleRate);
              
              let bandEnergy = 0;
              for (let i = minBin; i <= maxBin && i < dataArray.length; i++) {
                bandEnergy += dataArray[i];
              }
              
              const normalizedBandEnergy = bandEnergy / (maxBin - minBin + 1) / 256;
              speechLikelihood += normalizedBandEnergy * band.weight;
              totalWeight += band.weight;
            });
            
            speechLikelihood /= totalWeight;
            
            // Accept as valid if either condition is met
            // - Basic volume is above threshold
            // - Speech pattern is detected with reasonable confidence
            if (normalizedRMS > threshold || speechLikelihood > 0.03) {
              console.log(`AudioValidator: Valid audio detected (volume: ${normalizedRMS.toFixed(3)}, speech: ${speechLikelihood.toFixed(3)})`);
              containsValidSound = true;
              cleanup();
              resolve(true);
              return;
            }
            
            // Continue if we haven't found valid sound yet
            if (!audioElement.ended && !audioElement.paused && !analysisDone) {
              requestAnimationFrame(analyzeFrame);
            } else if (!containsValidSound && !analysisDone) {
              // Reached end without finding valid sound
              console.log('AudioValidator: No valid audio detected in recording');
              cleanup();
              resolve(false);
            }
          };
          
          // Start analysis
          analyzeFrame();
          
        } catch (error) {
          console.error('Error setting up audio analysis:', error);
          cleanup();
          reject(error);
        }
      });
      
      // Handle errors
      audioElement.addEventListener('error', () => {
        console.error('Error loading audio for validation:', audioElement.error);
        cleanup();
        resolve(false);
      });
      
      // Handle end of audio
      audioElement.addEventListener('ended', () => {
        if (!analysisDone) {
          cleanup();
          resolve(containsValidSound);
        }
      });
      
      // Safety timeout (10 seconds)
      setTimeout(() => {
        if (!analysisDone) {
          console.warn('AudioValidator: Analysis timed out after 10 seconds');
          cleanup();
          resolve(containsValidSound);
        }
      }, 10000);
    });
  }
}
