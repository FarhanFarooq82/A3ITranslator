using Microsoft.AspNetCore.Mvc;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.DTOs.Api;

namespace A3ITranslator.API.Controllers;

/// <summary>
/// Conversation management controller
/// Handles conversation synchronization and loading as defined in SESSION_ARCHITECTURE.md
/// </summary>
[ApiController]
[Route("api/conversation")]
public class ConversationController : ControllerBase
{
    private readonly ISessionService _sessionService;
    private readonly ILogger<ConversationController> _logger;

    public ConversationController(ISessionService sessionService, ILogger<ConversationController> logger)
    {
        _sessionService = sessionService;
        _logger = logger;
    }

    /// <summary>
    /// Loads conversation history for a session
    /// GET /api/conversation/load/{sessionId}
    /// </summary>
    [HttpGet("load/{sessionId}")]
    public async Task<ActionResult<ConversationResponse>> LoadConversation(string sessionId)
    {
        try
        {
            _logger.LogInformation("Loading conversation for session {SessionId}", sessionId);

            var messagesResult = await _sessionService.GetSessionMessagesAsync(sessionId);
            if (!messagesResult.IsSuccess)
            {
                _logger.LogError("Failed to load messages for session {SessionId}: {Error}", 
                    sessionId, messagesResult.ErrorMessage);
                return NotFound(new ConversationResponse
                {
                    Success = false,
                    Message = messagesResult.ErrorMessage ?? "Session not found"
                });
            }

            var messageDtos = messagesResult.Value!;
            var messages = messageDtos.Select(m => new ConversationEntry
            {
                Speaker = m.Speaker,
                Content = m.Text,
                Language = m.Language.Code,
                Timestamp = m.Timestamp,
                TranslatedText = m.TranslatedText ?? "",
                TranslationLanguage = m.TranslationLanguage.Code ?? "",
                SequenceNumber = m.SequenceNumber

            }).ToList();

            _logger.LogInformation("Loaded {MessageCount} messages for session {SessionId}", 
                messages.Count, sessionId);

            return Ok(new ConversationResponse
            {
                Success = true,
                Message = "Conversation loaded successfully",
                Messages = messages
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading conversation for session {SessionId}", sessionId);
            return StatusCode(500, new ConversationResponse
            {
                Success = false,
                Message = "Internal server error"
            });
        }
    }

    /// <summary>
    /// Deletes conversation data for a session
    /// DELETE /api/conversation/delete/{sessionId}
    /// </summary>
    [HttpDelete("delete/{sessionId}")]
    public async Task<ActionResult<ConversationResponse>> DeleteConversation(string sessionId)
    {
        try
        {
            _logger.LogInformation("Deleting conversation for session {SessionId}", sessionId);

            var result = await _sessionService.EndSessionAsync(sessionId);
            if (!result.IsSuccess)
            {
                _logger.LogError("Failed to delete conversation for session {SessionId}: {Error}", 
                    sessionId, result.ErrorMessage);
                return NotFound(new ConversationResponse
                {
                    Success = false,
                    Message = result.ErrorMessage
                });
            }

            _logger.LogInformation("Conversation deleted successfully for session {SessionId}", sessionId);
            return Ok(new ConversationResponse
            {
                Success = true,
                Message = "Conversation deleted successfully"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting conversation for session {SessionId}", sessionId);
            return StatusCode(500, new ConversationResponse
            {
                Success = false,
                Message = "Internal server error"
            });
        }
    }
}
