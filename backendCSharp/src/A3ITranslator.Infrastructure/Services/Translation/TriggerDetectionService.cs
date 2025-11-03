using A3ITranslator.Application.DTOs.Translation;
using A3ITranslator.Application.Services;
using Microsoft.Extensions.Logging;
using System.Text.RegularExpressions;

namespace A3ITranslator.Infrastructure.Services.Translation;

/// <summary>
/// Service for detecting trigger phrases that indicate AI assistance requests
/// Supports multi-language fuzzy matching with high performance
/// </summary>
public class TriggerDetectionService : ITriggerDetectionService
{
    private readonly ILogger<TriggerDetectionService> _logger;
    private readonly Dictionary<string, List<string>> _triggerPhrases;

    public TriggerDetectionService(ILogger<TriggerDetectionService> logger)
    {
        _logger = logger;
        _triggerPhrases = InitializeTriggerPhrases();
    }

    /// <summary>
    /// Multi-language trigger dictionary as specified in the MD
    /// </summary>
    private Dictionary<string, List<string>> InitializeTriggerPhrases()
    {
        return new Dictionary<string, List<string>>
        {
            ["en"] = new() { "hey translator", "dear translator", "hello translator", "ok translator" },
            ["ur"] = new() { "اے ترجمان", "ہیلو ترجمان", "ترجمان صاحب", "اوکے ترجمان" },
            ["hi"] = new() { "हे अनुवादक", "हैलो ट्रांसलेटर", "ओके ट्रांसलेटर", "प्रिय अनुवादक" },
            ["ar"] = new() { "يا مترجم", "مرحبا مترجم", "أوكي مترجم", "عزيزي المترجم" },
            ["es"] = new() { "hey traductor", "hola traductor", "ok traductor", "querido traductor" },
            ["fr"] = new() { "hey traducteur", "bonjour traducteur", "ok traducteur", "cher traducteur" },
            ["de"] = new() { "hey übersetzer", "hallo übersetzer", "ok übersetzer", "lieber übersetzer" }
        };
    }

    public TriggerDetectionResult DetectTrigger(string transcription, string sourceLanguage, string targetLanguage)
    {
        if (string.IsNullOrWhiteSpace(transcription))
        {
            return new TriggerDetectionResult { TriggerDetected = false, NeedsAIConfirmation = false };
        }

        var normalizedText = NormalizeText(transcription);
        var languagesToCheck = new[] { sourceLanguage, targetLanguage, "en" }.Distinct();

        _logger.LogDebug("Checking trigger detection for text: '{Text}' in languages: [{Languages}]", 
            normalizedText, string.Join(", ", languagesToCheck));

        foreach (var language in languagesToCheck)
        {
            var langCode = ExtractLanguageCode(language);
            if (_triggerPhrases.ContainsKey(langCode))
            {
                foreach (var trigger in _triggerPhrases[langCode])
                {
                    var similarity = FuzzyMatch(normalizedText, trigger, toleranceLevel: 0.8f);
                    if (similarity >= 0.8f)
                    {
                        _logger.LogInformation("Trigger detected: '{Trigger}' in language '{Language}' with similarity {Similarity}", 
                            trigger, langCode, similarity);

                        return new TriggerDetectionResult
                        {
                            TriggerDetected = true,
                            DetectedTrigger = trigger,
                            Language = langCode,
                            NeedsAIConfirmation = true,
                            Confidence = similarity
                        };
                    }
                }
            }
        }

        return new TriggerDetectionResult
        {
            TriggerDetected = false,
            NeedsAIConfirmation = false,
            Confidence = 0.0f
        };
    }

    public void AddTriggerPhrases(string language, IEnumerable<string> phrases)
    {
        var langCode = ExtractLanguageCode(language);
        if (!_triggerPhrases.ContainsKey(langCode))
        {
            _triggerPhrases[langCode] = new List<string>();
        }

        _triggerPhrases[langCode].AddRange(phrases);
        _logger.LogInformation("Added {Count} trigger phrases for language '{Language}'", phrases.Count(), langCode);
    }

    public IEnumerable<string> GetSupportedLanguages()
    {
        return _triggerPhrases.Keys;
    }

    /// <summary>
    /// Normalize text for consistent matching
    /// </summary>
    private string NormalizeText(string text)
    {
        return text
            .ToLowerInvariant()
            .Trim()
            .RegexReplace(@"\s+", " ")      // Normalize multiple spaces
            .RegexReplace(@"[^\w\s\u0600-\u06FF\u0900-\u097F]", ""); // Keep alphanumeric, spaces, Arabic, Hindi chars
    }

    /// <summary>
    /// Extract language code from language identifier (e.g., "en-US" -> "en")
    /// </summary>
    private string ExtractLanguageCode(string language)
    {
        if (string.IsNullOrEmpty(language)) return "en";
        
        var parts = language.Split('-');
        return parts[0].ToLowerInvariant();
    }

    /// <summary>
    /// Fuzzy matching using Levenshtein distance for handling typos and variations
    /// </summary>
    private float FuzzyMatch(string text, string pattern, float toleranceLevel)
    {
        if (string.IsNullOrEmpty(text) || string.IsNullOrEmpty(pattern))
            return 0.0f;

        // Direct substring match gets highest score
        if (text.Contains(pattern))
            return 1.0f;

        // Calculate Levenshtein similarity
        var similarity = LevenshteinSimilarity(text, pattern);
        
        // Also check if pattern words appear in text (for word order variations)
        var patternWords = pattern.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var textWords = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        
        var wordsFound = patternWords.Count(pw => textWords.Any(tw => 
            tw.Equals(pw, StringComparison.OrdinalIgnoreCase) || 
            LevenshteinSimilarity(tw, pw) > 0.7f));
        
        var wordSimilarity = (float)wordsFound / patternWords.Length;
        
        // Return the higher of the two similarities
        return Math.Max(similarity, wordSimilarity);
    }

    /// <summary>
    /// Calculate Levenshtein similarity (1.0 = identical, 0.0 = completely different)
    /// </summary>
    private float LevenshteinSimilarity(string source, string target)
    {
        if (string.IsNullOrEmpty(source) && string.IsNullOrEmpty(target))
            return 1.0f;

        if (string.IsNullOrEmpty(source) || string.IsNullOrEmpty(target))
            return 0.0f;

        var distance = LevenshteinDistance(source, target);
        var maxLength = Math.Max(source.Length, target.Length);
        
        return 1.0f - (float)distance / maxLength;
    }

    /// <summary>
    /// Calculate Levenshtein distance between two strings
    /// </summary>
    private int LevenshteinDistance(string source, string target)
    {
        var sourceLength = source.Length;
        var targetLength = target.Length;
        var matrix = new int[sourceLength + 1, targetLength + 1];

        for (int i = 0; i <= sourceLength; i++)
            matrix[i, 0] = i;

        for (int j = 0; j <= targetLength; j++)
            matrix[0, j] = j;

        for (int i = 1; i <= sourceLength; i++)
        {
            for (int j = 1; j <= targetLength; j++)
            {
                var cost = source[i - 1] == target[j - 1] ? 0 : 1;
                matrix[i, j] = Math.Min(
                    Math.Min(matrix[i - 1, j] + 1, matrix[i, j - 1] + 1),
                    matrix[i - 1, j - 1] + cost);
            }
        }

        return matrix[sourceLength, targetLength];
    }
}

/// <summary>
/// Extension methods for regex operations
/// </summary>
public static class StringExtensions
{
    public static string RegexReplace(this string input, string pattern, string replacement)
    {
        return Regex.Replace(input, pattern, replacement);
    }
}
