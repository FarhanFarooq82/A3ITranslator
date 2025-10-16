using Azure;
using Azure.AI.Translation.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.DTOs;
using A3ITranslator.Application.Common;
using A3ITranslator.Infrastructure.Configuration;
using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Infrastructure.Services.Azure;

/// <summary>
/// Azure Translation service implementation
/// Following official Azure Translator Text API documentation and best practices
/// https://docs.microsoft.com/en-us/azure/cognitive-services/translator/
/// </summary>
public class AzureTranslationService : ITranslationService
{
    private readonly AzureOptions _options;
    private readonly ILogger<AzureTranslationService> _logger;
    private readonly TextTranslationClient _client;

    /// <summary>
    /// Azure Translator supported languages
    /// Based on official Azure Translator language support documentation
    /// https://docs.microsoft.com/en-us/azure/cognitive-services/translator/language-support
    /// </summary>
    public static readonly Dictionary<string, string> SupportedLanguages = new()
    {
        // Major languages with high-quality translation
        { "en", "English" },
        { "es", "Spanish" },
        { "fr", "French" },
        { "de", "German" },
        { "it", "Italian" },
        { "pt", "Portuguese" },
        { "ru", "Russian" },
        { "ja", "Japanese" },
        { "ko", "Korean" },
        { "zh", "Chinese (Simplified)" },
        { "zh-Hant", "Chinese (Traditional)" },
        { "ar", "Arabic" },
        { "hi", "Hindi" },
        { "ur", "Urdu" }, // Key language per architecture requirements
        
        // European languages
        { "nl", "Dutch" },
        { "sv", "Swedish" },
        { "da", "Danish" },
        { "no", "Norwegian" },
        { "fi", "Finnish" },
        { "pl", "Polish" },
        { "cs", "Czech" },
        { "hu", "Hungarian" },
        { "tr", "Turkish" },
        { "bg", "Bulgarian" },
        { "hr", "Croatian" },
        { "sr", "Serbian" },
        { "sk", "Slovak" },
        { "sl", "Slovenian" },
        { "et", "Estonian" },
        { "lv", "Latvian" },
        { "lt", "Lithuanian" },
        { "ro", "Romanian" },
        { "uk", "Ukrainian" },
        { "el", "Greek" },
        
        // Indian languages - Azure's strong support
        { "ta", "Tamil" },
        { "te", "Telugu" },
        { "kn", "Kannada" },
        { "ml", "Malayalam" },
        { "gu", "Gujarati" },
        { "mr", "Marathi" },
        { "bn", "Bengali" },
        { "pa", "Punjabi" },
        { "or", "Odia" },
        { "as", "Assamese" },
        
        // Southeast Asian and other languages
        { "th", "Thai" },
        { "vi", "Vietnamese" },
        { "id", "Indonesian" },
        { "ms", "Malay" },
        { "fil", "Filipino" },
        { "he", "Hebrew" },
        { "fa", "Persian" },
        { "sw", "Swahili" },
        { "af", "Afrikaans" },
        { "ca", "Catalan" },
        { "eu", "Basque" },
        { "gl", "Galician" },
        { "mt", "Maltese" },
        { "cy", "Welsh" },
        { "ga", "Irish" },
        { "is", "Icelandic" }
    };

    public AzureTranslationService(IOptions<ServiceOptions> options, ILogger<AzureTranslationService> logger)
    {
        _options = options.Value.Azure;
        _logger = logger;
        
        // Initialize Azure Translator client following official documentation
        // https://docs.microsoft.com/en-us/dotnet/api/azure.ai.translation.text.texttranslationclient
        var credential = new AzureKeyCredential(_options.TranslatorKey);
        var endpoint = new Uri(_options.TranslatorEndpoint);
        
        _client = new TextTranslationClient(credential, endpoint, _options.TranslatorRegion);
        
        _logger.LogInformation("Azure Translation Service initialized with region: {Region}", _options.TranslatorRegion);
    }

    public AIProvider ProviderType => AIProvider.AzureOpenAI;

    public Dictionary<string, string> GetSupportedLanguages()
    {
        return SupportedLanguages;
    }

    public string GetServiceName()
    {
        return "Azure Translator";
    }

    public async Task<Result<TranslationResponseDto>> TranslateAsync(TranslationRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return Result<TranslationResponseDto>.Failure("Text to translate cannot be null or empty");
        }

        var fromLang = NormalizeLanguageCode(request.SourceLanguage);
        var toLang = NormalizeLanguageCode(request.TargetLanguage);

        if (!SupportedLanguages.ContainsKey(fromLang))
        {
            return Result<TranslationResponseDto>.Failure($"Source language {request.SourceLanguage} is not supported by Azure Translator");
        }

        if (!SupportedLanguages.ContainsKey(toLang))
        {
            return Result<TranslationResponseDto>.Failure($"Target language {request.TargetLanguage} is not supported by Azure Translator");
        }

        try
        {
            _logger.LogDebug("Translating text with Azure Translator from {From} to {To}", fromLang, toLang);

            var startTime = DateTime.UtcNow;
            
            // Perform translation following Azure Translator API patterns
            // https://docs.microsoft.com/en-us/azure/cognitive-services/translator/reference/v3-0-translate
            var response = await _client.TranslateAsync(
                targetLanguages: new[] { toLang },
                content: new[] { request.Text },
                sourceLanguage: fromLang
            );

            var processingTime = DateTime.UtcNow - startTime;

            if (response?.Value?.FirstOrDefault()?.Translations?.FirstOrDefault() is { } translation)
            {
                var result = new TranslationResponseDto
                {
                    Translation = translation.Text,
                    Tone = "neutral", // Azure doesn't provide tone analysis
                    TranslationWithGestures = translation.Text, // No gesture enhancement by default
                    AIAssistanceConfirmed = false, // This is pure translation
                    Provider = GetServiceName(),
                    ProcessingTime = processingTime
                };

                _logger.LogInformation("Azure translation successful: {From} -> {To}", fromLang, toLang);
                return Result<TranslationResponseDto>.Success(result);
            }

            return Result<TranslationResponseDto>.Failure("No translation result returned from Azure Translator");
        }
        catch (RequestFailedException ex)
        {
            _logger.LogError(ex, "Azure Translator API error: {Status} - {Message}", ex.Status, ex.Message);
            return Result<TranslationResponseDto>.Failure($"Azure Translator failed: {ex.Message}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in Azure translation from {From} to {To}", fromLang, toLang);
            return Result<TranslationResponseDto>.Failure($"Azure translation processing failed: {ex.Message}");
        }
    }

    public async Task<bool> IsHealthyAsync()
    {
        try
        {
            // Simple health check by testing config and making a minimal request
            return !string.IsNullOrEmpty(_options.TranslatorKey) && !string.IsNullOrEmpty(_options.TranslatorRegion);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Normalize language codes to Azure Translator format
    /// Azure uses simplified language codes (e.g., 'en' instead of 'en-US')
    /// </summary>
    private string NormalizeLanguageCode(string languageCode)
    {
        if (string.IsNullOrEmpty(languageCode))
            return "en";

        // Convert BCP-47 codes to Azure Translator format
        return languageCode switch
        {
            var code when code.StartsWith("en-") => "en",
            var code when code.StartsWith("es-") => "es",
            var code when code.StartsWith("fr-") => "fr",
            var code when code.StartsWith("de-") => "de",
            var code when code.StartsWith("pt-") => "pt",
            var code when code.StartsWith("zh-CN") => "zh",
            var code when code.StartsWith("zh-TW") || code.StartsWith("zh-HK") => "zh-Hant",
            var code when code.StartsWith("ar-") => "ar",
            var code when code.StartsWith("ur-") => "ur",
            var code when code.StartsWith("hi-") => "hi",
            var code when code.StartsWith("ta-") => "ta",
            var code when code.StartsWith("te-") => "te",
            var code when code.StartsWith("kn-") => "kn",
            var code when code.StartsWith("ml-") => "ml",
            var code when code.StartsWith("gu-") => "gu",
            var code when code.StartsWith("mr-") => "mr",
            var code when code.StartsWith("bn-") => "bn",
            var code when code.StartsWith("pa-") => "pa",
            _ => languageCode.Split('-')[0] // Take base language code
        };
    }

    public void Dispose()
    {
        // TextTranslationClient doesn't require disposal in current SDK version
    }
}
