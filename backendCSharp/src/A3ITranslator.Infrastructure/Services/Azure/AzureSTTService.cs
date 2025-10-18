using A3ITranslator.Application.Services;
using A3ITranslator.Application.Common;
using A3ITranslator.Infrastructure.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;

namespace A3ITranslator.Infrastructure.Services.Azure;

/// <summary>
/// Azure Speech-to-Text service implementation
/// Implements exact language dictionary from IMPLEMENTATION.md
/// </summary>
public class AzureSTTService : ISTTService
{
    private readonly ServiceOptions _options;
    private readonly ILogger<AzureSTTService> _logger;

    public AzureSTTService(IOptions<ServiceOptions> options, ILogger<AzureSTTService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>
    /// Get supported languages - exact dictionary from IMPLEMENTATION.md
    /// </summary>
    public Dictionary<string, string> GetSupportedLanguages()
    {
        return AzureSTTLanguages;
    }

    /// <summary>
    /// Get service name for identification
    /// </summary>
    public string GetServiceName()
    {
        return "Azure Speech-to-Text";
    }

    /// <summary>
    /// Convert speech to text - placeholder implementation
    /// </summary>
    public async Task<Result<string>> ConvertSpeechToTextAsync(byte[] audioData, string languageCode, string sessionId)
    {
        // Language Foundation - placeholder implementation
        await Task.Delay(100); // Simulate processing
        return Result<string>.Success($"Azure STT placeholder for language {languageCode}");
    }

    /// <summary>
    /// Check service health
    /// </summary>
    public async Task<bool> CheckHealthAsync()
    {
        try
        {
            await Task.Delay(10);
            var hasConfig = !string.IsNullOrEmpty(_options.Azure?.SpeechKey);
            _logger.LogDebug("Azure STT health check: {Status}", hasConfig ? "Healthy" : "Unhealthy");
            return hasConfig;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Azure STT health check failed");
            return false;
        }
    }

    /// <summary>
    /// Azure STT Languages - EXACT dictionary from IMPLEMENTATION.md
    /// Tier 1 - Primary supported languages
    /// </summary>
    public static readonly Dictionary<string, string> AzureSTTLanguages = new()
    {
        // Tier 1 - Primary supported languages
        {"en-US", "English (United States)"},
        {"en-GB", "English (United Kingdom)"},
        {"en-AU", "English (Australia)"},
        {"en-CA", "English (Canada)"},
        {"en-IN", "English (India)"},
        
        // Urdu - Azure's strength
        {"ur-IN", "Urdu (India)"},
        {"ur-PK", "Urdu (Pakistan)"},
        
        // Arabic variants - Azure extensive support
        {"ar-SA", "Arabic (Saudi Arabia)"},
        {"ar-EG", "Arabic (Egypt)"},
        {"ar-AE", "Arabic (United Arab Emirates)"},
        {"ar-QA", "Arabic (Qatar)"},
        {"ar-KW", "Arabic (Kuwait)"},
        {"ar-BH", "Arabic (Bahrain)"},
        {"ar-OM", "Arabic (Oman)"},
        {"ar-JO", "Arabic (Jordan)"},
        {"ar-LB", "Arabic (Lebanon)"},
        {"ar-SY", "Arabic (Syria)"},
        {"ar-IQ", "Arabic (Iraq)"},
        {"ar-YE", "Arabic (Yemen)"},
        {"ar-LY", "Arabic (Libya)"},
        {"ar-TN", "Arabic (Tunisia)"},
        {"ar-DZ", "Arabic (Algeria)"},
        {"ar-MA", "Arabic (Morocco)"},
        
        // Major world languages
        {"zh-CN", "Chinese (Mandarin, Simplified)"},
        {"zh-TW", "Chinese (Taiwanese Mandarin, Traditional)"},
        {"zh-HK", "Chinese (Cantonese, Traditional)"},
        {"hi-IN", "Hindi (India)"},
        {"es-ES", "Spanish (Spain)"},
        {"es-MX", "Spanish (Mexico)"},
        {"es-US", "Spanish (United States)"},
        {"fr-FR", "French (France)"},
        {"fr-CA", "French (Canada)"},
        {"de-DE", "German (Germany)"},
        {"it-IT", "Italian (Italy)"},
        {"ja-JP", "Japanese (Japan)"},
        {"ko-KR", "Korean (Korea)"},
        {"pt-BR", "Portuguese (Brazil)"},
        {"pt-PT", "Portuguese (Portugal)"},
        {"ru-RU", "Russian (Russia)"},
        
        // Additional Azure supported languages
        {"nl-NL", "Dutch (Netherlands)"},
        {"sv-SE", "Swedish (Sweden)"},
        {"da-DK", "Danish (Denmark)"},
        {"nb-NO", "Norwegian (Norway)"},
        {"fi-FI", "Finnish (Finland)"},
        {"pl-PL", "Polish (Poland)"},
        {"cs-CZ", "Czech (Czech Republic)"},
        {"hu-HU", "Hungarian (Hungary)"},
        {"tr-TR", "Turkish (Turkey)"},
        {"th-TH", "Thai (Thailand)"},
        {"vi-VN", "Vietnamese (Vietnam)"},
        {"id-ID", "Indonesian (Indonesia)"},
        {"ms-MY", "Malay (Malaysia)"},
        {"ta-IN", "Tamil (India)"},
        {"te-IN", "Telugu (India)"},
        {"kn-IN", "Kannada (India)"},
        {"ml-IN", "Malayalam (India)"},
        {"gu-IN", "Gujarati (India)"},
        {"mr-IN", "Marathi (India)"},
        {"bn-IN", "Bengali (India)"},
        {"pa-IN", "Punjabi (India)"}
    };
}
