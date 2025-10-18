using A3ITranslator.Application.Common;
using A3ITranslator.Application.DTOs.Session;
using A3ITranslator.Application.DTOs.Speaker;
using A3ITranslator.Domain.Entities;
using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Application.Services;

/// <summary>
/// Session management service interface
/// </summary>
public interface ISessionService
{
    Task<Result<SessionDto>> CreateSessionAsync(CreateSessionDto request);
    Task<Result<SessionDto>> GetSessionAsync(string sessionId);
    Task<Result> UpdateSessionActivityAsync(string sessionId);
    Task<Result> AddMessageToSessionAsync(string sessionId, AddMessageDto message);
    Task<Result> AddFactToSessionAsync(string sessionId, string key, object value);
    Task<Result> SetSpeakerNameAsync(string sessionId, string speakerId, string name);
    Task<Result<SpeakerDto>> GetSpeakerInfoAsync(string sessionId, string speakerId);
    Task<Result> EndSessionAsync(string sessionId);
    Task<Result> CleanupExpiredSessionsAsync();
}

/// <summary>
/// Speaker identification service interface
/// </summary>
public interface ISpeakerIdentificationService
{
    Task<Result<SpeakerDto>> IdentifyOrCreateSpeakerAsync(string sessionId, byte[] audioData, string source);
    Task<Result<SpeakerDto>> EnhanceWithDisplayInfoAsync(string sessionId, SpeakerDto speaker);
    Task<Result> UpdateSpeakerNameAsync(string sessionId, string speakerId, string name);
    Task<Result> CleanupSessionSpeakersAsync(string sessionId);
}

/// <summary>
/// Simple repository interfaces for data access
/// </summary>
public interface ISessionRepository
{
    Task<Session?> GetByIdAsync(string sessionId);
    Task<Session> CreateAsync(Session session);
    Task<Session> UpdateAsync(Session session);
    Task<bool> DeleteAsync(string sessionId);
    Task<IEnumerable<Session>> GetExpiredSessionsAsync();
}

public interface ISpeakerProfileRepository
{
    Task<IEnumerable<SpeakerProfile>> GetBySessionIdAsync(string sessionId);
    Task<SpeakerProfile?> GetByExternalIdAsync(string externalSpeakerId);
    Task<SpeakerProfile> CreateAsync(SpeakerProfile profile);
    Task<SpeakerProfile> UpdateAsync(SpeakerProfile profile);
    Task<bool> DeleteAsync(string profileId);
    Task<bool> DeleteBySessionIdAsync(string sessionId);
}
