using A3ITranslator.Application.DTOs.Speaker;

namespace A3ITranslator.Application.DTOs.Translation;

/// <summary>
/// Response from enhanced translation service
/// </summary>
public class TranslationResponse
{
    public bool Success { get; set; } = true;
    public string Translation { get; set; } = string.Empty;
    public string TranslationWithGestures { get; set; } = string.Empty;
    public bool AIAssistanceConfirmed { get; set; }
    public string? AIResponse { get; set; }
    public string? AIResponseTranslated { get; set; }
    public float Confidence { get; set; }
    public string ProviderUsed { get; set; } = string.Empty;
    public string? Reasoning { get; set; }
    public string? SpeakerAcknowledged { get; set; }
    public SpeakerInfo? SpeakerInfo { get; set; }
    public double ProcessingTimeMs { get; set; }
    public List<string> BackgroundTasks { get; set; } = new();
    public string Intent { get; set; } = "SIMPLE_TRANSLATION"; // SIMPLE_TRANSLATION or AI_ASSISTANCE
    public string? ErrorMessage { get; set; }
    public TranslationErrorType? ErrorType { get; set; }
}

/// <summary>
/// Translation error types for better error handling
/// </summary>
public enum TranslationErrorType
{
    NetworkError,
    AuthenticationError,
    RateLimitExceeded,
    UnsupportedLanguage,
    InvalidRequest,
    AllModelsUnavailable,
    AllProvidersUnavailable,
    TokenLimitExceeded,
    ServiceUnavailable
}
