using Microsoft.AspNetCore.Mvc;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.DTOs.GenAI;

namespace A3ITranslator.API.Controllers;

/// <summary>
/// GenAI Controller for prompt/response with AI models
/// Supports Azure Copilot, Gemini, OpenAI GPT, etc.
/// </summary>
[ApiController]
[Route("genai")]
public class GenAIController : ControllerBase
{
    private readonly IEnumerable<IGenAIService> _genAIServices;
    private readonly ILogger<GenAIController> _logger;

    public GenAIController(IEnumerable<IGenAIService> genAIServices, ILogger<GenAIController> logger)
    {
        _genAIServices = genAIServices;
        _logger = logger;
    }

    /// <summary>
    /// Send prompt to GenAI service and get response
    /// </summary>
    [HttpPost("prompt")]
    public async Task<IActionResult> SendPrompt([FromBody] GenAIPromptDto request)
    {
        try
        {
            _logger.LogInformation("Processing GenAI prompt for session {SessionId}", request.SessionId);

            // Use first available GenAI service (can be made configurable later)
            var genAIService = _genAIServices.FirstOrDefault();
            if (genAIService == null)
            {
                return BadRequest("No GenAI services available");
            }

            var result = await genAIService.SendPromptAsync(request.Prompt, request.Language, request.SessionId);
            
            if (!result.IsSuccess)
            {
                return BadRequest(result.ErrorMessage);
            }

            var response = new GenAIResponseDto
            {
                Response = result.Value!,
                Language = request.Language,
                Provider = genAIService.GetServiceName(),
                Confidence = 0.95f, // TODO: Get actual confidence from service
                ProcessingTime = TimeSpan.FromMilliseconds(100) // TODO: Measure actual time
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing GenAI prompt");
            return StatusCode(500, "Internal server error");
        }
    }

    /// <summary>
    /// Get available GenAI services and their capabilities
    /// </summary>
    [HttpGet("services")]
    public IActionResult GetGenAIServices()
    {
        try
        {
            var services = _genAIServices.Select(service => new
            {
                Name = service.GetServiceName(),
                Capabilities = service.GetCapabilities()
            });

            return Ok(services);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting GenAI services");
            return StatusCode(500, "Internal server error");
        }
    }
}
