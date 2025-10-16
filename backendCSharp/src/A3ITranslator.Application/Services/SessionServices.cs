using A3ITranslator.Application.Common;
using A3ITranslator.Application.DTOs;
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
/// Create session request DTO
/// </summary>
public class CreateSessionDto
{
    public string UserId { get; set; } = string.Empty;
    public string MainLanguage { get; set; } = string.Empty;
    public string OtherLanguage { get; set; } = string.Empty;
    public UserTier UserTier { get; set; } = UserTier.Standard;
    public TimeSpan? SessionTimeout { get; set; }
}

/// <summary>
/// Add message to session DTO
/// </summary>
public class AddMessageDto
{
    public string Speaker { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string Language { get; set; } = string.Empty;
    public MessageType MessageType { get; set; }
    public SpeakerDto? SpeakerInfo { get; set; }
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
