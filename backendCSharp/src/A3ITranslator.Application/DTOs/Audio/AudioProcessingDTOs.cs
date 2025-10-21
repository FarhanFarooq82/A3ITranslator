using A3ITranslator.Application.Enums;

namespace A3ITranslator.Application.DTOs.Audio;

/// <summary>
/// STT processing result with language detection and speaker identification
/// </summary>
public class STTResult
{
    public bool Success { get; set; }
    public string Transcription { get; set; } = string.Empty;
    public string DetectedLanguage { get; set; } = string.Empty;
    public float Confidence { get; set; }
    public string Provider { get; set; } = string.Empty;
    public double ProcessingTimeMs { get; set; }
    public bool IsFallbackResult { get; set; }
    public string ErrorMessage { get; set; } = string.Empty;
    
    // Speaker identification
    public SpeakerAnalysis? SpeakerAnalysis { get; set; }
    public List<WordInfo> Words { get; set; } = new();
    
    // Legacy properties for backward compatibility
    public string Text => Transcription;
    public double LanguageConfidence => Confidence;
    public double TranscriptionConfidence => Confidence;
    public string ServiceName => Provider;
    public TimeSpan ProcessingTime => TimeSpan.FromMilliseconds(ProcessingTimeMs);
}

/// <summary>
/// Speaker analysis information from STT
/// </summary>
public class SpeakerAnalysis
{
    public string Gender { get; set; } = string.Empty; // MALE, FEMALE, NEUTRAL
    public string Language { get; set; } = string.Empty;
    public string EstimatedAgeRange { get; set; } = string.Empty; // child, teen, young_adult, adult, senior
    public bool IsKnownSpeaker { get; set; }
    public string? SpeakerIdentity { get; set; }
    public float Confidence { get; set; }
    public int SpeakerTag { get; set; }
    public string SpeakerLabel { get; set; } = string.Empty;
}

/// <summary>
/// Word-level information with speaker diarization
/// </summary>
public class WordInfo
{
    public string Word { get; set; } = string.Empty;
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
    public float Confidence { get; set; }
    public int SpeakerTag { get; set; }
    public string SpeakerLabel { get; set; } = string.Empty;
}

/// <summary>
/// Provider information for selection
/// </summary>
public class STTProviderInfo
{
    public string ProviderId { get; set; } = string.Empty;
    public int Priority { get; set; }
    public bool SupportsLanguageDetection { get; set; }
    public bool RequiresAudioConversion { get; set; }
    public Dictionary<string, string> SupportedLanguages { get; set; } = new();
    public string ReasonForSelection { get; set; } = string.Empty;
    
    // Legacy properties for backward compatibility
    public string ProviderName => ProviderId;
    public bool RequiresConversion => RequiresAudioConversion;
    public List<string> SupportedLanguagesList => SupportedLanguages.Keys.ToList();
}

/// <summary>
/// Quality thresholds for STT processing
/// </summary>
public class STTQualityThresholds
{
    public float MinimumConfidence { get; set; } = 0.6f;
    public float PreferredConfidence { get; set; } = 0.8f;
    public int MaxRetryAttempts { get; set; } = 3;
    
    // Legacy properties for backward compatibility
    public double MinimumLanguageConfidence => MinimumConfidence;
    public double MinimumTranscriptionConfidence => MinimumConfidence;
    public int MinimumTextLength { get; set; } = 3;
    public TimeSpan MaxResponseTime { get; set; } = TimeSpan.FromSeconds(30);
}

/// <summary>
/// Audio processing request
/// </summary>
public class AudioProcessRequest
{
    public string SessionId { get; set; } = string.Empty;
    public string MainLanguage { get; set; } = string.Empty;
    public string TargetLanguage { get; set; } = string.Empty;
    public string AudioFormat { get; set; } = string.Empty;
    public byte[] AudioData { get; set; } = Array.Empty<byte>();
}

/// <summary>
/// Audio processing response
/// </summary>
public class AudioProcessResponse
{
    public bool Success { get; set; }
    public string TranscribedText { get; set; } = string.Empty;
    public string DetectedLanguage { get; set; } = string.Empty;
    public double LanguageConfidence { get; set; }
    public double TranscriptionConfidence { get; set; }
    public string ServiceUsed { get; set; } = string.Empty;
    public TimeSpan ProcessingTime { get; set; }
    public bool IsFallbackResult { get; set; }
    public string Message { get; set; } = string.Empty;
}
