using A3ITranslator.Domain.Common;
using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Domain.Entities;

/// <summary>
/// Speaker profile entity for session-based speaker identification
/// </summary>
public class SpeakerProfile : BaseEntity
{
    public string SessionId { get; private set; }
    public string ExternalSpeakerId { get; private set; } // Azure Speaker Recognition ID
    public int SpeakerNumber { get; private set; }
    public Gender Gender { get; private set; }
    public string? Name { get; private set; }
    public float IdentificationConfidence { get; private set; }
    public string Source { get; private set; }
    public DateTime LastUsed { get; private set; }
    public bool IsActive { get; private set; } = true;

    // For EF Core
    protected SpeakerProfile() { }

    public SpeakerProfile(
        string sessionId,
        string externalSpeakerId,
        int speakerNumber,
        Gender gender,
        float identificationConfidence,
        string source)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            throw new ArgumentException("Session ID cannot be null or empty", nameof(sessionId));
        
        if (string.IsNullOrWhiteSpace(externalSpeakerId))
            throw new ArgumentException("External speaker ID cannot be null or empty", nameof(externalSpeakerId));
        
        if (speakerNumber < 1)
            throw new ArgumentException("Speaker number must be greater than 0", nameof(speakerNumber));
        
        if (identificationConfidence < 0 || identificationConfidence > 1)
            throw new ArgumentException("Identification confidence must be between 0 and 1", nameof(identificationConfidence));

        SessionId = sessionId;
        ExternalSpeakerId = externalSpeakerId;
        SpeakerNumber = speakerNumber;
        Gender = gender;
        IdentificationConfidence = identificationConfidence;
        Source = source ?? throw new ArgumentNullException(nameof(source));
        LastUsed = DateTime.UtcNow;
    }

    public void UpdateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Name cannot be null or empty", nameof(name));

        Name = name;
        UpdateLastUsed();
    }

    public void UpdateLastUsed()
    {
        LastUsed = DateTime.UtcNow;
        SetUpdatedAt();
    }

    public void Deactivate()
    {
        IsActive = false;
        SetUpdatedAt();
    }

    public string GetDisplayName()
    {
        return !string.IsNullOrWhiteSpace(Name) ? Name : $"Speaker {SpeakerNumber}";
    }
}
