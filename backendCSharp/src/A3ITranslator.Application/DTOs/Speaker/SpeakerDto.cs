using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Application.DTOs.Speaker;

/// <summary>
/// Consolidated Speaker DTO - replaces both SpeakerInfo and SpeakerDto
/// Contains all speaker-related information for identification and display
/// </summary>
public class SpeakerDto
{
    public string SpeakerId { get; set; } = string.Empty;
    public string? SpeakerName { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public int SpeakerNumber { get; set; }
    public float IdentificationConfidence { get; set; }
    public bool IsKnownSpeaker { get; set; }
    public string Source { get; set; } = string.Empty;
    public Gender Gender { get; set; }
}
