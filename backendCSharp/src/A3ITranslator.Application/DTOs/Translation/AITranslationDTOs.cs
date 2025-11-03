using A3ITranslator.Application.DTOs.Speaker;

namespace A3ITranslator.Application.DTOs.Translation;

/// <summary>
/// Basic translation request
/// </summary>
public class TranslationRequest
{
    public string Text { get; set; } = string.Empty;
    public string SourceLanguage { get; set; } = string.Empty;
    public string TargetLanguage { get; set; } = string.Empty;
    public bool IsPremium { get; set; }
    public string SessionId { get; set; } = string.Empty;
}

/// <summary>
/// Session context for maintaining conversation state
/// </summary>
public class SessionContext
{
    public List<ExtractedFact> Facts { get; set; } = new();
    public Dictionary<string, object> AdditionalContext { get; set; } = new();
}

/// <summary>
/// Extracted fact for knowledge base
/// </summary>
public class ExtractedFact
{
    public string FactId { get; set; } = string.Empty;
    public string Person { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string FactText { get; set; } = string.Empty;
    public float Confidence { get; set; }
    public string Source { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}

/// <summary>
/// Translation capabilities for each provider
/// </summary>
public class TranslationCapabilities
{
    public List<string> SupportedLanguages { get; set; } = new();
    public bool SupportsContextIntegration { get; set; }
    public bool SupportsAIAssistance { get; set; }
    public bool SupportsSSMLEnhancement { get; set; }
    public int MaxTokenLimit { get; set; }
    public float CostPerToken { get; set; }
}
