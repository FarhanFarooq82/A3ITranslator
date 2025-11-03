using Microsoft.AspNetCore.Mvc;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.DTOs.Audio;
using A3ITranslator.Application.DTOs.Translation;
using A3ITranslator.Application.Models;
using A3ITranslator.Application.DTOs.Common;
using A3ITranslator.Application.Enums;

namespace A3ITranslator.API.Controllers;

/// <summary>
/// Audio processing controller - handles audio file processing only
/// Compatible with Python backend API contract
/// </summary>
[ApiController]
[Route("")]
public class AudioController : ControllerBase
{
    private readonly ILogger<AudioController> _logger;
    private readonly IAudioProcessingOrchestrator _audioOrchestrator;
    private readonly ISessionService _sessionService;
    private readonly ITranslationOrchestrator _translationOrchestrator;

    public AudioController(
        ILogger<AudioController> logger,
        IAudioProcessingOrchestrator audioOrchestrator,
        ISessionService sessionService,
        ITranslationOrchestrator translationOrchestrator)
    {
        _logger = logger;
        _audioOrchestrator = audioOrchestrator;
        _sessionService = sessionService;
        _translationOrchestrator = translationOrchestrator;
    }

    /// <summary>
    /// Process audio file using the new audio processing architecture
    /// Matches Python endpoint: POST /process-audio/
    /// </summary>
    [HttpPost("process-audio")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult> ProcessAudio(
        [FromForm] IFormFile file,
        [FromForm(Name = "main_language")] string mainLanguage,
        [FromForm(Name = "other_language")] string otherLanguage,
        [FromForm(Name = "is_premium")] string isPremium = "false",
        [FromForm(Name = "session_id")] string sessionId = "")
    {
        var requestId = Guid.NewGuid().ToString("N")[..8]; // Short unique ID for this request
        
        try
        {
            _logger.LogInformation("=== Audio Processing START [Request: {RequestId}] ===", requestId);


            // Basic validation
            if (string.IsNullOrWhiteSpace(sessionId))
            {
                _logger.LogError("[{RequestId}] No session ID provided - this is required", requestId);
                return BadRequest(new { error = "Session ID is required for audio processing" });
            }

            if (file == null || file.Length == 0)
            {
                _logger.LogError("[{RequestId}] No audio file provided", requestId);
                return BadRequest(new { error = "Audio file is required for processing" });
            }

            if (string.IsNullOrWhiteSpace(mainLanguage) || string.IsNullOrWhiteSpace(otherLanguage))
            {
                _logger.LogError("[{RequestId}] Language parameters missing", requestId);
                return BadRequest(new { error = "Both main_language and other_language are required" });
            }

            // Convert audio file to byte array
            byte[] audioData;
            using (var memoryStream = new MemoryStream())
            {
                await file.CopyToAsync(memoryStream);
                audioData = memoryStream.ToArray();
            }
          // Get session to retrieve assigned STT and TTS providers
            var sessionResult = await _sessionService.GetSessionAsync(sessionId);
            if (!sessionResult.IsSuccess)
            {
                _logger.LogError("[{RequestId}] Session {SessionId} not found or invalid", requestId, sessionId);
                return BadRequest(new { error = "Invalid session ID" });
            }

            var session = sessionResult.Value;
            if (session == null)
            {
                _logger.LogError("[{RequestId}] Session {SessionId} data is null", requestId, sessionId);
                return BadRequest(new { error = "Session data not available" });
            }
            _logger.LogInformation("[{RequestId}] Processing audio with session {SessionId} assigned STT providers: [{STTProviders}], TTS providers: [{TTSProviders}]", 
                requestId, sessionId, 
                string.Join(", ", session.AssignedSTTProviders),
                string.Join(", ", session.AssignedTTSProviders));

            // Process audio using session's assigned STT providers with fallback
            var result = await _audioOrchestrator.ProcessAudioWithSessionProvidersAsync(
                audioData, session.AssignedSTTProviders, mainLanguage, otherLanguage, HttpContext.RequestAborted);

            if (result.Success)
            {
                _logger.LogInformation("[{RequestId}] STT processing successful with provider: {Provider} in {Time}ms", 
                    requestId, result.Provider, result.ProcessingTimeMs);

                // Save transcription as conversation message with auto-assigned sequence number
                var transcriptionMessage = new ConversationMessageModel
                {
                    SessionId = sessionId,
                    Speaker = "User",
                    Text = result.Transcription!,
                    Language = new LanguageInfo { Code = result.DetectedLanguage!, Name = result.DetectedLanguage! },
                    MessageType = MessageType.Transcription
                };

                var messageResult = await _sessionService.AddMessageToSessionAsync(transcriptionMessage);
                if (!messageResult.IsSuccess)
                {
                    _logger.LogWarning("[{RequestId}] Failed to save transcription message: {Error}", 
                        requestId, messageResult.ErrorMessage);
                }
                else
                {
                    _logger.LogInformation("[{RequestId}] Saved transcription message with sequence number: {SequenceNumber}", 
                        requestId, transcriptionMessage.SequenceNumber);
                }

                // Step 2: Perform translation using TranslationOrchestrator
                _logger.LogInformation("[{RequestId}] Starting translation from {SourceLang} to {TargetLang}", 
                    requestId, result.DetectedLanguage, otherLanguage);

                var translationRequest = new EnhancedTranslationRequest
                {
                    Text = result.Transcription!,
                    SourceLanguage = result.DetectedLanguage!,
                    TargetLanguage = otherLanguage,
                    SessionId = sessionId,
                    IsPremium = bool.Parse(isPremium),
                    TriggerDetected = false, // TODO: Add trigger detection logic
                    SpeakerInfo = null, // TODO: Add speaker info if available
                    SessionContext = new Dictionary<string, object>()
                };

                var translationResponse = await _translationOrchestrator.ProcessTranslationAsync(translationRequest);

                if (translationResponse.Success)
                {
                    _logger.LogInformation("[{RequestId}] Translation successful using provider: {Provider}", 
                        requestId, translationResponse.ProviderUsed);

                    // Save translation as conversation message
                    var translationMessage = new ConversationMessageModel
                    {
                        SessionId = sessionId,
                        Speaker = "System",
                        Text = translationResponse.Translation,
                        Language = new LanguageInfo { Code = otherLanguage, Name = otherLanguage },
                        MessageType = MessageType.Translation
                    };

                    var translationMessageResult = await _sessionService.AddMessageToSessionAsync(translationMessage);
                    if (!translationMessageResult.IsSuccess)
                    {
                        _logger.LogWarning("[{RequestId}] Failed to save translation message: {Error}", 
                            requestId, translationMessageResult.ErrorMessage);
                    }
                }
                else
                {
                    _logger.LogError("[{RequestId}] Translation failed: {Error}", requestId, translationResponse.ErrorMessage);
                }

                var response = new
                {
                    success = true,
                    transcription = result.Transcription,
                    detected_language = result.DetectedLanguage,
                    translation = translationResponse.Success ? translationResponse.Translation : null,
                    translation_provider = translationResponse.Success ? translationResponse.ProviderUsed : null,
                    translation_processing_time_ms = translationResponse.ProcessingTimeMs,
                    confidence = result.Confidence,
                    provider_used = result.Provider,
                    processing_time_ms = result.ProcessingTimeMs,
                    is_fallback_result = result.IsFallbackResult,
                    session_id = sessionId,
                    sequence_number = transcriptionMessage.SequenceNumber,
                    file_info = new
                    {
                        name = file.FileName,
                        size = file.Length,
                        content_type = file.ContentType
                    },
                    timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                };

                return Ok(response);
            }
            else
            {
                _logger.LogError("[{RequestId}] STT processing failed: {Error}", requestId, result.ErrorMessage);
                return StatusCode(500, new 
                { 
                    success = false,
                    error = "Audio processing failed",
                    details = result.ErrorMessage,
                    session_id = sessionId,
                    request_id = requestId
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[{RequestId}] Unexpected error in audio processing", requestId);
            return StatusCode(500, new { 
                success = false,
                error = "Internal server error", 
                details = ex.Message,
                session_id = sessionId,
                request_id = requestId
            });
        }
    }
}