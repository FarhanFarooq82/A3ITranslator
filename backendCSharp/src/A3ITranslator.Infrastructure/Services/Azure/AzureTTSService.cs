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
/// Azure Text-to-Speech service implementation
/// Following official Azure Speech SDK documentation and best practices
/// https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/text-to-speech
/// </summary>
public class AzureTTSService : ITTSService
{
    private readonly AzureOptions _options;
    private readonly ILogger<AzureTTSService> _logger;
    private readonly SpeechConfig _speechConfig;

    /// <summary>
    /// Azure TTS supported languages with neural voice support
    /// Based on official Azure Speech Service voice list documentation
    /// https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#neural-voices
    /// </summary>
    public static readonly Dictionary<string, string> SupportedLanguages = new()
    {
        // English variants with premium neural voices
        { "en-US", "English (United States)" },
        { "en-GB", "English (United Kingdom)" },
        { "en-AU", "English (Australia)" },
        { "en-CA", "English (Canada)" },
        { "en-IN", "English (India)" },
        { "en-NZ", "English (New Zealand)" },
        { "en-ZA", "English (South Africa)" },
        
        // Urdu - Key requirement with Azure neural voices
        { "ur-IN", "Urdu (India)" },
        { "ur-PK", "Urdu (Pakistan)" },
        
        // Arabic comprehensive neural voice support
        { "ar-SA", "Arabic (Saudi Arabia)" },
        { "ar-EG", "Arabic (Egypt)" },
        { "ar-AE", "Arabic (United Arab Emirates)" },
        { "ar-QA", "Arabic (Qatar)" },
        { "ar-BH", "Arabic (Bahrain)" },
        { "ar-JO", "Arabic (Jordan)" },
        { "ar-KW", "Arabic (Kuwait)" },
        { "ar-LB", "Arabic (Lebanon)" },
        { "ar-OM", "Arabic (Oman)" },
        { "ar-SY", "Arabic (Syria)" },
        { "ar-TN", "Arabic (Tunisia)" },
        { "ar-YE", "Arabic (Yemen)" },
        { "ar-DZ", "Arabic (Algeria)" },
        { "ar-IQ", "Arabic (Iraq)" },
        { "ar-LY", "Arabic (Libya)" },
        { "ar-MA", "Arabic (Morocco)" },
        
        // Major world languages with neural voices
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
        
        // European languages with neural voice support
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
        
        // Indian languages with neural voice support
        { "ta-IN", "Tamil (India)" },
        { "te-IN", "Telugu (India)" },
        { "kn-IN", "Kannada (India)" },
        { "ml-IN", "Malayalam (India)" },
        { "gu-IN", "Gujarati (India)" },
        { "mr-IN", "Marathi (India)" },
        { "bn-IN", "Bengali (India)" },
        { "pa-IN", "Punjabi (India)" },
        
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
        { "af-ZA", "Afrikaans (South Africa)" },
        { "ca-ES", "Catalan (Spain)" },
        { "eu-ES", "Basque (Spain)" },
        { "gl-ES", "Galician (Spain)" },
        { "mt-MT", "Maltese (Malta)" },
        { "cy-GB", "Welsh (United Kingdom)" },
        { "ga-IE", "Irish (Ireland)" },
        { "is-IS", "Icelandic (Iceland)" }
    };

    /// <summary>
    /// Azure Neural Voices mapping based on official documentation
    /// https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#neural-voices
    /// </summary>
    public static readonly Dictionary<string, (string Male, string Female)> NeuralVoices = new()
    {
        { "en-US", ("en-US-BrianNeural", "en-US-JennyNeural") },
        { "en-GB", ("en-GB-RyanNeural", "en-GB-SoniaNeural") },
        { "en-AU", ("en-AU-WilliamNeural", "en-AU-NatashaNeural") },
        { "en-CA", ("en-CA-LiamNeural", "en-CA-ClaraNeural") },
        { "en-IN", ("en-IN-PrabhatNeural", "en-IN-NeerjaNeural") },
        
        // Urdu voices - Key architecture requirement
        { "ur-IN", ("ur-IN-SalmanNeural", "ur-IN-GulNeural") },
        { "ur-PK", ("ur-PK-AsadNeural", "ur-PK-UzmaNeural") },
        
        // Arabic voices
        { "ar-SA", ("ar-SA-HamedNeural", "ar-SA-ZariyahNeural") },
        { "ar-EG", ("ar-EG-ShakirNeural", "ar-EG-SalmaNeural") },
        { "ar-AE", ("ar-AE-HamadNeural", "ar-AE-FatimaNeural") },
        
        // Major world languages
        { "zh-CN", ("zh-CN-YunjianNeural", "zh-CN-XiaoxiaoNeural") },
        { "zh-TW", ("zh-TW-YunJheNeural", "zh-TW-HsiaoChenNeural") },
        { "hi-IN", ("hi-IN-MadhurNeural", "hi-IN-SwaraNeural") },
        { "es-ES", ("es-ES-AlvaroNeural", "es-ES-ElviraNeural") },
        { "es-MX", ("es-MX-JorgeNeural", "es-MX-DaliaNeural") },
        { "fr-FR", ("fr-FR-HenriNeural", "fr-FR-DeniseNeural") },
        { "de-DE", ("de-DE-ConradNeural", "de-DE-KatjaNeural") },
        { "it-IT", ("it-IT-DiegoNeural", "it-IT-ElsaNeural") },
        { "ja-JP", ("ja-JP-KeitaNeural", "ja-JP-NanamiNeural") },
        { "ko-KR", ("ko-KR-InJoonNeural", "ko-KR-SunHiNeural") },
        { "pt-BR", ("pt-BR-AntonioNeural", "pt-BR-FranciscaNeural") },
        { "ru-RU", ("ru-RU-DmitryNeural", "ru-RU-SvetlanaNeural") }
    };

    public AzureTTSService(IOptions<ServiceOptions> options, ILogger<AzureTTSService> logger)
    {
        _options = options.Value.Azure;
        _logger = logger;
        
        // Initialize Azure Speech Config for TTS following official documentation
        // https://docs.microsoft.com/en-us/dotnet/api/microsoft.cognitiveservices.speech.speechconfig
        _speechConfig = SpeechConfig.FromSubscription(_options.SpeechKey, _options.SpeechRegion);
        
        // Configure for high-quality neural voice output
        _speechConfig.SetProperty(PropertyId.SpeechServiceConnection_SynthOutputFormat, "riff-24khz-16bit-mono-pcm");
        
        _logger.LogInformation("Azure TTS Service initialized with region: {Region}", _options.SpeechRegion);
    }

    public TTSProvider ProviderType => TTSProvider.Azure;

    public Dictionary<string, string> GetSupportedLanguages()
    {
        return SupportedLanguages;
    }

    public string GetServiceName()
    {
        return "Azure Speech Services TTS";
    }

    public async Task<Result<TTSResponseDto>> GenerateSpeechAsync(TTSRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return Result<TTSResponseDto>.Failure("Text to convert cannot be null or empty");
        }

        if (!SupportedLanguages.ContainsKey(request.TargetLanguage))
        {
            return Result<TTSResponseDto>.Failure($"Language {request.TargetLanguage} is not supported by Azure TTS");
        }

        try
        {
            _logger.LogDebug("Converting text to speech with Azure TTS for language: {Language}", request.TargetLanguage);

            // Select appropriate neural voice based on speaker info
            var preferredGender = request.Speaker?.Gender.ToString().ToLower();
            var voiceName = SelectVoice(request.TargetLanguage, preferredGender);
            _speechConfig.SpeechSynthesisVoiceName = voiceName;

            // Create synthesizer following Azure TTS documentation
            // https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/how-to-speech-synthesis
            using var synthesizer = new SpeechSynthesizer(_speechConfig);

            var startTime = DateTime.UtcNow;
            // Perform synthesis with neural voice
            var result = await synthesizer.SpeakTextAsync(request.Text);
            var processingTime = DateTime.UtcNow - startTime;

            return result.Reason switch
            {
                ResultReason.SynthesizingAudioCompleted => ProcessSynthesisSuccess(result, request, voiceName, processingTime),
                ResultReason.Canceled => ProcessSynthesisError(result),
                _ => Result<TTSResponseDto>.Failure($"Unexpected synthesis result: {result.Reason}")
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in Azure TTS processing for language: {Language}", request.TargetLanguage);
            return Result<TTSResponseDto>.Failure($"Azure TTS processing failed: {ex.Message}");
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
    /// Select the best Azure Neural Voice based on language and gender preference
    /// Following Azure voice selection best practices
    /// </summary>
    private string SelectVoice(string languageCode, string? preferredGender)
    {
        if (NeuralVoices.TryGetValue(languageCode, out var voices))
        {
            var selectedVoice = preferredGender?.ToLower() switch
            {
                "male" => voices.Male,
                "female" => voices.Female,
                _ => voices.Female // Default to female voice as per UI standards
            };
            
            _logger.LogDebug("Selected Azure neural voice: {Voice} for {Language} ({Gender})", 
                selectedVoice, languageCode, preferredGender ?? "default");
            
            return selectedVoice;
        }

        // Fallback to default voice for the language
        var fallbackVoice = $"{languageCode}-Standard-A";
        _logger.LogWarning("No neural voice mapping found for {Language}, using fallback: {Voice}", 
            languageCode, fallbackVoice);
        
        return fallbackVoice;
    }

    /// <summary>
    /// Process successful synthesis result
    /// </summary>
    private Result<TTSResponseDto> ProcessSynthesisSuccess(SpeechSynthesisResult result, TTSRequestDto request, string voiceName, TimeSpan processingTime)
    {
        _logger.LogInformation("Azure TTS synthesis successful for {Language} using voice {Voice}", 
            request.TargetLanguage, voiceName);

        var ttsResponse = new TTSResponseDto
        {
            AudioData = result.AudioData,
            MimeType = "audio/wav",
            Provider = GetServiceName(),
            VoiceUsed = voiceName,
            Quality = voiceName.Contains("Neural") ? VoiceQuality.Premium : VoiceQuality.Standard,
            ProcessingTime = processingTime,
            WasCached = false
        };

        return Result<TTSResponseDto>.Success(ttsResponse);
    }

    /// <summary>
    /// Process synthesis error with detailed information
    /// </summary>
    private Result<TTSResponseDto> ProcessSynthesisError(SpeechSynthesisResult result)
    {
        var cancellation = SpeechSynthesisCancellationDetails.FromResult(result);
        
        var errorMessage = cancellation.Reason switch
        {
            CancellationReason.Error => $"Azure TTS error: {cancellation.ErrorDetails}",
            CancellationReason.EndOfStream => "Synthesis stream ended unexpectedly",
            _ => $"Synthesis was canceled: {cancellation.Reason}"
        };

        _logger.LogWarning("Azure TTS synthesis failed: {Error}", errorMessage);
        return Result<TTSResponseDto>.Failure(errorMessage);
    }

    public List<A3ITranslator.Application.DTOs.VoiceInfo> GetAvailableVoices(string languageCode)
    {
        var voices = new List<A3ITranslator.Application.DTOs.VoiceInfo>();

        if (NeuralVoices.TryGetValue(languageCode, out var voicePair))
        {
            voices.Add(new A3ITranslator.Application.DTOs.VoiceInfo
            {
                Name = voicePair.Male,
                Language = languageCode,
                Gender = "Male",
                Quality = "Neural",
                Provider = GetServiceName()
            });

            voices.Add(new A3ITranslator.Application.DTOs.VoiceInfo
            {
                Name = voicePair.Female,
                Language = languageCode,
                Gender = "Female",
                Quality = "Neural",
                Provider = GetServiceName()
            });
        }

        return voices;
    }

    public void Dispose()
    {
        // SpeechConfig doesn't require explicit disposal in current SDK version
    }
}
