using A3ITranslator.Application.DTOs.Audio;
using A3ITranslator.Application.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace A3ITranslator.Infrastructure.Services.Audio;

/// <summary>
/// Selects the best STT provider based on language pair support and fallback chains
/// </summary>
public class STTProviderSelector : ISTTProviderSelector
{
    private readonly ILogger<STTProviderSelector> _logger;
    private readonly IEnumerable<ISTTService> _sttServices;
    private readonly IEnumerable<ITTSService> _ttsServices;
    private readonly Dictionary<string, int> _sttProviderPriority;
    private readonly Dictionary<string, int> _ttsProviderPriority;

    public STTProviderSelector(
        ILogger<STTProviderSelector> logger,
        IEnumerable<ISTTService> sttServices,
        IEnumerable<ITTSService> ttsServices,
        IConfiguration configuration)
    {
        _logger = logger;
        _sttServices = sttServices;
        _ttsServices = ttsServices;
        _sttProviderPriority = InitializeSTTProviderPriority();
        _ttsProviderPriority = InitializeTTSProviderPriority();
    }

    // public STTProviderInfo SelectBestProvider(string mainLanguage, string targetLanguage)
    // {
    //     _logger.LogDebug("Selecting best STT provider for {MainLanguage} -> {TargetLanguage}", mainLanguage, targetLanguage);

    //     var orderedProviders = GetOrderedProviders(mainLanguage, targetLanguage);
        
    //     if (!orderedProviders.Any())
    //     {
    //         _logger.LogWarning("No STT providers support language pair {MainLanguage} -> {TargetLanguage}", mainLanguage, targetLanguage);
    //         return new STTProviderInfo
    //         {
    //             ProviderId = "none",
    //             Priority = 0,
    //             SupportsLanguageDetection = false,
    //             RequiresAudioConversion = false,
    //             SupportedLanguages = new Dictionary<string, string>(),
    //             ReasonForSelection = "No providers support this language pair"
    //         };
    //     }

    //     var bestProvider = orderedProviders.First();
    //     var supportedLanguages = bestProvider.GetSupportedLanguages();

    //     return new STTProviderInfo
    //     {
    //         ProviderId = bestProvider.GetServiceName(),
    //         Priority = _sttProviderPriority.GetValueOrDefault(bestProvider.GetServiceName(), 999),
    //         SupportsLanguageDetection = bestProvider.SupportsLanguageDetection,
    //         RequiresAudioConversion = bestProvider.RequiresAudioConversion,
    //         SupportedLanguages = supportedLanguages,
    //         ReasonForSelection = $"Best provider for {mainLanguage}->{targetLanguage} based on priority and language support"
    //     };
    // }

    public List<ISTTService> GetOrderedProviders(string mainLanguage, string targetLanguage)
    {
        var supportingProviders = new List<(ISTTService service, int priority)>();

        foreach (var service in _sttServices)
        {
            if (SupportsLanguagePair(service.GetServiceName(), mainLanguage, targetLanguage))
            {
                var priority = _sttProviderPriority.GetValueOrDefault(service.GetServiceName(), 999);
                supportingProviders.Add((service, priority));
            }
        }

        return supportingProviders
            .OrderBy(p => p.priority)
            .Select(p => p.service)
            .ToList();
    }

    public bool SupportsLanguagePair(string providerName, string mainLanguage, string targetLanguage)
    {
        var service = _sttServices.FirstOrDefault(s => s.GetServiceName() == providerName);
        if (service == null) 
        {
            _logger.LogWarning("STT service '{ProviderName}' not found", providerName);
            return false;
        }

        var supportedLanguages = service.GetSupportedLanguages();
        
        // Check if BOTH main language AND target language are supported for STT
        // Handle different language code formats (BCP-47 vs ISO 639-1)
        var supportsMainLanguage = IsLanguageSupported(mainLanguage, supportedLanguages);
        var supportsTargetLanguage = IsLanguageSupported(targetLanguage, supportedLanguages);
        
        var result = supportsMainLanguage && supportsTargetLanguage;
        
        _logger.LogDebug("Provider '{ProviderName}' language pair check: {MainLanguage}={SupportsMain}, {TargetLanguage}={SupportsTarget} -> {Result}",
            providerName, mainLanguage, supportsMainLanguage, targetLanguage, supportsTargetLanguage, result);
        
        return result;
    }

    /// <summary>
    /// Check if a language is supported, handling different language code formats
    /// Supports both BCP-47 (e.g., "en-US", "ur-PK") and ISO 639-1 (e.g., "en", "ur") formats
    /// </summary>
    private bool IsLanguageSupported(string language, Dictionary<string, string> supportedLanguages)
    {
        if (string.IsNullOrEmpty(language)) return false;

        // Direct match (exact code match)
        if (supportedLanguages.ContainsKey(language) || supportedLanguages.ContainsValue(language))
        {
            _logger.LogDebug("Direct language match found for '{Language}'", language);
            return true;
        }

        // Extract base language code (e.g., "en" from "en-US")
        var baseLanguageCode = language.Contains('-') ? language.Split('-')[0] : language;

        // Check if base language code matches any supported language keys
        foreach (var supportedLang in supportedLanguages.Keys)
        {
            var supportedBaseCode = supportedLang.Contains('-') ? supportedLang.Split('-')[0] : supportedLang;
            if (string.Equals(baseLanguageCode, supportedBaseCode, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogDebug("Base language match found: '{Language}' -> '{SupportedLang}' (base: {BaseCode})", 
                    language, supportedLang, baseLanguageCode);
                return true;
            }
        }

        // Also check language names/values with base code matching
        foreach (var supportedLang in supportedLanguages.Values)
        {
            var supportedBaseCode = supportedLang.Contains('-') ? supportedLang.Split('-')[0] : supportedLang;
            if (string.Equals(baseLanguageCode, supportedBaseCode, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogDebug("Base language match found in values: '{Language}' -> '{SupportedLang}' (base: {BaseCode})", 
                    language, supportedLang, baseLanguageCode);
                return true;
            }
        }

        _logger.LogDebug("No language match found for '{Language}' (base: {BaseCode})", language, baseLanguageCode);
        return false;
    }

    /// <summary>
    /// Get assigned STT providers for a session based on language pair
    /// Returns providers ordered by priority that support both languages
    /// </summary>
    public List<string> GetAssignedSTTProvidersForSession(string mainLanguage, string targetLanguage)
    {
        _logger.LogDebug("Getting assigned STT providers for session: {MainLanguage} -> {TargetLanguage}", mainLanguage, targetLanguage);

        var orderedProviders = GetOrderedProviders(mainLanguage, targetLanguage);
        var assignedProviders = orderedProviders.Select(p => p.GetServiceName()).ToList();

        _logger.LogInformation("Assigned STT providers for session: [{Providers}]", string.Join(", ", assignedProviders));
        
        return assignedProviders;
    }

    /// <summary>
    /// Get the preferred (highest priority) STT provider for a session
    /// </summary>
    public string GetPreferredSTTProviderForSession(string mainLanguage, string targetLanguage)
    {
        var assignedProviders = GetAssignedSTTProvidersForSession(mainLanguage, targetLanguage);
        var preferredProvider = assignedProviders.FirstOrDefault() ?? "none";
        
        _logger.LogInformation("Preferred STT provider for session: {Provider}", preferredProvider);
        
        return preferredProvider;
    }

    /// <summary>
    /// Get assigned TTS providers for a session based on language pair
    /// Returns providers ordered by priority that support both languages
    /// </summary>
    public List<string> GetAssignedTTSProvidersForSession(string mainLanguage, string targetLanguage)
    {
        _logger.LogDebug("Getting assigned TTS providers for session: {MainLanguage} -> {TargetLanguage}", mainLanguage, targetLanguage);

        var supportingProviders = new List<(ITTSService service, int priority)>();

        foreach (var service in _ttsServices)
        {
            if (TTSSupportsLanguagePair(service.GetServiceName(), mainLanguage, targetLanguage))
            {
                var priority = _ttsProviderPriority.GetValueOrDefault(service.GetServiceName(), 999);
                supportingProviders.Add((service, priority));
            }
        }

        var assignedProviders = supportingProviders
            .OrderBy(p => p.priority)
            .Select(p => p.service.GetServiceName())
            .ToList();

        _logger.LogInformation("Assigned TTS providers for session: [{Providers}]", string.Join(", ", assignedProviders));
        
        return assignedProviders;
    }

    /// <summary>
    /// Get the preferred (highest priority) TTS provider for a session
    /// </summary>
    public string GetPreferredTTSProviderForSession(string mainLanguage, string targetLanguage)
    {
        var assignedProviders = GetAssignedTTSProvidersForSession(mainLanguage, targetLanguage);
        var preferredProvider = assignedProviders.FirstOrDefault() ?? "none";
        
        _logger.LogInformation("Preferred TTS provider for session: {Provider}", preferredProvider);
        
        return preferredProvider;
    }

    /// <summary>
    /// Check if TTS provider supports the language pair
    /// </summary>
    private bool TTSSupportsLanguagePair(string providerName, string mainLanguage, string targetLanguage)
    {
        var service = _ttsServices.FirstOrDefault(s => s.GetServiceName() == providerName);
        if (service == null) 
        {
            _logger.LogWarning("TTS service '{ProviderName}' not found", providerName);
            return false;
        }

        var supportedLanguages = service.GetSupportedLanguages();
        
        // Check if BOTH main language AND target language are supported for TTS
        // Handle different language code formats (BCP-47 vs ISO 639-1)
        var supportsMainLanguage = IsLanguageSupported(mainLanguage, supportedLanguages);
        var supportsTargetLanguage = IsLanguageSupported(targetLanguage, supportedLanguages);
        
        var result = supportsMainLanguage && supportsTargetLanguage;
        
        _logger.LogDebug("TTS Provider '{ProviderName}' language pair check: {MainLanguage}={SupportsMain}, {TargetLanguage}={SupportsTarget} -> {Result}",
            providerName, mainLanguage, supportsMainLanguage, targetLanguage, supportsTargetLanguage, result);
        
        return result;
    }

    private Dictionary<string, int> InitializeSTTProviderPriority()
    {
        return new Dictionary<string, int>
        {
            // Priority based on AUDIO_PROCESSING_ARCHITECTURE.md specifications
            ["Azure STT"] = 1,      // Best for most languages, reliable
            ["Google STT"] = 2,     // Good alternative with broad language support
            ["OpenAI Whisper"] = 3  // Fallback, works offline but slower
        };
    }

    private Dictionary<string, int> InitializeTTSProviderPriority()
    {
        return new Dictionary<string, int>
        {
            // TTS Priority based on quality and language support
            ["Azure TTS"] = 1,      // Best neural voices, broad language support
            ["Google TTS"] = 2,     // Good quality, good language support  
            ["OpenAI TTS"] = 3      // High quality but limited language support
        };
    }
}
