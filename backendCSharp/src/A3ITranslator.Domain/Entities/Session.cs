using A3ITranslator.Domain.Common;
using A3ITranslator.Domain.Enums;
using A3ITranslator.Domain.ValueObjects;

namespace A3ITranslator.Domain.Entities;

/// <summary>
/// Session entity representing a user's translation session
/// </summary>
public class Session : BaseEntity
{
    private readonly List<ConversationMessage> _messages = new();
    private readonly Dictionary<string, object> _facts = new();
    private readonly Dictionary<string, int> _speakerNumbers = new();
    private readonly Dictionary<string, string> _speakerNames = new();

    public string UserId { get; private set; }
    public LanguageInfo MainLanguage { get; private set; }
    public LanguageInfo OtherLanguage { get; private set; }
    public UserTier UserTier { get; private set; }
    public SessionState State { get; private set; }
    public DateTime LastActivity { get; private set; }
    public DateTime? ExpiresAt { get; private set; }
    public int MessageCount { get; private set; }
    public int FactsCount { get; private set; }
    public int NextSpeakerNumber { get; private set; } = 1;

    // Read-only collections
    public IReadOnlyList<ConversationMessage> Messages => _messages.AsReadOnly();
    public IReadOnlyDictionary<string, object> Facts => _facts.AsReadOnly();
    public IReadOnlyDictionary<string, int> SpeakerNumbers => _speakerNumbers.AsReadOnly();
    public IReadOnlyDictionary<string, string> SpeakerNames => _speakerNames.AsReadOnly();

    // For EF Core
    protected Session() { }

    public Session(
        string userId,
        LanguageInfo mainLanguage,
        LanguageInfo otherLanguage,
        UserTier userTier,
        TimeSpan? sessionTimeout = null)
    {
        if (string.IsNullOrWhiteSpace(userId))
            throw new ArgumentException("User ID cannot be null or empty", nameof(userId));

        UserId = userId;
        MainLanguage = mainLanguage ?? throw new ArgumentNullException(nameof(mainLanguage));
        OtherLanguage = otherLanguage ?? throw new ArgumentNullException(nameof(otherLanguage));
        UserTier = userTier;
        State = SessionState.Active;
        LastActivity = DateTime.UtcNow;
        ExpiresAt = sessionTimeout.HasValue ? DateTime.UtcNow.Add(sessionTimeout.Value) : null;
    }

    public void UpdateActivity()
    {
        LastActivity = DateTime.UtcNow;
        SetUpdatedAt();
    }

    public void AddMessage(ConversationMessage message)
    {
        ArgumentNullException.ThrowIfNull(message);
        
        _messages.Add(message);
        MessageCount = _messages.Count;
        UpdateActivity();
    }

    public void AddFact(string key, object value)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Fact key cannot be null or empty", nameof(key));

        _facts[key] = value ?? throw new ArgumentNullException(nameof(value));
        FactsCount = _facts.Count;
        UpdateActivity();
    }

    public int GetSpeakerNumber(string speakerId)
    {
        if (string.IsNullOrWhiteSpace(speakerId))
            throw new ArgumentException("Speaker ID cannot be null or empty", nameof(speakerId));

        if (!_speakerNumbers.ContainsKey(speakerId))
        {
            _speakerNumbers[speakerId] = NextSpeakerNumber++;
            UpdateActivity();
        }

        return _speakerNumbers[speakerId];
    }

    public void SetSpeakerName(string speakerId, string name)
    {
        if (string.IsNullOrWhiteSpace(speakerId))
            throw new ArgumentException("Speaker ID cannot be null or empty", nameof(speakerId));
        
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Speaker name cannot be null or empty", nameof(name));

        _speakerNames[speakerId] = name;
        UpdateActivity();
    }

    public string? GetSpeakerName(string speakerId)
    {
        return _speakerNames.TryGetValue(speakerId, out var name) ? name : null;
    }

    public void ExpireSession()
    {
        State = SessionState.Expired;
        SetUpdatedAt();
    }

    public void TerminateSession()
    {
        State = SessionState.Terminated;
        SetUpdatedAt();
    }

    public bool IsExpired()
    {
        return ExpiresAt.HasValue && DateTime.UtcNow > ExpiresAt.Value;
    }

    public bool IsActive()
    {
        return State == SessionState.Active && !IsExpired();
    }
}
