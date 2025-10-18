using A3ITranslator.Application.Services;
using A3ITranslator.Application.Common;
using A3ITranslator.Infrastructure.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;

namespace A3ITranslator.Infrastructure.Services.OpenAI;

/// <summary>
/// OpenAI Whisper Speech-to-Text service implementation
/// Implements exact language dictionary from IMPLEMENTATION.md
/// </summary>
public class OpenAISTTService : ISTTService
{
    private readonly ServiceOptions _options;
    private readonly ILogger<OpenAISTTService> _logger;

    public OpenAISTTService(IOptions<ServiceOptions> options, ILogger<OpenAISTTService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>
    /// Get supported languages - exact dictionary from IMPLEMENTATION.md
    /// </summary>
    public Dictionary<string, string> GetSupportedLanguages()
    {
        return OpenAIWhisperLanguages;
    }

    /// <summary>
    /// Get service name for identification
    /// </summary>
    public string GetServiceName()
    {
        return "OpenAI Whisper";
    }

    /// <summary>
    /// Convert speech to text using Whisper - placeholder for Phase 2
    /// </summary>
    public async Task<Result<string>> ConvertSpeechToTextAsync(byte[] audioData, string languageCode, string sessionId)
    {
        // Phase 1: Language Foundation - placeholder implementation
        await Task.Delay(100); // Simulate processing
        return Result<string>.Success($"[Phase 1] OpenAI Whisper placeholder for language {languageCode}");
    }

    /// <summary>
    /// Check service health
    /// </summary>
    public async Task<bool> CheckHealthAsync()
    {
        try
        {
            await Task.Delay(10);
            var hasConfig = !string.IsNullOrEmpty(_options.OpenAI?.ApiKey);
            _logger.LogDebug("OpenAI Whisper health check: {Status}", hasConfig ? "Healthy" : "Unhealthy");
            return hasConfig;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OpenAI Whisper health check failed");
            return false;
        }
    }

    /// <summary>
    /// OpenAI Whisper Languages - EXACT dictionary from IMPLEMENTATION.md
    /// 99 languages supported by Whisper model
    /// </summary>
    public static readonly Dictionary<string, string> OpenAIWhisperLanguages = new()
    {
        // Tier 1 - Primary supported languages
        {"en", "English"},
        {"ur", "Urdu"},
        
        // Arabic and variants
        {"ar", "Arabic"},
        
        // Major world languages - Whisper's multilingual strength
        {"zh", "Chinese"},
        {"hi", "Hindi"},
        {"es", "Spanish"},
        {"fr", "French"},
        {"de", "German"},
        {"it", "Italian"},
        {"ja", "Japanese"},
        {"ko", "Korean"},
        {"pt", "Portuguese"},
        {"ru", "Russian"},
        
        // European languages
        {"nl", "Dutch"},
        {"sv", "Swedish"},
        {"da", "Danish"},
        {"no", "Norwegian"},
        {"fi", "Finnish"},
        {"pl", "Polish"},
        {"cs", "Czech"},
        {"sk", "Slovak"},
        {"hu", "Hungarian"},
        {"ro", "Romanian"},
        {"bg", "Bulgarian"},
        {"hr", "Croatian"},
        {"sr", "Serbian"},
        {"sl", "Slovenian"},
        {"et", "Estonian"},
        {"lv", "Latvian"},
        {"lt", "Lithuanian"},
        {"el", "Greek"},
        {"tr", "Turkish"},
        
        // Asian languages
        {"th", "Thai"},
        {"vi", "Vietnamese"},
        {"id", "Indonesian"},
        {"ms", "Malay"},
        {"tl", "Filipino"},
        {"ta", "Tamil"},
        {"te", "Telugu"},
        {"kn", "Kannada"},
        {"ml", "Malayalam"},
        {"gu", "Gujarati"},
        {"mr", "Marathi"},
        {"bn", "Bengali"},
        {"pa", "Punjabi"},
        {"ne", "Nepali"},
        {"si", "Sinhala"},
        {"my", "Myanmar"},
        {"km", "Khmer"},
        {"lo", "Lao"},
        
        // Middle Eastern and Central Asian languages
        {"he", "Hebrew"},
        {"fa", "Persian"},
        {"ku", "Kurdish"},
        {"az", "Azerbaijani"},
        {"kk", "Kazakh"},
        {"ky", "Kyrgyz"},
        {"uz", "Uzbek"},
        {"tg", "Tajik"},
        {"mn", "Mongolian"},
        
        // Caucasian languages
        {"ka", "Georgian"},
        {"hy", "Armenian"},
        
        // African languages
        {"af", "Afrikaans"},
        {"am", "Amharic"},
        {"sw", "Swahili"},
        {"zu", "Zulu"},
        {"yo", "Yoruba"},
        {"ha", "Hausa"},
        {"ig", "Igbo"},
        {"xh", "Xhosa"},
        {"sn", "Shona"},
        {"rw", "Kinyarwanda"},
        {"mg", "Malagasy"},
        {"so", "Somali"},
        
        // Celtic and Nordic languages
        {"is", "Icelandic"},
        {"mt", "Maltese"},
        {"cy", "Welsh"},
        {"ga", "Irish"},
        {"gd", "Scottish Gaelic"},
        {"br", "Breton"},
        
        // Regional languages
        {"eu", "Basque"},
        {"ca", "Catalan"},
        {"gl", "Galician"},
        {"oc", "Occitan"},
        {"lb", "Luxembourgish"},
        
        // Eastern European
        {"uk", "Ukrainian"},
        {"be", "Belarusian"},
        {"mk", "Macedonian"},
        {"sq", "Albanian"},
        {"bs", "Bosnian"},
        
        // South American indigenous
        {"qu", "Quechua"},
        {"gn", "Guarani"},
        
        // Pacific languages
        {"mi", "Maori"},
        {"sm", "Samoan"},
        {"to", "Tongan"},
        {"fj", "Fijian"},
        
        // Additional Asian languages
        {"jv", "Javanese"},
        {"su", "Sundanese"},
        {"mad", "Madurese"},
        {"bug", "Buginese"},
        {"bew", "Betawi"},
        {"ban", "Balinese"},
        {"nij", "Ngaju"},
        {"min", "Minangkabau"},
        {"bjn", "Banjarese"}
    };
}
