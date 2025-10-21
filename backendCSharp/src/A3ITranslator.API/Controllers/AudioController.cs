using Microsoft.AspNetCore.Mvc;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.DTOs.Audio;

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

    public AudioController(
        ILogger<AudioController> logger,
        IAudioProcessingOrchestrator audioOrchestrator,
        ISessionService sessionService)
    {
        _logger = logger;
        _audioOrchestrator = audioOrchestrator;
        _sessionService = sessionService;
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
        try
        {
            _logger.LogInformation("=== Audio Processing with STT Provider Selection ===");
            _logger.LogInformation("File: {FileName}, ContentType: {ContentType}, Size: {Size} bytes", 
                file?.FileName ?? "null", file?.ContentType ?? "null", file?.Length ?? 0);
            _logger.LogInformation("MainLanguage: {MainLanguage}, TargetLanguage: {TargetLanguage}", 
                mainLanguage, otherLanguage);

            // Basic validation
            if (string.IsNullOrWhiteSpace(sessionId))
            {
                _logger.LogError("No session ID provided - this is required");
                return BadRequest(new { error = "Session ID is required for audio processing" });
            }

            if (file == null || file.Length == 0)
            {
                _logger.LogError("No audio file provided");
                return BadRequest(new { error = "Audio file is required for processing" });
            }

            if (string.IsNullOrWhiteSpace(mainLanguage) || string.IsNullOrWhiteSpace(otherLanguage))
            {
                _logger.LogError("Language parameters missing");
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
                _logger.LogError("Session {SessionId} not found or invalid", sessionId);
                return BadRequest(new { error = "Invalid session ID" });
            }

            var session = sessionResult.Value;
            if (session == null)
            {
                _logger.LogError("Session {SessionId} data is null", sessionId);
                return BadRequest(new { error = "Session data not available" });
            }
            _logger.LogInformation("Processing audio with session {SessionId} assigned STT providers: [{STTProviders}], TTS providers: [{TTSProviders}]", 
                sessionId, 
                string.Join(", ", session.AssignedSTTProviders),
                string.Join(", ", session.AssignedTTSProviders));

            // Process audio using session's assigned STT providers with fallback
            var result = await _audioOrchestrator.ProcessAudioWithSessionProvidersAsync(
                audioData, session.AssignedSTTProviders, mainLanguage, otherLanguage, HttpContext.RequestAborted);

            if (result.Success)
            {
                _logger.LogInformation("STT processing successful with provider: {Provider} in {Time}ms", 
                    result.Provider, result.ProcessingTimeMs);

                var response = new
                {
                    success = true,
                    transcription = result.Transcription,
                    detected_language = result.DetectedLanguage,
                    confidence = result.Confidence,
                    provider_used = result.Provider,
                    processing_time_ms = result.ProcessingTimeMs,
                    is_fallback_result = result.IsFallbackResult,
                    session_id = sessionId,
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
                _logger.LogError("STT processing failed: {Error}", result.ErrorMessage);
                return StatusCode(500, new 
                { 
                    success = false,
                    error = "Audio processing failed",
                    details = result.ErrorMessage,
                    session_id = sessionId
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error in audio processing");
            return StatusCode(500, new { 
                success = false,
                error = "Internal server error", 
                details = ex.Message,
                session_id = sessionId
            });
        }
    }
}