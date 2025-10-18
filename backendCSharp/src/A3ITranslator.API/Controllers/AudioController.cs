using Microsoft.AspNetCore.Mvc;

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

    public AudioController(ILogger<AudioController> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Process audio file - Basic endpoint validation
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
            _logger.LogInformation("=== Audio Processing Endpoint Test ===");
            _logger.LogInformation("File: {FileName}, ContentType: {ContentType}, Size: {Size} bytes", 
                file?.FileName ?? "null", file?.ContentType ?? "null", file?.Length ?? 0);
            _logger.LogInformation("MainLanguage: {MainLanguage}", mainLanguage);
            _logger.LogInformation("OtherLanguage: {OtherLanguage}", otherLanguage);
            _logger.LogInformation("IsPremium: {IsPremium}", isPremium);
            _logger.LogInformation("SessionId: {SessionId}", sessionId);

            // Basic validation - session ID is mandatory
            if (string.IsNullOrWhiteSpace(sessionId))
            {
                _logger.LogError("No session ID provided - this is required");
                return BadRequest(new { error = "Session ID is required for audio processing. Frontend must provide a valid session ID." });
            }

            // Basic validation - file is mandatory
            if (file == null || file.Length == 0)
            {
                _logger.LogError("No audio file provided");
                return BadRequest(new { error = "Audio file is required for processing. Please upload a valid audio file." });
            }

            // Simulate processing response (placeholder)
            var response = new
            {
                success = true,
                message = "Audio processing endpoint test successful",
                session_id = sessionId,
                processing_info = new
                {
                    file_name = file.FileName,
                    file_size = file.Length,
                    content_type = file.ContentType,
                    main_language = mainLanguage,
                    other_language = otherLanguage
                },
                is_premium = isPremium.ToLower() == "true",
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            };

            _logger.LogInformation("=== Audio Processing SUCCESS - Endpoint validation complete ===");
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error in audio endpoint");
            return StatusCode(500, new { error = "Internal server error", details = ex.Message });
        }
    }
}
