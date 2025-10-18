using A3ITranslator.Application.DTOs.Speaker;
using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Application.DTOs.Session;

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
