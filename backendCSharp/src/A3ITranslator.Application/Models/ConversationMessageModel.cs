using A3ITranslator.Application.Enums;
using A3ITranslator.Application.DTOs.Common;
using A3ITranslator.Application.DTOs.Speaker;

namespace A3ITranslator.Application.Models;

/// <summary>
/// Simple conversation message model for in-memory storage
/// </summary>
public class ConversationMessageModel
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string SessionId { get; set; } = string.Empty;
    public string Speaker { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public LanguageInfo Language { get; set; } = new();

    public int SequenceNumber { get; set; } = 0;
    
    // Translation fields
    public string? TranslatedText { get; set; }
    public LanguageInfo? TranslationLanguage { get; set; }
    
    public MessageType MessageType { get; set; }
    public SpeakerInfo? SpeakerInfo { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
