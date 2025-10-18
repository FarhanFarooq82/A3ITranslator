using Microsoft.AspNetCore.Mvc;
using A3ITranslator.Application.Services;

namespace A3ITranslator.API.Controllers;

/// <summary>
/// Languages controller - provides STT language support from all providers
/// </summary>
[ApiController]
[Route("")]
public class LanguagesController : ControllerBase
{
    private readonly ILogger<LanguagesController> _logger;
    private readonly ILanguageService _languageService;

    public LanguagesController(ILogger<LanguagesController> logger, ILanguageService languageService)
    {
        _logger = logger;
        _languageService = languageService;
    }

    /// <summary>
    /// Get all available STT languages from all providers
    /// Frontend endpoint: /available-languages/
    /// </summary>
    [HttpGet("available-languages")]
    public IActionResult GetAvailableLanguages()
    {
        try
        {
            _logger.LogInformation("Fetching available STT languages from all providers");
            
            var languages = _languageService.GetAllSupportedLanguages();
            
            // Transform to array format expected by frontend
            var languageArray = languages.Select(kvp => new 
            {
                code = kvp.Key,
                display_name = kvp.Value
            }).ToArray();
            
            _logger.LogInformation("Returning {Count} available languages", languageArray.Length);
            return Ok(languageArray);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching available languages");
            return StatusCode(500, new { error = "Failed to get available languages" });
        }
    }
}
