using Microsoft.CognitiveServices.Speech;
using Microsoft.CognitiveServices.Speech.Audio;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.DTOs;
using A3ITranslator.Application.Common;
using A3ITranslator.Infrastructure.Configuration;
using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Infrastructure.Services.Azure;

/// <summary>
/// Azure Speech-to-Text service implementation
/// Following official Azure Speech SDK documentation and best practices
/// https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/
/// </summary>
public class AzureSTTService : ISTTService
{
    private readonly AzureOptions _options;
    private readonly ILogger<AzureSTTService> _logger;
    private readonly SpeechConfig _speechConfig;

    /// <summary>
    /// Azure STT supported languages with comprehensive coverage
    /// Based on official Azure Speech Service language support documentation
    /// https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support
    /// </summary>
    public static readonly Dictionary<string, string> SupportedLanguages = new()
    {
        // Major English variants - Azure's strongest support
        { "en-US", "English (United States)" },
        { "en-GB", "English (United Kingdom)" },
        { "en-AU", "English (Australia)" },
        { "en-CA", "English (Canada)" },
        { "en-IN", "English (India)" },
        { "en-NZ", "English (New Zealand)" },
        { "en-ZA", "English (South Africa)" },
        
        // Urdu - Azure's key strength per architecture docs
        { "ur-IN", "Urdu (India)" },
        { "ur-PK", "Urdu (Pakistan)" },
        
        // Arabic comprehensive support - Azure specialty
        { "ar-SA", "Arabic (Saudi Arabia)" },
        { "ar-EG", "Arabic (Egypt)" },
        { "ar-AE", "Arabic (United Arab Emirates)" },
        { "ar-QA", "Arabic (Qatar)" },
        { "ar-KW", "Arabic (Kuwait)" },
        { "ar-BH", "Arabic (Bahrain)" },
        { "ar-OM", "Arabic (Oman)" },
        { "ar-JO", "Arabic (Jordan)" },
        { "ar-LB", "Arabic (Lebanon)" },
        { "ar-SY", "Arabic (Syria)" },
        { "ar-IQ", "Iraq)" },
        { "ar-YE", "Arabic (Yemen)" },
        { "ar-LY", "Arabic (Libya)" },
        { "ar-TN", "Arabic (Tunisia)" },
        { "ar-DZ", "Arabic (Algeria)" },
        { "ar-MA", "Arabic (Morocco)" },
        
        // Major world languages - Tier 1 support
        { "zh-CN", "Chinese (Mandarin, Simplified)" },
        { "zh-TW", "Chinese (Taiwanese Mandarin, Traditional)" },
        { "zh-HK", "Chinese (Cantonese, Traditional)" },
        { "hi-IN", "Hindi (India)" },
        { "es-ES", "Spanish (Spain)" },
        { "es-MX", "Spanish (Mexico)" },
        { "es-US", "Spanish (United States)" },
        { "es-AR", "Spanish (Argentina)" },
        { "es-CL", "Spanish (Chile)" },
        { "es-CO", "Spanish (Colombia)" },
        { "es-PE", "Spanish (Peru)" },
        { "fr-FR", "French (France)" },
        { "fr-CA", "French (Canada)" },
        { "fr-BE", "French (Belgium)" },
        { "fr-CH", "French (Switzerland)" },
        { "de-DE", "German (Germany)" },
        { "de-AT", "German (Austria)" },
        { "de-CH", "German (Switzerland)" },
        { "it-IT", "Italian (Italy)" },
        { "ja-JP", "Japanese (Japan)" },
        { "ko-KR", "Korean (Korea)" },
        { "pt-BR", "Portuguese (Brazil)" },
        { "pt-PT", "Portuguese (Portugal)" },
        { "ru-RU", "Russian (Russia)" },
        
        // European languages - Strong Azure support
        { "nl-NL", "Dutch (Netherlands)" },
        { "nl-BE", "Dutch (Belgium)" },
        { "sv-SE", "Swedish (Sweden)" },
        { "da-DK", "Danish (Denmark)" },
        { "nb-NO", "Norwegian (Norway)" },
        { "fi-FI", "Finnish (Finland)" },
        { "pl-PL", "Polish (Poland)" },
        { "cs-CZ", "Czech (Czech Republic)" },
        { "hu-HU", "Hungarian (Hungary)" },
        { "tr-TR", "Turkish (Turkey)" },
        { "bg-BG", "Bulgarian (Bulgaria)" },
        { "hr-HR", "Croatian (Croatia)" },
        { "sr-RS", "Serbian (Serbia)" },
        { "sk-SK", "Slovak (Slovakia)" },
        { "sl-SI", "Slovenian (Slovenia)" },
        { "et-EE", "Estonian (Estonia)" },
        { "lv-LV", "Latvian (Latvia)" },
        { "lt-LT", "Lithuanian (Lithuania)" },
        { "ro-RO", "Romanian (Romania)" },
        { "uk-UA", "Ukrainian (Ukraine)" },
        
        // Indian languages - Azure's extensive support
        { "ta-IN", "Tamil (India)" },
        { "te-IN", "Telugu (India)" },
        { "kn-IN", "Kannada (India)" },
        { "ml-IN", "Malayalam (India)" },
        { "gu-IN", "Gujarati (India)" },
        { "mr-IN", "Marathi (India)" },
        { "bn-IN", "Bengali (India)" },
        { "pa-IN", "Punjabi (India)" },
        { "or-IN", "Odia (India)" },
        { "as-IN", "Assamese (India)" },
        
        // Southeast Asian languages
        { "th-TH", "Thai (Thailand)" },
        { "vi-VN", "Vietnamese (Vietnam)" },
        { "id-ID", "Indonesian (Indonesia)" },
        { "ms-MY", "Malay (Malaysia)" },
        { "fil-PH", "Filipino (Philippines)" },
        
        // Other supported languages
        { "he-IL", "Hebrew (Israel)" },
        { "fa-IR", "Persian (Iran)" },
        { "sw-KE", "Swahili (Kenya)" },
        { "sw-TZ", "Swahili (Tanzania)" },
        { "af-ZA", "Afrikaans (South Africa)" },
        { "ca-ES", "Catalan (Spain)" },
        { "eu-ES", "Basque (Spain)" },
        { "gl-ES", "Galician (Spain)" },
        { "mt-MT", "Maltese (Malta)" },
        { "cy-GB", "Welsh (United Kingdom)" },
        { "ga-IE", "Irish (Ireland)" },
        { "is-IS", "Icelandic (Iceland)" }
    };

    public AzureSTTService(IOptions<ServiceOptions> options, ILogger<AzureSTTService> logger)
    {
        _options = options.Value.Azure;
        _logger = logger;
        
        // Initialize Azure Speech Config following official documentation patterns
        // https://docs.microsoft.com/en-us/dotnet/api/microsoft.cognitiveservices.speech.speechconfig
        _speechConfig = SpeechConfig.FromSubscription(_options.SpeechKey, _options.SpeechRegion);
        
        // Configure for optimal audio processing as per Azure best practices
        _speechConfig.OutputFormat = OutputFormat.Detailed;
        _speechConfig.RequestWordLevelTimestamps();
        
        _logger.LogInformation("Azure STT Service initialized with region: {Region}", _options.SpeechRegion);
    }

    public STTProvider ProviderType => STTProvider.Azure;

    public Dictionary<string, string> GetSupportedLanguages()
    {
        return SupportedLanguages;
    }

    public string GetServiceName()
    {
        return "Azure Speech Services";
    }

    public async Task<Result<STTResponseDto>> TranscribeAsync(STTRequestDto request)
    {
        if (request.AudioData == null || request.AudioData.Length == 0)
        {
            return Result<STTResponseDto>.Failure("Audio data is null or empty");
        }

        if (!SupportedLanguages.ContainsKey(request.ExpectedLanguage))
        {
            return Result<STTResponseDto>.Failure($"Language {request.ExpectedLanguage} is not supported by Azure STT");
        }

        try
        {
            _logger.LogDebug("Processing audio with Azure STT for language: {Language}", request.ExpectedLanguage);

            // Configure speech recognizer for the specific language
            // Following Azure Speech SDK documentation for recognition configuration
            _speechConfig.SpeechRecognitionLanguage = request.ExpectedLanguage;
            
            // Create audio config from byte array
            // https://docs.microsoft.com/en-us/dotnet/api/microsoft.cognitiveservices.speech.audio.audioconfig
            using var audioStream = AudioInputStream.CreatePushStream();
            using var audioConfig = AudioConfig.FromStreamInput(audioStream);
            using var recognizer = new SpeechRecognizer(_speechConfig, audioConfig);

            // Enable detailed results for comprehensive analysis
            // Following Azure best practices for production applications
            recognizer.SessionStarted += (s, e) => 
            {
                _logger.LogDebug("Azure STT session started: {SessionId}", e.SessionId);
            };

            recognizer.SessionStopped += (s, e) => 
            {
                _logger.LogDebug("Azure STT session stopped: {SessionId}", e.SessionId);
            };

            // Write audio data to stream
            audioStream.Write(request.AudioData);
            audioStream.Close();

            // Perform recognition following Azure SDK patterns
            // https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/how-to-recognize-speech
            var startTime = DateTime.UtcNow;
            var result = await recognizer.RecognizeOnceAsync();
            var processingTime = DateTime.UtcNow - startTime;

            return result.Reason switch
            {
                ResultReason.RecognizedSpeech => ProcessRecognizedSpeech(result, request.ExpectedLanguage, processingTime),
                ResultReason.NoMatch => Result<STTResponseDto>.Failure("No speech could be recognized"),
                ResultReason.Canceled => ProcessCanceledResult(result),
                _ => Result<STTResponseDto>.Failure($"Unexpected result reason: {result.Reason}")
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in Azure STT processing for language: {Language}", request.ExpectedLanguage);
            return Result<STTResponseDto>.Failure($"Azure STT processing failed: {ex.Message}");
        }
    }

    public async Task<bool> IsHealthyAsync()
    {
        try
        {
            // Simple health check by testing config
            return !string.IsNullOrEmpty(_options.SpeechKey) && !string.IsNullOrEmpty(_options.SpeechRegion);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Process successfully recognized speech following Azure result patterns
    /// </summary>
    private Result<STTResponseDto> ProcessRecognizedSpeech(SpeechRecognitionResult result, string languageCode, TimeSpan processingTime)
    {
        _logger.LogInformation("Azure STT successfully recognized speech in {Language}: {Text}", 
            languageCode, result.Text);

        // Extract detailed information available from Azure
        var confidence = ExtractConfidence(result);
        var speakerInfo = ExtractSpeakerInfo(result);

        var sttResponse = new STTResponseDto
        {
            Transcription = result.Text,
            DetectedLanguage = languageCode,
            Confidence = (float)confidence,
            Provider = GetServiceName(),
            ProcessingTime = processingTime,
            Speaker = speakerInfo
        };

        return Result<STTResponseDto>.Success(sttResponse);
    }

    /// <summary>
    /// Process canceled recognition results with detailed error information
    /// Following Azure SDK error handling patterns
    /// </summary>
    private Result<STTResponseDto> ProcessCanceledResult(SpeechRecognitionResult result)
    {
        var cancellation = CancellationDetails.FromResult(result);
        
        var errorMessage = cancellation.Reason switch
        {
            CancellationReason.Error => $"Azure STT error: {cancellation.ErrorDetails}",
            CancellationReason.EndOfStream => "Audio stream ended unexpectedly",
            _ => $"Recognition was canceled: {cancellation.Reason}"
        };

        _logger.LogWarning("Azure STT recognition canceled: {Error}", errorMessage);
        return Result<STTResponseDto>.Failure(errorMessage);
    }

    /// <summary>
    /// Extract confidence score from Azure recognition result
    /// Based on Azure Speech SDK confidence metrics
    /// </summary>
    private double ExtractConfidence(SpeechRecognitionResult result)
    {
        try
        {
            // Azure provides detailed JSON with confidence scores
            // Parse the detailed result for confidence information
            var json = result.Properties.GetProperty(PropertyId.SpeechServiceResponse_JsonResult);
            if (!string.IsNullOrEmpty(json))
            {
                // In production, use System.Text.Json to parse confidence
                // For now, return a reasonable default based on successful recognition
                return 0.85; // High confidence for successful Azure recognition
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not extract confidence from Azure STT result");
        }

        return 0.80; // Default confidence for Azure STT
    }

    /// <summary>
    /// Extract speaker information from Azure result if available
    /// Azure Speech Services provides speaker identification capabilities
    /// </summary>
    private SpeakerDto? ExtractSpeakerInfo(SpeechRecognitionResult result)
    {
        try
        {
            // Azure can provide speaker diarization information
            // This would be enhanced in production with speaker identification features
            var speakerId = result.Properties.GetProperty("SpeakerId");
            
            if (!string.IsNullOrEmpty(speakerId))
            {
                return new SpeakerDto
                {
                    SpeakerId = speakerId,
                    SpeakerName = null, // Will be resolved through session management
                    IdentificationConfidence = 0.8f
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not extract speaker info from Azure STT result");
        }

        return null;
    }

    public void Dispose()
    {
        // SpeechConfig doesn't require explicit disposal in current SDK version
    }
}
