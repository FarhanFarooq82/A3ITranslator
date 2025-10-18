using System.ComponentModel.DataAnnotations;

namespace A3ITranslator.Infrastructure.Configuration;

/// <summary>
/// Configuration options for Azure Speech Services
/// Following Azure Speech SDK documentation patterns
/// </summary>
public class AzureOptions
{
    public const string SectionName = "Azure";
    
    [Required]
    public string SpeechKey { get; set; } = string.Empty;
    
    [Required]
    public string SpeechRegion { get; set; } = string.Empty;
    
    [Required]
    public string TranslatorKey { get; set; } = string.Empty;
    
    [Required]
    public string TranslatorRegion { get; set; } = string.Empty;
    
    public string TranslatorEndpoint { get; set; } = "https://api.cognitive.microsofttranslator.com";
}

/// <summary>
/// Configuration options for OpenAI services
/// Following OpenAI .NET SDK documentation patterns
/// </summary>
public class OpenAIOptions
{
    public const string SectionName = "OpenAI";
    
    [Required]
    public string ApiKey { get; set; } = string.Empty;
    
    public string Organization { get; set; } = string.Empty;
    
    public string WhisperModel { get; set; } = "whisper-1";
    
    public string ChatModel { get; set; } = "gpt-4o-mini";
    
    public string BaseUrl { get; set; } = "https://api.openai.com/v1";
}

/// <summary>
/// Configuration options for Google Cloud services
/// Following Google Cloud SDK patterns
/// </summary>
public class GoogleOptions
{
    public const string SectionName = "Google";
    
    [Required]
    public string CredentialsPath { get; set; } = string.Empty;
    
    public string ProjectId { get; set; } = string.Empty;
    
    public string Location { get; set; } = "global";
}

/// <summary>
/// Configuration options for Gemini AI services
/// Following Google AI SDK patterns
/// </summary>
public class GeminiOptions
{
    public const string SectionName = "Gemini";
    
    [Required]
    public string ApiKey { get; set; } = string.Empty;
    
    public string Model { get; set; } = "gemini-1.5-flash";
    
    public string BaseUrl { get; set; } = "https://generativelanguage.googleapis.com/v1beta";
}

/// <summary>
/// Overall service configuration with provider priorities
/// Based on architectural requirements in documentation
/// </summary>
public class ServiceOptions
{
    public const string SectionName = "Services";
    
    public AzureOptions Azure { get; set; } = new();
    
    public GoogleOptions Google { get; set; } = new();
    
    public OpenAIOptions OpenAI { get; set; } = new();
    
    public GeminiOptions Gemini { get; set; } = new();
    
    /// <summary>
    /// Provider priority for STT services: Azure -> OpenAI -> Google
    /// Based on documented architecture decisions
    /// </summary>
    public string[] STTProviderPriority { get; set; } = { "Azure", "OpenAI" };
    
    /// <summary>
    /// Provider priority for GenAI services: OpenAI -> Gemini -> Azure
    /// Optimized for response quality and cost efficiency
    /// </summary>
    public string[] GenAIProviderPriority { get; set; } = { "OpenAI", "Gemini", "Azure" };
    
    /// <summary>
    /// Provider priority for TTS services: Azure (primary)
    /// Based on documented voice quality requirements
    /// </summary>
    public string[] TTSProviderPriority { get; set; } = { "Azure" };
}
