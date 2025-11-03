using A3ITranslator.Application.Services;
using A3ITranslator.Application.Common;
using A3ITranslator.Application.DTOs.Audio;
using A3ITranslator.Infrastructure.Configuration;
using A3ITranslator.Infrastructure.Helpers;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using Microsoft.CognitiveServices.Speech;
using Microsoft.CognitiveServices.Speech.Audio;
using Newtonsoft.Json.Linq;
using System.Text;

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
        return "Azure STT";
    }

    /// <summary>
    /// Azure STT supports language detection
    /// </summary>
    public bool SupportsLanguageDetection => true;

    /// <summary>
    /// Azure STT requires WAV format conversion
    /// </summary>
    public bool RequiresAudioConversion => true;

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
    /// Transcribe audio with language detection using continuous recognition
    /// </summary>
    public async Task<STTResult> TranscribeWithDetectionAsync(
        byte[] audio,
        string[] candidateLanguages,
        CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;

        // Validate credentials
        if (string.IsNullOrEmpty(_options.Azure?.SpeechKey) || 
            (string.IsNullOrEmpty(_options.Azure?.SpeechRegion) && string.IsNullOrEmpty(_options.Azure?.SpeechEndpoint)))
        {
            throw new Exception("Azure Speech credentials not configured");
        }

        // Create speech config
        SpeechConfig speechConfig;
        if (!string.IsNullOrEmpty(_options.Azure?.SpeechEndpoint))
        {
            speechConfig = SpeechConfig.FromEndpoint(new Uri(_options.Azure.SpeechEndpoint), _options.Azure.SpeechKey);
        }
        else
        {
            speechConfig = SpeechConfig.FromSubscription(_options.Azure?.SpeechKey, _options.Azure?.SpeechRegion);
        }
        
        // Configure timeout settings
        speechConfig.SetProperty(PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "10000");
        speechConfig.SetProperty(PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "6000");
        speechConfig.SetProperty(PropertyId.Speech_SegmentationSilenceTimeoutMs, "1000");

        // Configure automatic language detection
        var autoDetectConfig = AutoDetectSourceLanguageConfig.FromLanguages(candidateLanguages);
        
        _logger.LogInformation("Azure STT starting transcription with candidate languages: [{Languages}]", 
            string.Join(", ", candidateLanguages));

        // Convert audio to WAV format using helper
        string tempAudioFile = await AudioConversionHelper.ConvertToWavWithFFmpeg(audio, cancellationToken);

        try
        {
            // Create audio config
            var audioConfig = AudioConfig.FromWavFileInput(tempAudioFile);
            
            // Use continuous recognition
            return await TryContinuousRecognition(speechConfig, autoDetectConfig, audioConfig, candidateLanguages, startTime);
        }
        finally
        {
            // Clean up temporary file
            if (File.Exists(tempAudioFile))
            {
                File.Delete(tempAudioFile);
            }
        }
    }

    /// <summary>
    /// Continuous recognition for audio transcription with language detection
    /// </summary>
    private async Task<STTResult> TryContinuousRecognition(
        SpeechConfig speechConfig, 
        AutoDetectSourceLanguageConfig autoDetectConfig, 
        AudioConfig audioConfig, 
        string[] candidateLanguages, 
        DateTime startTime)
    {
        try
        {
            using var recognizer = new SpeechRecognizer(speechConfig, autoDetectConfig, audioConfig);
            
            var result = new TaskCompletionSource<string>();
            var transcription = new StringBuilder();
            string detectedLanguage = candidateLanguages.FirstOrDefault() ?? "en-US";
            
            recognizer.Recognized += (s, e) =>
            {
                if (e.Result.Reason == ResultReason.RecognizedSpeech && !string.IsNullOrEmpty(e.Result.Text))
                {
                    transcription.AppendLine(e.Result.Text);
                    
                    // Try multiple ways to get the detected language
                    var detected = e.Result.Properties.GetProperty(PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult);
                    if (string.IsNullOrEmpty(detected))
                    {
                        // Fallback: try getting from the auto detect result directly
                        var autoResult = AutoDetectSourceLanguageResult.FromResult(e.Result);
                        detected = autoResult?.Language;
                    }
                    
                    if (!string.IsNullOrEmpty(detected))
                    {
                        detectedLanguage = detected;
                        _logger.LogDebug("Azure STT detected language: {Language} for text: {Text}", 
                            detected, e.Result.Text.Substring(0, Math.Min(50, e.Result.Text.Length)));
                    }
                }
            };
            
            recognizer.SessionStopped += (s, e) =>
            {
                result.TrySetResult(transcription.ToString().Trim());
            };
            
            recognizer.Canceled += (s, e) =>
            {
                result.TrySetResult(transcription.ToString().Trim());
            };
            
            await recognizer.StartContinuousRecognitionAsync();
            
            var timeoutTask = Task.Delay(30000);
            var completedTask = await Task.WhenAny(result.Task, timeoutTask);
            
            await recognizer.StopContinuousRecognitionAsync();
            
            var finalText = completedTask == timeoutTask ? transcription.ToString().Trim() : await result.Task;
            var processingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
            
            if (!string.IsNullOrEmpty(finalText))
            {
                _logger.LogInformation("Azure STT completed - Detected Language: {Language}, Text: {Text}", 
                    detectedLanguage, finalText.Substring(0, Math.Min(100, finalText.Length)) + "...");
                
                return new STTResult
                {
                    Success = true,
                    Transcription = finalText,
                    DetectedLanguage = detectedLanguage,
                    Confidence = 0.8f,
                    Provider = GetServiceName(),
                    ProcessingTimeMs = processingTime,
                    SpeakerAnalysis = new SpeakerAnalysis
                    {
                        Language = detectedLanguage,
                        SpeakerTag = 1,
                        SpeakerLabel = "Speaker1",
                        Confidence = 0.8f,
                        Gender = "NEUTRAL",
                        EstimatedAgeRange = "adult",
                        IsKnownSpeaker = false
                    },
                    Words = new List<WordInfo>()
                };
            }
            
            throw new Exception("No speech recognized");
        }
        catch (Exception ex)
        {
            throw new Exception($"Recognition failed: {ex.Message}");
        }
    }

    /// <summary>
    /// Check service health
    /// </summary>
    public async Task<bool> CheckHealthAsync()
    {
        try
        {
            await Task.Delay(10);
            var hasConfig = !string.IsNullOrEmpty(_options.Azure?.SpeechKey) &&
                        (!string.IsNullOrEmpty(_options.Azure?.SpeechRegion) || !string.IsNullOrEmpty(_options.Azure?.SpeechEndpoint));
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
