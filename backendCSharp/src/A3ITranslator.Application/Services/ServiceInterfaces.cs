using A3ITranslator.Application.Common;
using A3ITranslator.Application.DTOs;
using A3ITranslator.Domain.Enums;
using A3ITranslator.Domain.ValueObjects;

namespace A3ITranslator.Application.Services;

/// <summary>
/// Speech-to-Text service interface
/// </summary>
public interface ISTTService
{
    STTProvider ProviderType { get; }
    Task<Result<STTResponseDto>> TranscribeAsync(STTRequestDto request);
    Task<bool> IsHealthyAsync();
}

/// <summary>
/// STT request DTO
/// </summary>
public class STTRequestDto
{
    public byte[] AudioData { get; set; } = Array.Empty<byte>();
    public string SessionId { get; set; } = string.Empty;
    public string ContentType { get; set; } = "audio/ogg";
    public string ExpectedLanguage { get; set; } = string.Empty;
}

/// <summary>
/// STT response DTO
/// </summary>
public class STTResponseDto
{
    public string Transcription { get; set; } = string.Empty;
    public string DetectedLanguage { get; set; } = string.Empty;
    public float Confidence { get; set; }
    public SpeakerDto? Speaker { get; set; }
    public string Provider { get; set; } = string.Empty;
    public TimeSpan ProcessingTime { get; set; }
}

/// <summary>
/// Translation service interface
/// </summary>
public interface ITranslationService
{
    AIProvider ProviderType { get; }
    Task<Result<TranslationResponseDto>> TranslateAsync(TranslationRequestDto request);
    Task<bool> IsHealthyAsync();
}

/// <summary>
/// Translation request DTO
/// </summary>
public class TranslationRequestDto
{
    public string Text { get; set; } = string.Empty;
    public string SourceLanguage { get; set; } = string.Empty;
    public string TargetLanguage { get; set; } = string.Empty;
    public string SessionId { get; set; } = string.Empty;
    public SpeakerDto? Speaker { get; set; }
    public UserTier UserTier { get; set; }
}

/// <summary>
/// Translation response DTO
/// </summary>
public class TranslationResponseDto
{
    public string Translation { get; set; } = string.Empty;
    public string Tone { get; set; } = string.Empty;
    public string TranslationWithGestures { get; set; } = string.Empty;
    public bool AIAssistanceConfirmed { get; set; }
    public AIResponseDto? AIResponse { get; set; }
    public string? AIResponseTranslated { get; set; }
    public string? AIResponseWithGestures { get; set; }
    public float AIConfidence { get; set; }
    public string? AIExpertiseArea { get; set; }
    public string Provider { get; set; } = string.Empty;
    public TimeSpan ProcessingTime { get; set; }
}

/// <summary>
/// Text-to-Speech service interface
/// </summary>
public interface ITTSService
{
    TTSProvider ProviderType { get; }
    Task<Result<TTSResponseDto>> GenerateSpeechAsync(TTSRequestDto request);
    Task<bool> IsHealthyAsync();
}

/// <summary>
/// TTS request DTO
/// </summary>
public class TTSRequestDto
{
    public string Text { get; set; } = string.Empty;
    public string TargetLanguage { get; set; } = string.Empty;
    public SpeakerDto? Speaker { get; set; }
    public UserTier UserTier { get; set; }
    public string SessionId { get; set; } = string.Empty;
    public ContentType ContentType { get; set; } = ContentType.Translation;
}

/// <summary>
/// TTS response DTO
/// </summary>
public class TTSResponseDto
{
    public byte[] AudioData { get; set; } = Array.Empty<byte>();
    public string MimeType { get; set; } = "audio/mpeg";
    public string Provider { get; set; } = string.Empty;
    public string? VoiceUsed { get; set; }
    public VoiceQuality Quality { get; set; }
    public TimeSpan ProcessingTime { get; set; }
    public bool WasCached { get; set; }

    public string ToBase64() => Convert.ToBase64String(AudioData);
}
