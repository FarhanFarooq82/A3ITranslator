using A3ITranslator.Domain.Common;
using A3ITranslator.Domain.Enums;
using A3ITranslator.Domain.ValueObjects;

namespace A3ITranslator.Domain.Entities;

/// <summary>
/// Conversation message entity
/// </summary>
public class ConversationMessage : BaseEntity
{
    public string SessionId { get; private set; }
    public string Speaker { get; private set; }
    public string Text { get; private set; }
    public LanguageInfo Language { get; private set; }
    public MessageType MessageType { get; private set; }
    public SpeakerInfo? SpeakerInfo { get; private set; }
    public DateTime Timestamp { get; private set; }

    // For EF Core
    protected ConversationMessage() { }

    public ConversationMessage(
        string sessionId,
        string speaker,
        string text,
        LanguageInfo language,
        MessageType messageType,
        SpeakerInfo? speakerInfo = null)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            throw new ArgumentException("Session ID cannot be null or empty", nameof(sessionId));
        
        if (string.IsNullOrWhiteSpace(speaker))
            throw new ArgumentException("Speaker cannot be null or empty", nameof(speaker));
        
        if (string.IsNullOrWhiteSpace(text))
            throw new ArgumentException("Text cannot be null or empty", nameof(text));

        SessionId = sessionId;
        Speaker = speaker;
        Text = text;
        Language = language ?? throw new ArgumentNullException(nameof(language));
        MessageType = messageType;
        SpeakerInfo = speakerInfo;
        Timestamp = DateTime.UtcNow;
    }
}
