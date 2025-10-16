using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Domain.ValueObjects;

/// <summary>
/// Speaker information value object containing identification details
/// </summary>
public class SpeakerInfo : IEquatable<SpeakerInfo>
{
    public string SpeakerId { get; }
    public string? SpeakerName { get; }
    public string DisplayName { get; }
    public int SpeakerNumber { get; }
    public float IdentificationConfidence { get; }
    public bool IsKnownSpeaker { get; }
    public string Source { get; }
    public Gender Gender { get; }

    public SpeakerInfo(
        string speakerId,
        string? speakerName,
        string displayName,
        int speakerNumber,
        float identificationConfidence,
        bool isKnownSpeaker,
        string source,
        Gender gender = Gender.Unknown)
    {
        if (string.IsNullOrWhiteSpace(speakerId))
            throw new ArgumentException("Speaker ID cannot be null or empty", nameof(speakerId));
        
        if (string.IsNullOrWhiteSpace(displayName))
            throw new ArgumentException("Display name cannot be null or empty", nameof(displayName));
        
        if (identificationConfidence < 0 || identificationConfidence > 1)
            throw new ArgumentException("Identification confidence must be between 0 and 1", nameof(identificationConfidence));
        
        if (speakerNumber < 1)
            throw new ArgumentException("Speaker number must be greater than 0", nameof(speakerNumber));

        SpeakerId = speakerId;
        SpeakerName = speakerName;
        DisplayName = displayName;
        SpeakerNumber = speakerNumber;
        IdentificationConfidence = identificationConfidence;
        IsKnownSpeaker = isKnownSpeaker;
        Source = source ?? throw new ArgumentNullException(nameof(source));
        Gender = gender;
    }

    public bool Equals(SpeakerInfo? other)
    {
        if (other is null) return false;
        if (ReferenceEquals(this, other)) return true;
        return SpeakerId == other.SpeakerId;
    }

    public override bool Equals(object? obj)
    {
        return Equals(obj as SpeakerInfo);
    }

    public override int GetHashCode()
    {
        return SpeakerId.GetHashCode();
    }

    public static bool operator ==(SpeakerInfo? left, SpeakerInfo? right)
    {
        return left?.Equals(right) ?? right is null;
    }

    public static bool operator !=(SpeakerInfo? left, SpeakerInfo? right)
    {
        return !(left == right);
    }
}
