using Microsoft.AspNetCore.Mvc;

namespace A3ITranslator.API.Controllers;

/// <summary>
/// Audio processing controller - Step 1: Basic endpoint structure
/// Compatible with Python backend API contract
/// </summary>
[ApiController]
[Route("")]
public class AudioController : ControllerBase
{
    private readonly ILogger<AudioController> _logger;

    public AudioController(ILogger<AudioController> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Process audio file - Step 1: Basic endpoint validation
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
            _logger.LogInformation("=== STEP 1: Basic Endpoint Test ===");
            _logger.LogInformation("File: {FileName}, ContentType: {ContentType}, Size: {Size} bytes", 
                file?.FileName ?? "null", file?.ContentType ?? "null", file?.Length ?? 0);
            _logger.LogInformation("MainLanguage: {MainLanguage}", mainLanguage);
            _logger.LogInformation("OtherLanguage: {OtherLanguage}", otherLanguage);
            _logger.LogInformation("IsPremium: {IsPremium}", isPremium);
            _logger.LogInformation("SessionId: {SessionId}", sessionId);

            // Step 1: Basic validation - session ID is mandatory
            if (string.IsNullOrWhiteSpace(sessionId))
            {
                _logger.LogError("No session ID provided - this is required");
                return BadRequest(new { error = "Session ID is required for audio processing. Frontend must provide a valid session ID." });
            }

            // Step 1: Basic file validation
            if (file == null || file.Length == 0)
            {
                _logger.LogError("No audio file provided");
                return BadRequest(new { error = "Audio file is required" });
            }

            // Step 1: Basic language validation
            if (string.IsNullOrWhiteSpace(mainLanguage) || string.IsNullOrWhiteSpace(otherLanguage))
            {
                _logger.LogError("Main language and other language are required");
                return BadRequest(new { error = "Both main_language and other_language are required" });
            }

            // Step 1: Success response - just return basic structure for testing
            var response = new
            {
                success = true,
                session_id = sessionId,
                message = "Step 1: Endpoint working - received audio file successfully",
                file_info = new
                {
                    filename = file.FileName,
                    content_type = file.ContentType,
                    size_bytes = file.Length
                },
                languages = new
                {
                    main = mainLanguage,
                    other = otherLanguage
                },
                is_premium = isPremium.ToLower() == "true",
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            };

            _logger.LogInformation("=== STEP 1: SUCCESS - Endpoint validation complete ===");
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Step 1: Unexpected error in audio endpoint");
            return StatusCode(500, new { error = "Internal server error", details = ex.Message });
        }
    }

    /// <summary>
    /// Get available languages - Step 1: Basic hardcoded response
    /// Matches Python endpoint: GET /available-languages/
    /// </summary>
    [HttpGet("available-languages")]
    public ActionResult GetAvailableLanguages()
    {
        try
        {
            _logger.LogInformation("=== STEP 1: Languages Endpoint Test ===");

            // Step 1: Return core languages as defined in architecture
            var languages = new Dictionary<string, string>
            {
                {"en-US", "English (United States)"},
                {"en-GB", "English (United Kingdom)"},
                {"ur-IN", "Urdu (India)"},
                {"ur-PK", "Urdu (Pakistan)"},
                {"zh-CN", "Chinese (Mandarin, Simplified)"},
                {"ar-SA", "Arabic (Saudi Arabia)"},
                {"hi-IN", "Hindi (India)"},
                {"es-ES", "Spanish (Spain)"},
                {"fr-FR", "French (France)"},
                {"de-DE", "German (Germany)"},
                {"ja-JP", "Japanese (Japan)"},
                {"ko-KR", "Korean (South Korea)"},
                {"pt-BR", "Portuguese (Brazil)"},
                {"ru-RU", "Russian (Russia)"},
                {"it-IT", "Italian (Italy)"}
            };

            _logger.LogInformation("=== STEP 1: Returning {Count} languages ===", languages.Count);
            return Ok(languages);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Step 1: Error in languages endpoint");
            return StatusCode(503, new { error = "Language services unavailable", details = ex.Message });
        }
    }
}
