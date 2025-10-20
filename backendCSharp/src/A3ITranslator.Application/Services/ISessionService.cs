using A3ITranslator.Application.Common;
using A3ITranslator.Application.DTOs.Speaker;
using A3ITranslator.Application.DTOs.Api;
using A3ITranslator.Application.Models;

namespace A3ITranslator.Application.Services;

/// <summary>
/// Session management service interface
/// </summary>
public interface ISessionService
{
    Task<Result<SessionResponse>> CreateSessionAsync(SessionRequest request);
    Task<Result<List<ConversationMessageModel>>> GetSessionMessagesAsync(string sessionId);
    Task<Result> UpdateSessionActivityAsync(string sessionId);
    Task<Result> AddFactToSessionAsync(string sessionId, string key, object value);
    Task<Result> SetSpeakerNameAsync(string sessionId, string speakerId, string name);
    Task<Result<SpeakerInfo>> GetSpeakerInfoAsync(string sessionId, string speakerId);
    Task<Result> EndSessionAsync(string sessionId);
    Task<Result> CleanupExpiredSessionsAsync();
}



// TODO: Repository interfaces removed for MVP - using in-memory storage
// Future: Re-implement when adding persistent storage for crash recovery
// See SESSION_MANAGEMENT_TODO.md for details
