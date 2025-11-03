namespace A3ITranslator.Application.DTOs.Speaker;

/// <summary>
/// Voice information DTO
/// </summary>
public class VoiceInfo
{
    public string Name { get; set; } = string.Empty;
    public string Language { get; set; } = string.Empty;
    public string Gender { get; set; } = string.Empty;
    public string Quality { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
}
