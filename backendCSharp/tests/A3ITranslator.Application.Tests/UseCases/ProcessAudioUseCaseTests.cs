using A3ITranslator.Application.Common;
using A3ITranslator.Application.DTOs;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.UseCases;
using A3ITranslator.Domain.Enums;
using Moq;

namespace A3ITranslator.Application.Tests.UseCases;

public class ProcessAudioUseCaseTests
{
    private readonly Mock<ISTTOrchestrator> _mockSTTOrchestrator;
    private readonly Mock<ITranslationOrchestrator> _mockTranslationOrchestrator;
    private readonly Mock<ITTSOrchestrator> _mockTTSOrchestrator;
    private readonly Mock<ISessionService> _mockSessionService;
    private readonly Mock<ISpeakerIdentificationService> _mockSpeakerService;
    private readonly ProcessAudioUseCase _useCase;

    public ProcessAudioUseCaseTests()
    {
        _mockSTTOrchestrator = new Mock<ISTTOrchestrator>();
        _mockTranslationOrchestrator = new Mock<ITranslationOrchestrator>();
        _mockTTSOrchestrator = new Mock<ITTSOrchestrator>();
        _mockSessionService = new Mock<ISessionService>();
        _mockSpeakerService = new Mock<ISpeakerIdentificationService>();

        _useCase = new ProcessAudioUseCase(
            _mockSTTOrchestrator.Object,
            _mockTranslationOrchestrator.Object,
            _mockTTSOrchestrator.Object,
            _mockSessionService.Object,
            _mockSpeakerService.Object);
    }

    [Fact]
    public async Task ExecuteAsync_ValidRequest_ReturnsSuccessfulResponse()
    {
        // Arrange
        var request = CreateValidAudioRequest();
        SetupSuccessfulMocks();

        // Act
        var result = await _useCase.ExecuteAsync(request);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal("Hello world", result.Value.Transcription);
        Assert.Equal("مرحبا بالعالم", result.Value.Translation);
        Assert.Equal("Ahmed", result.Value.SpeakerName);
        Assert.Equal("session123", result.Value.SessionId);
    }

    [Fact]
    public async Task ExecuteAsync_SessionNotFound_ReturnsFailure()
    {
        // Arrange
        var request = CreateValidAudioRequest();
        _mockSessionService
            .Setup(x => x.GetSessionAsync(It.IsAny<string>()))
            .ReturnsAsync(Result<SessionDto>.Failure("Session not found"));

        // Act
        var result = await _useCase.ExecuteAsync(request);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Contains("Session not found", result.ErrorMessage);
    }

    [Fact]
    public async Task ExecuteAsync_STTFails_ReturnsFailure()
    {
        // Arrange
        var request = CreateValidAudioRequest();
        _mockSessionService
            .Setup(x => x.GetSessionAsync(It.IsAny<string>()))
            .ReturnsAsync(Result<SessionDto>.Success(CreateValidSessionDto()));

        _mockSTTOrchestrator
            .Setup(x => x.ProcessAsync(It.IsAny<STTRequestDto>()))
            .ReturnsAsync(Result<STTResponseDto>.Failure("STT service unavailable"));

        // Act
        var result = await _useCase.ExecuteAsync(request);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Contains("STT failed", result.ErrorMessage);
    }

    [Fact]
    public async Task ExecuteAsync_WithAIResponse_GeneratesBothAudios()
    {
        // Arrange
        var request = CreateValidAudioRequest();
        SetupSuccessfulMocks();

        // Setup AI response
        _mockTranslationOrchestrator
            .Setup(x => x.ProcessAsync(It.IsAny<TranslationRequestDto>()))
            .ReturnsAsync(Result<TranslationResponseDto>.Success(new TranslationResponseDto
            {
                Translation = "مرحبا بالعالم",
                AIAssistanceConfirmed = true,
                AIResponseTranslated = "هذا رد الذكاء الاصطناعي",
                AIResponse = new AIResponseDto
                {
                    AnswerInAudioLanguage = "This is AI response",
                    AnswerTranslated = "هذا رد الذكاء الاصطناعي",
                    Confidence = 0.95f
                }
            }));

        // Act
        var result = await _useCase.ExecuteAsync(request);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.True(result.Value!.IsDirectQuery);
        Assert.NotNull(result.Value.AIResponse);
        Assert.NotNull(result.Value.TranslationAudio);
        Assert.NotNull(result.Value.AITranslationAudio);
        
        // Verify TTS was called twice (translation + AI response)
        _mockTTSOrchestrator.Verify(x => x.ProcessAsync(It.IsAny<TTSRequestDto>()), Times.Exactly(2));
    }

    [Fact]
    public async Task ExecuteAsync_ValidRequest_UpdatesSessionActivity()
    {
        // Arrange
        var request = CreateValidAudioRequest();
        SetupSuccessfulMocks();

        // Act
        await _useCase.ExecuteAsync(request);

        // Assert
        _mockSessionService.Verify(x => x.UpdateSessionActivityAsync("session123"), Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_ValidRequest_AddsMessageToSession()
    {
        // Arrange
        var request = CreateValidAudioRequest();
        SetupSuccessfulMocks();

        // Act
        await _useCase.ExecuteAsync(request);

        // Assert
        _mockSessionService.Verify(x => x.AddMessageToSessionAsync(
            "session123",
            It.Is<AddMessageDto>(m => 
                m.Text == "Hello world" && 
                m.MessageType == MessageType.Transcription)),
            Times.Once);
    }

    private AudioRequestDto CreateValidAudioRequest()
    {
        return new AudioRequestDto
        {
            AudioData = new byte[] { 1, 2, 3, 4 },
            SessionId = "session123",
            MainLanguage = "en-US",
            OtherLanguage = "ar-SA",
            UserTier = UserTier.Premium,
            ContentType = "audio/ogg"
        };
    }

    private SessionDto CreateValidSessionDto()
    {
        return new SessionDto
        {
            Id = "session123",
            UserId = "user123",
            MainLanguage = "en-US",
            OtherLanguage = "ar-SA",
            UserTier = UserTier.Premium,
            State = SessionState.Active
        };
    }

    private SpeakerDto CreateValidSpeakerDto()
    {
        return new SpeakerDto
        {
            SpeakerId = "speaker001",
            SpeakerName = "Ahmed",
            DisplayName = "Ahmed",
            SpeakerNumber = 1,
            IdentificationConfidence = 0.95f,
            IsKnownSpeaker = true,
            Source = "Azure_Recognition",
            Gender = Gender.Male
        };
    }

    private void SetupSuccessfulMocks()
    {
        // Session service
        _mockSessionService
            .Setup(x => x.GetSessionAsync(It.IsAny<string>()))
            .ReturnsAsync(Result<SessionDto>.Success(CreateValidSessionDto()));

        _mockSessionService
            .Setup(x => x.UpdateSessionActivityAsync(It.IsAny<string>()))
            .ReturnsAsync(Result.Success());

        _mockSessionService
            .Setup(x => x.AddMessageToSessionAsync(It.IsAny<string>(), It.IsAny<AddMessageDto>()))
            .ReturnsAsync(Result.Success());

        // STT orchestrator
        _mockSTTOrchestrator
            .Setup(x => x.ProcessAsync(It.IsAny<STTRequestDto>()))
            .ReturnsAsync(Result<STTResponseDto>.Success(new STTResponseDto
            {
                Transcription = "Hello world",
                DetectedLanguage = "en-US",
                Confidence = 0.95f,
                Speaker = CreateValidSpeakerDto(),
                Provider = "Azure"
            }));

        // Speaker service
        _mockSpeakerService
            .Setup(x => x.EnhanceWithDisplayInfoAsync(It.IsAny<string>(), It.IsAny<SpeakerDto>()))
            .ReturnsAsync(Result<SpeakerDto>.Success(CreateValidSpeakerDto()));

        // Translation orchestrator
        _mockTranslationOrchestrator
            .Setup(x => x.ProcessAsync(It.IsAny<TranslationRequestDto>()))
            .ReturnsAsync(Result<TranslationResponseDto>.Success(new TranslationResponseDto
            {
                Translation = "مرحبا بالعالم",
                Tone = "friendly",
                TranslationWithGestures = "مرحبا بالعالم 👋",
                AIAssistanceConfirmed = false,
                Provider = "Gemini"
            }));

        // TTS orchestrator
        _mockTTSOrchestrator
            .Setup(x => x.ProcessAsync(It.IsAny<TTSRequestDto>()))
            .ReturnsAsync(Result<TTSResponseDto>.Success(new TTSResponseDto
            {
                AudioData = new byte[] { 5, 6, 7, 8 },
                MimeType = "audio/mpeg",
                Provider = "Azure",
                VoiceUsed = "ar-SA-ZariyahNeural",
                Quality = VoiceQuality.Neural
            }));
    }
}
