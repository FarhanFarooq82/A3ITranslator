using A3ITranslator.Application.Services;

namespace A3ITranslator.Infrastructure.Services.Language;

/// <summary>
/// Simplified Language service - combines STT languages from all providers
/// Gets language dictionaries from actual Infrastructure service implementations via DI
/// Uses caching to prevent multiple concurrent calls from re-computing the same data
/// </summary>
public class LanguageService : ILanguageService
{
    private readonly IEnumerable<ISTTService> _sttServices;
    private readonly Lazy<Dictionary<string, string>> _cachedLanguages;

    public LanguageService(IEnumerable<ISTTService> sttServices)
    {
        _sttServices = sttServices;
        // Use Lazy<T> for thread-safe, one-time initialization
        _cachedLanguages = new Lazy<Dictionary<string, string>>(LoadAllSupportedLanguages);
    }

    /// <summary>
    /// Get all STT languages combined from all registered STT services
    /// Uses cached result to prevent multiple concurrent API calls from re-computing
    /// </summary>
    public Dictionary<string, string> GetAllSupportedLanguages()
    {
        // Debug: Log thread info for concurrent request tracking
        Console.WriteLine($"DEBUG: Thread {System.Threading.Thread.CurrentThread.ManagedThreadId} - GetAllSupportedLanguages called (using cached result)");
        
        // Return cached result - Lazy<T> ensures thread-safe, one-time computation
        return _cachedLanguages.Value;
    }

    /// <summary>
    /// Private method that does the actual work of loading and combining languages
    /// Called only once by Lazy<T> initialization, even with concurrent requests
    /// </summary>
    private Dictionary<string, string> LoadAllSupportedLanguages()
    {
        var combinedLanguages = new Dictionary<string, string>();

        // Debug: Log thread info for actual computation
        Console.WriteLine($"DEBUG: Thread {System.Threading.Thread.CurrentThread.ManagedThreadId} - LoadAllSupportedLanguages computing (ONLY ONCE)");
        
        // Get languages from all registered STT services
        foreach (var sttService in _sttServices)
        {
            // Debug: Log which service is being called
            Console.WriteLine($"DEBUG: Thread {System.Threading.Thread.CurrentThread.ManagedThreadId} - Processing {sttService.GetType().Name}");
            var serviceLanguages = sttService.GetSupportedLanguages();
            Console.WriteLine($"DEBUG: {sttService.GetType().Name} has {serviceLanguages.Count} languages");
            
            // Combine languages (union) - first provider wins on duplicates
            foreach (var lang in serviceLanguages)
            {
                // Skip if: 1) Key already exists OR 2) It's a 2-letter code and BCP-47 variant exists
                if (combinedLanguages.ContainsKey(lang.Key) || 
                    (lang.Key.Length == 2 && combinedLanguages.Keys.Any(k => k.StartsWith(lang.Key + "-"))))
                {
                    continue; // Skip duplicates and Whisper's "da" if "da-DK" already exists
                }
                combinedLanguages.Add(lang.Key, lang.Value);
            }
        }

        Console.WriteLine($"DEBUG: LoadAllSupportedLanguages completed - {combinedLanguages.Count} total languages");
        return combinedLanguages
            .OrderBy(x => x.Value) // Sort alphabetically by language display name
            .ToDictionary(x => x.Key, x => x.Value);
    }
}
