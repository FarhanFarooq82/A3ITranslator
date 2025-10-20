using A3ITranslator.Application.Enums;
using A3ITranslator.Application.DTOs.Common;

namespace A3ITranslator.Application.Models;

/// <summary>
/// Simple session model for in-memory storage
/// </summary>
public class SessionModel
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public LanguageInfo MainLanguage { get; set; } = new();
    public LanguageInfo OtherLanguage { get; set; } = new();
    public RequestType UserTier { get; set; }
    public SessionState State { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastActivity { get; set; }
    public DateTime ExpiresAt { get; set; }
    public int MessageCount { get; set; }
    public int FactsCount { get; set; }
    public int NextSpeakerNumber { get; set; } = 1;

    // Collections
    public List<ConversationMessageModel> Messages { get; set; } = new();
    public Dictionary<string, object> Facts { get; set; } = new();
    public Dictionary<string, int> SpeakerNumbers { get; set; } = new();
    public Dictionary<string, string> SpeakerNames { get; set; } = new();
}
