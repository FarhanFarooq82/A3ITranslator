import { AudioRecordingManager } from '../AudioRecordingManager';
import { AudioService } from '../AudioService';
import { SilenceDetectionService } from '../SilenceDetectionService';

jest.mock('../AudioService');
jest.mock('../SilenceDetectionService');

describe('AudioRecordingManager', () => {
  let audioRecordingManager: AudioRecordingManager;
  let mockAudioService: jest.Mocked<AudioService>;
  let mockSilenceDetectionService: jest.Mocked<SilenceDetectionService>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    audioRecordingManager = new AudioRecordingManager();
    mockAudioService = new AudioService() as jest.Mocked<AudioService>;
    mockSilenceDetectionService = new SilenceDetectionService() as jest.Mocked<SilenceDetectionService>;
  });

  describe('startRecording', () => {
    it('should start recording and setup silence detection', async () => {
      const mockAnalyser = {};
      const mockOnSilenceCountdown = jest.fn();
      const mockOnSilenceEnd = jest.fn();
      const mockOnSilenceComplete = jest.fn();

      mockAudioService.startRecording.mockResolvedValue({ analyser: mockAnalyser });

      await audioRecordingManager.startRecording(
        mockOnSilenceCountdown,
        mockOnSilenceEnd,
        mockOnSilenceComplete
      );

      expect(mockAudioService.startRecording).toHaveBeenCalled();
      expect(mockSilenceDetectionService.startDetection).toHaveBeenCalledWith(
        mockAnalyser,
        mockOnSilenceCountdown,
        mockOnSilenceEnd,
        mockOnSilenceComplete
      );
    });

    it('should throw error if audio service fails', async () => {
      const error = new Error('Failed to start recording');
      mockAudioService.startRecording.mockRejectedValue(error);

      await expect(audioRecordingManager.startRecording(
        jest.fn(),
        jest.fn(),
        jest.fn()
      )).rejects.toThrow('Failed to start recording');
    });
  });

  describe('stopRecording', () => {
    it('should stop recording and cleanup', async () => {
      const mockAudioBlob = new Blob();
      mockAudioService.stopRecording.mockResolvedValue(mockAudioBlob);

      const result = await audioRecordingManager.stopRecording();

      expect(mockSilenceDetectionService.stop).toHaveBeenCalled();
      expect(mockAudioService.stopRecording).toHaveBeenCalled();
      expect(result).toBe(mockAudioBlob);
    });
  });

  describe('cleanup', () => {
    it('should cleanup audio service and stop silence detection', () => {
      audioRecordingManager.cleanup();

      expect(mockAudioService.cleanup).toHaveBeenCalled();
      expect(mockSilenceDetectionService.stop).toHaveBeenCalled();
    });
  });

  describe('isRecording', () => {
    it('should return recording state from audio service', () => {
      mockAudioService.isRecording.mockReturnValue(true);
      expect(audioRecordingManager.isRecording()).toBe(true);

      mockAudioService.isRecording.mockReturnValue(false);
      expect(audioRecordingManager.isRecording()).toBe(false);
    });
  });
});
