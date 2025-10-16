using A3ITranslator.Application.Common;
using A3ITranslator.Application.DTOs;
using A3ITranslator.Application.Services;
using A3ITranslator.Domain.Enums;
using A3ITranslator.Domain.ValueObjects;

namespace A3ITranslator.Application.UseCases;

/// <summary>
/// Main use case for processing audio through the complete pipeline
/// </summary>
public interface IProcessAudioUseCase
{
    Task<Result<AudioResponseDto>> ExecuteAsync(AudioRequestDto request);
}

/// <summary>
/// Audio processing use case implementation
/// </summary>
public class ProcessAudioUseCase : IProcessAudioUseCase
{
    private readonly ISTTOrchestrator _sttOrchestrator;
    private readonly ITranslationOrchestrator _translationOrchestrator;
    private readonly ITTSOrchestrator _ttsOrchestrator;
    private readonly ISessionService _sessionService;
    private readonly ISpeakerIdentificationService _speakerService;

    public ProcessAudioUseCase(
        ISTTOrchestrator sttOrchestrator,
        ITranslationOrchestrator translationOrchestrator,
        ITTSOrchestrator ttsOrchestrator,
        ISessionService sessionService,
        ISpeakerIdentificationService speakerService)
    {
        _sttOrchestrator = sttOrchestrator;
        _translationOrchestrator = translationOrchestrator;
        _ttsOrchestrator = ttsOrchestrator;
        _sessionService = sessionService;
        _speakerService = speakerService;
    }

    public async Task<Result<AudioResponseDto>> ExecuteAsync(AudioRequestDto request)
    {
        try
        {
            // Step 1: Ensure session exists and is active
            var sessionResult = await _sessionService.GetSessionAsync(request.SessionId);
            if (!sessionResult.IsSuccess)
            {
                return Result<AudioResponseDto>.Failure($"Session not found: {sessionResult.ErrorMessage}");
            }

            // Step 2: Speech-to-Text with Speaker Identification
            var sttRequest = new STTRequestDto
            {
                AudioData = request.AudioData,
                SessionId = request.SessionId,
                ContentType = request.ContentType,
                ExpectedLanguage = request.MainLanguage
            };

            var sttResult = await _sttOrchestrator.ProcessAsync(sttRequest);
            if (!sttResult.IsSuccess)
            {
                return Result<AudioResponseDto>.Failure($"STT failed: {sttResult.ErrorMessage}");
            }

            // Step 3: Enhance speaker information with display name
            SpeakerDto? enhancedSpeaker = null;
            if (sttResult.Value?.Speaker != null)
            {
                var speakerResult = await _speakerService.EnhanceWithDisplayInfoAsync(
                    request.SessionId, sttResult.Value.Speaker);
                
                if (speakerResult.IsSuccess)
                {
                    enhancedSpeaker = speakerResult.Value;
                }
            }

            // Step 4: Translation with AI assistance check
            var translationRequest = new TranslationRequestDto
            {
                Text = sttResult.Value?.Transcription ?? string.Empty,
                SourceLanguage = request.MainLanguage,
                TargetLanguage = request.OtherLanguage,
                SessionId = request.SessionId,
                Speaker = enhancedSpeaker,
                UserTier = request.UserTier
            };

            var translationResult = await _translationOrchestrator.ProcessAsync(translationRequest);
            if (!translationResult.IsSuccess)
            {
                return Result<AudioResponseDto>.Failure($"Translation failed: {translationResult.ErrorMessage}");
            }

            // Step 5: Text-to-Speech for translation
            var translationTTSRequest = new TTSRequestDto
            {
                Text = translationResult.Value?.Translation ?? string.Empty,
                TargetLanguage = request.OtherLanguage,
                Speaker = enhancedSpeaker,
                UserTier = request.UserTier,
                SessionId = request.SessionId,
                ContentType = ContentType.Translation
            };

            var translationTTSResult = await _ttsOrchestrator.ProcessAsync(translationTTSRequest);

            // Step 6: TTS for AI response (if applicable)
            TTSResponseDto? aiTTSResponse = null;
            if (translationResult.Value?.AIAssistanceConfirmed == true && 
                !string.IsNullOrEmpty(translationResult.Value.AIResponseTranslated))
            {
                var aiTTSRequest = new TTSRequestDto
                {
                    Text = translationResult.Value.AIResponseTranslated,
                    TargetLanguage = request.OtherLanguage,
                    Speaker = enhancedSpeaker,
                    UserTier = request.UserTier,
                    SessionId = request.SessionId,
                    ContentType = ContentType.AIResponse
                };

                var aiTTSResult = await _ttsOrchestrator.ProcessAsync(aiTTSRequest);
                if (aiTTSResult.IsSuccess)
                {
                    aiTTSResponse = aiTTSResult.Value;
                }
            }

            // Step 7: Update session activity
            await _sessionService.UpdateSessionActivityAsync(request.SessionId);

            // Step 8: Add transcription to session
            await _sessionService.AddMessageToSessionAsync(request.SessionId, new AddMessageDto
            {
                Speaker = enhancedSpeaker?.DisplayName ?? "User",
                Text = sttResult.Value?.Transcription ?? string.Empty,
                Language = request.MainLanguage,
                MessageType = MessageType.Transcription,
                SpeakerInfo = enhancedSpeaker
            });

            // Step 9: Build response
            var response = new AudioResponseDto
            {
                Transcription = sttResult.Value?.Transcription ?? string.Empty,
                Translation = translationResult.Value?.Translation ?? string.Empty,
                TranslationLanguage = request.OtherLanguage,
                Tone = translationResult.Value?.Tone ?? string.Empty,
                TranslationWithGestures = translationResult.Value?.TranslationWithGestures ?? string.Empty,
                SpeakerName = enhancedSpeaker?.DisplayName ?? string.Empty,
                IsDirectQuery = translationResult.Value?.AIAssistanceConfirmed ?? false,
                SessionId = request.SessionId,
                TranslationAudio = translationTTSResult.IsSuccess ? translationTTSResult.Value?.ToBase64() : null,
                TranslationAudioMimeType = translationTTSResult.IsSuccess ? translationTTSResult.Value?.MimeType : null,
                AudioType = translationResult.Value?.AIAssistanceConfirmed == true ? "ai_response" : "translation",
                AIResponse = translationResult.Value?.AIResponse,
                AITranslationAudio = aiTTSResponse?.ToBase64(),
                AITranslationAudioMimeType = aiTTSResponse?.MimeType
            };

            return Result<AudioResponseDto>.Success(response);
        }
        catch (Exception ex)
        {
            return Result<AudioResponseDto>.Failure("An error occurred during audio processing", ex);
        }
    }
}

/// <summary>
/// Orchestrator interfaces for managing provider selection and fallback
/// </summary>
public interface ISTTOrchestrator
{
    Task<Result<STTResponseDto>> ProcessAsync(STTRequestDto request);
}

public interface ITranslationOrchestrator
{
    Task<Result<TranslationResponseDto>> ProcessAsync(TranslationRequestDto request);
}

public interface ITTSOrchestrator
{
    Task<Result<TTSResponseDto>> ProcessAsync(TTSRequestDto request);
}
