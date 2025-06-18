import { AudioRecordingManager, RecordingCallbacks } from '../AudioRecordingManager';
import { AudioService } from '../AudioService';
import { SilenceDetectionService } from '../SilenceDetectionService';

jest.mock('../AudioService');
jest.mock('../SilenceDetectionService');

describe('AudioRecordingManager - Integration Tests', () => {
  let audioRecordingManager: AudioRecordingManager;
  let mockAudioService: jest.Mocked<AudioService>;
  let mockSilenceDetectionService: jest.Mocked<SilenceDetectionService>;
  let mockCallbacks: RecordingCallbacks;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
      // Create mock callbacks
    mockCallbacks = {
      onSilenceCountdown: jest.fn(),
      onSoundResumed: jest.fn(),
      onSilenceComplete: jest.fn()
    };
    
    // Initialize manager
    audioRecordingManager = new AudioRecordingManager();
    
    // Get references to mocked services (need to access internal properties)
    // @ts-ignore - Accessing private property for testing
    mockAudioService = audioRecordingManager['audioService'] as jest.Mocked<AudioService>;
    // @ts-ignore - Accessing private property for testing
    mockSilenceDetectionService = audioRecordingManager['silenceDetectionService'] as jest.Mocked<SilenceDetectionService>;
  });

  describe('startRecording', () => {
    it('should start recording and setup silence detection with callbacks', async () => {
      const mockAnalyser = {} as AnalyserNode;
      
      // Set up mocks
      mockAudioService.startRecording = jest.fn().mockResolvedValue({ 
        stream: {} as MediaStream, 
        analyser: mockAnalyser 
      });
      mockAudioService.isRecording = jest.fn().mockReturnValue(true);
      
      // Run the test
      const result = await audioRecordingManager.startRecording(mockCallbacks);
      
      // Verify expectations
      expect(mockAudioService.startRecording).toHaveBeenCalled();      expect(mockSilenceDetectionService.startDetection).toHaveBeenCalledWith(
        mockAnalyser,
        mockCallbacks.onSilenceCountdown,
        mockCallbacks.onSoundResumed,
        mockCallbacks.onSilenceComplete
      );
      expect(result).toBe(mockAnalyser);
    });

    it('should throw error if audio service fails', async () => {
      const error = new Error('Failed to start recording');
      mockAudioService.startRecording.mockRejectedValue(error);

      await expect(audioRecordingManager.startRecording(mockCallbacks))
        .rejects.toThrow('Failed to start recording');
    });
  });

  describe('stopRecording', () => {
    it('should reject invalid audio and return null', async () => {
      // Mock hasValidAudioContent to return false
      jest.spyOn(audioRecordingManager, 'hasValidAudioContent').mockReturnValue(false);
      
      const result = await audioRecordingManager.stopRecording();
      
      expect(mockSilenceDetectionService.stop).toHaveBeenCalled();
      expect(mockAudioService.stopRecording).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should process and return valid audio content', async () => {
      const mockAudioBlob = new Blob() as Blob;
      
      // Mock hasValidAudioContent to return true
      jest.spyOn(audioRecordingManager, 'hasValidAudioContent').mockReturnValue(true);
      mockAudioService.stopRecording.mockResolvedValue(mockAudioBlob);
      
      const result = await audioRecordingManager.stopRecording();
      
      expect(mockSilenceDetectionService.stop).toHaveBeenCalled();
      expect(mockAudioService.stopRecording).toHaveBeenCalled();
      expect(result).toBe(mockAudioBlob);
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', () => {
      // @ts-ignore - Set private values for testing
      audioRecordingManager['currentAnalyser'] = {} as AnalyserNode;
      // @ts-ignore - Set private values for testing
      audioRecordingManager['audioSamples'] = [new Float32Array(10)];
      // @ts-ignore - Set private values for testing
      audioRecordingManager['recordingStartTime'] = Date.now();
      
      audioRecordingManager.cleanup();
      
      expect(mockAudioService.cleanup).toHaveBeenCalled();
      expect(mockSilenceDetectionService.stop).toHaveBeenCalled();
      
      // @ts-ignore - Check private values for testing
      expect(audioRecordingManager['currentAnalyser']).toBeNull();
      // @ts-ignore - Check private values for testing
      expect(audioRecordingManager['audioSamples']).toEqual([]);
      // @ts-ignore - Check private values for testing
      expect(audioRecordingManager['recordingStartTime']).toBeNull();
    });
  });
});
