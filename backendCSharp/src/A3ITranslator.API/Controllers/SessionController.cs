using Microsoft.AspNetCore.Mvc;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.DTOs.Api;

namespace A3ITranslator.API.Controllers;

/// <summary>
/// Session management controller
/// Handles session lifecycle operations as defined in SESSION_ARCHITECTURE.md
/// </summary>
[ApiController]
[Route("api/session")]
public class SessionController : ControllerBase
{
    private readonly ISessionService _sessionService;
    private readonly ILogger<SessionController> _logger;

    public SessionController(ISessionService sessionService, ILogger<SessionController> logger)
    {
        _sessionService = sessionService;
        _logger = logger;
    }

    /// <summary>
    /// Creates a new session with server-generated ID
    /// POST /api/session/create
    /// </summary>
    [HttpPost("create")]
    public async Task<ActionResult<SessionResponse>> CreateSession([FromBody] SessionRequest request)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8]; // Short unique ID for this request
        
        try
        {
            _logger.LogInformation("[{RequestId}] === SESSION CREATE REQUEST START ===", requestId);
            _logger.LogInformation("[{RequestId}] Creating new session for languages {MainLanguage} -> {OtherLanguage}",
                requestId, request.MainLanguage, request.OtherLanguage);

            var result = await _sessionService.CreateSessionAsync(request);

            if (!result.IsSuccess)
            {
                _logger.LogError("[{RequestId}] Failed to create session: {Error}", requestId, result.ErrorMessage);
                return BadRequest(new SessionResponse
                {
                    Success = false,
                    Message = result.ErrorMessage ?? "Failed to create session"
                });
            }

            var session = result.Value!;
            _logger.LogInformation("[{RequestId}] Session created successfully: {SessionId}", requestId, session.SessionId);
            session.Success = true;
            session.Message = "Session created successfully";
            return Ok(session);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[{RequestId}] Error creating session", requestId);
            return StatusCode(500, new SessionResponse
            {
                Success = false,
                Message = "Internal server error"
            });
        }
    }
    /// <summary>
    /// Ends and deletes a session
    /// DELETE /api/session/{sessionId}
    /// </summary>
    [HttpDelete("{sessionId}")]
    public async Task<ActionResult<SessionEndResponse>> DeleteSession(string sessionId)
    {
        try
        {
            _logger.LogInformation("Ending session: {SessionId}", sessionId);

            var result = await _sessionService.EndSessionAsync(sessionId);

            if (!result.IsSuccess)
            {
                _logger.LogError("Failed to end session {SessionId}: {Error}", sessionId, result.ErrorMessage);
                return NotFound(new SessionEndResponse
                {
                    Success = false,
                    Message = result.ErrorMessage
                });
            }

            _logger.LogInformation("Session ended successfully: {SessionId}", sessionId);
            return Ok(new SessionEndResponse
            {
                Success = true,
                Message = "Session ended successfully"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ending session {SessionId}", sessionId);
            return StatusCode(500, new SessionEndResponse
            {
                Success = false,
                Message = "Internal server error"
            });
        }
    }
}
