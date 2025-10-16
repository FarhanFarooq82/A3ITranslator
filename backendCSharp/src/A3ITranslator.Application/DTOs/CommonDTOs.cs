using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Application.DTOs;

/// <summary>
/// Audio processing request DTO
/// </summary>
public class AudioRequestDto
{
    public byte[] AudioData { get; set; } = Array.Empty<byte>();
    public string SessionId { get; set; } = string.Empty;
    public string MainLanguage { get; set; } = string.Empty;
    public string OtherLanguage { get; set; } = string.Empty;
    public UserTier UserTier { get; set; } = UserTier.Standard;
    public string ContentType { get; set; } = "audio/ogg";
}

/// <summary>
/// Audio processing response DTO
/// </summary>
public class AudioResponseDto
{
    public string Transcription { get; set; } = string.Empty;
    public string Translation { get; set; } = string.Empty;
    public string TranslationLanguage { get; set; } = string.Empty;
    public string Tone { get; set; } = string.Empty;
    public string TranslationWithGestures { get; set; } = string.Empty;
    public string SpeakerName { get; set; } = string.Empty;
    public bool IsDirectQuery { get; set; }
    public string SessionId { get; set; } = string.Empty;
    public string? TranslationAudio { get; set; }
    public string? TranslationAudioMimeType { get; set; }
    public string? AudioType { get; set; }
    public AIResponseDto? AIResponse { get; set; }
    public string? AITranslationAudio { get; set; }
    public string? AITranslationAudioMimeType { get; set; }
}

/// <summary>
/// AI response DTO
/// </summary>
public class AIResponseDto
{
    public string AnswerInAudioLanguage { get; set; } = string.Empty;
    public string AnswerTranslated { get; set; } = string.Empty;
    public string AnswerWithGestures { get; set; } = string.Empty;
    public float Confidence { get; set; }
    public string ExpertiseArea { get; set; } = "general";
}

/// <summary>
/// Speaker information DTO
/// </summary>
public class SpeakerInfo
{
    public string SpeakerId { get; set; } = string.Empty;
    public string? Name { get; set; }
    public double Confidence { get; set; }
}

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

/// <summary>
/// Language detection result DTO
/// </summary>
public class LanguageDetectionResult
{
    public string Text { get; set; } = string.Empty;
    public string DetectedLanguage { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public string Provider { get; set; } = string.Empty;
}

/// <summary>
/// Session information DTO
/// </summary>
public class SessionDto
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string MainLanguage { get; set; } = string.Empty;
    public string OtherLanguage { get; set; } = string.Empty;
    public UserTier UserTier { get; set; }
    public SessionState State { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastActivity { get; set; }
    public int MessageCount { get; set; }
    public int FactsCount { get; set; }
}

/// <summary>
/// Speaker information DTO
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
