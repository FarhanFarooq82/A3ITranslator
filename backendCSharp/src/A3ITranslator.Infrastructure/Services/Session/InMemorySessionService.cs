using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using A3ITranslator.Application.Common;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.Models;
using A3ITranslator.Application.Enums;
using A3ITranslator.Application.DTOs.Common;
using SpeakerInfoDto = A3ITranslator.Application.DTOs.Speaker.SpeakerInfo;
using A3ITranslator.Application.DTOs.Api;

namespace A3ITranslator.Infrastructure.Services.Session;

/// <summary>
/// Simplified thread-safe in-memory session service implementation
/// </summary>
public class InMemorySessionService : ISessionService
{
    private readonly ConcurrentDictionary<string, SessionModel> _sessions = new();
    private readonly ILogger<InMemorySessionService> _logger;
    private readonly Timer _cleanupTimer;

    public InMemorySessionService(ILogger<InMemorySessionService> logger)
    {
        _logger = logger;
        
        // Set up cleanup timer - runs every 30 minutes
        _cleanupTimer = new Timer(CleanupExpiredSessions, null, 
            TimeSpan.FromMinutes(30), TimeSpan.FromMinutes(30));
    }

    public async Task<Result<SessionResponse>> CreateSessionAsync(SessionRequest request)
    {
        try
        {
            var sessionId = Guid.NewGuid().ToString();
            var now = DateTime.UtcNow;

            var session = new SessionModel
            {
                Id = sessionId,
                MainLanguage = new LanguageInfo(request.MainLanguage, request.MainLanguage, request.MainLanguage),
                OtherLanguage = new LanguageInfo(request.OtherLanguage, request.OtherLanguage, request.OtherLanguage),
                UserTier = request.IsPremium ? RequestType.Premium : RequestType.Standard,
                State = SessionState.Active,
                CreatedAt = now,
                LastActivity = now,
                ExpiresAt = now.AddHours(4), // 4 hour session timeout
                MessageCount = 0,
                FactsCount = 0
            };

            _sessions[sessionId] = session;

            var sessionDto = new SessionResponse
            {
                SessionId = session.Id,
                MainLanguage = session.MainLanguage.Code,
                OtherLanguage = session.OtherLanguage.Code,
                IsPremium = session.UserTier == RequestType.Premium ? true : false,
                CreatedAt = session.CreatedAt,
                ExpiresAt = session.ExpiresAt
            };

            _logger.LogInformation("Created session {SessionId}", sessionId);
            return await Task.FromResult(Result<SessionResponse>.Success(sessionDto));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating session");
            return Result<SessionResponse>.Failure("Failed to create session", ex);
        }
    }
    public async Task<Result<List<ConversationMessageModel>>> GetSessionMessagesAsync(string sessionId)
    {
        try
        {
            if (!_sessions.TryGetValue(sessionId, out var session))
            {
                return Result<List<ConversationMessageModel>>.Failure("Session not found");
            }


            return await Task.FromResult(Result<List<ConversationMessageModel>>.Success(session.Messages));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting messages for session {SessionId}", sessionId);
            return Result<List<ConversationMessageModel>>.Failure("Failed to get session messages", ex);
        }
    }

    public async Task<Result> UpdateSessionActivityAsync(string sessionId)
    {
        try
        {
            if (!_sessions.TryGetValue(sessionId, out var session))
            {
                return Result.Failure("Session not found");
            }

            session.LastActivity = DateTime.UtcNow;
            return await Task.FromResult(Result.Success());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating session activity {SessionId}", sessionId);
            return Result.Failure("Failed to update session activity", ex);
        }
    }

    public async Task<Result> AddMessageToSessionAsync(ConversationMessageModel conversationMessage)
    {
        try
        {
            if (!_sessions.TryGetValue(conversationMessage.SessionId, out var session))
            {
                return Result.Failure("Session not found");
            }


            session.Messages.Add(conversationMessage);
            session.MessageCount = session.Messages.Count;
            session.LastActivity = DateTime.UtcNow;

            return await Task.FromResult(Result.Success());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding message to session {SessionId}", conversationMessage.SessionId);
            return Result.Failure("Failed to add message to session", ex);
        }
    }

    public async Task<Result> AddFactToSessionAsync(string sessionId, string key, object value)
    {
        try
        {
            if (!_sessions.TryGetValue(sessionId, out var session))
            {
                return Result.Failure("Session not found");
            }

            session.Facts[key] = value;
            session.FactsCount = session.Facts.Count;
            session.LastActivity = DateTime.UtcNow;

            return await Task.FromResult(Result.Success());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding fact to session {SessionId}", sessionId);
            return Result.Failure("Failed to add fact to session", ex);
        }
    }

    public async Task<Result> SetSpeakerNameAsync(string sessionId, string speakerId, string name)
    {
        try
        {
            if (!_sessions.TryGetValue(sessionId, out var session))
            {
                return Result.Failure("Session not found");
            }

            session.SpeakerNames[speakerId] = name;
            session.LastActivity = DateTime.UtcNow;

            return await Task.FromResult(Result.Success());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error setting speaker name for session {SessionId}", sessionId);
            return Result.Failure("Failed to set speaker name", ex);
        }
    }

    public async Task<Result<SpeakerInfoDto>> GetSpeakerInfoAsync(string sessionId, string speakerId)
    {
        try
        {
            if (!_sessions.TryGetValue(sessionId, out var session))
            {
                return Result<SpeakerInfoDto>.Failure("Session not found");
            }

            var speakerNumber = session.SpeakerNumbers.GetValueOrDefault(speakerId, 0);
            if (speakerNumber == 0)
            {
                speakerNumber = session.NextSpeakerNumber++;
                session.SpeakerNumbers[speakerId] = speakerNumber;
            }

            var speakerName = session.SpeakerNames.GetValueOrDefault(speakerId);
            var displayName = speakerName ?? $"Speaker {speakerNumber}";

            var speakerInfo = new SpeakerInfoDto
            {
                SpeakerId = speakerId,
                SpeakerName = speakerName,
                DisplayName = displayName,
                SpeakerNumber = speakerNumber,
                IdentificationConfidence = 1.0f,
                IsKnownSpeaker = !string.IsNullOrEmpty(speakerName),
                Source = "session",
                Gender = Gender.Unknown
            };

            return await Task.FromResult(Result<SpeakerInfoDto>.Success(speakerInfo));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting speaker info for session {SessionId}", sessionId);
            return Result<SpeakerInfoDto>.Failure("Failed to get speaker info", ex);
        }
    }

    public async Task<Result> EndSessionAsync(string sessionId)
    {
        try
        {
            if (!_sessions.TryGetValue(sessionId, out var session))
            {
                return Result.Failure("Session not found");
            }

            session.State = SessionState.Terminated;
            session.LastActivity = DateTime.UtcNow;

            _logger.LogInformation("Ended session {SessionId}", sessionId);
            return await Task.FromResult(Result.Success());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ending session {SessionId}", sessionId);
            return Result.Failure("Failed to end session", ex);
        }
    }

    public async Task<Result> CleanupExpiredSessionsAsync()
    {
        try
        {
            var now = DateTime.UtcNow;
            var expiredSessions = new List<string>();

            foreach (var kvp in _sessions)
            {
                if (kvp.Value.ExpiresAt < now)
                {
                    expiredSessions.Add(kvp.Key);
                }
            }

            foreach (var sessionId in expiredSessions)
            {
                _sessions.TryRemove(sessionId, out _);
            }

            _logger.LogInformation("Cleaned up {Count} expired sessions", expiredSessions.Count);
            return await Task.FromResult(Result.Success());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error cleaning up expired sessions");
            return Result.Failure("Failed to cleanup expired sessions", ex);
        }
    }

    private async void CleanupExpiredSessions(object? state)
    {
        await CleanupExpiredSessionsAsync();
    }

    public void Dispose()
    {
        _cleanupTimer?.Dispose();
    }
}
