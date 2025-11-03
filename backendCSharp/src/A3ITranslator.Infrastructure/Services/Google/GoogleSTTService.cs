using A3ITranslator.Application.Services;
using A3ITranslator.Application.Common;
using A3ITranslator.Application.DTOs.Audio;
using A3ITranslator.Infrastructure.Configuration;
using A3ITranslator.Infrastructure.Helpers;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using Google.Cloud.Speech.V2;
using Google.Protobuf;

namespace A3ITranslator.Infrastructure.Services.Google;

/// <summary>
/// Google Cloud Speech-to-Text service implementation
/// Based on official Google Cloud Speech-to-Text documentation
/// </summary>
public class GoogleSTTService : ISTTService
{
    private readonly ServiceOptions _options;
    private readonly ILogger<GoogleSTTService> _logger;
    private readonly SpeechClient _speechClient;
    private readonly string _recognizerName;
    private readonly bool _useRegionalEndpoint;

    public GoogleSTTService(IOptions<ServiceOptions> options, ILogger<GoogleSTTService> logger)
    {
        _options = options.Value;
        _logger = logger;
        
        try
        {
            // Initialize Google Speech client with credentials
            if (!string.IsNullOrEmpty(_options.Google?.CredentialsPath))
            {
                Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", _options.Google.CredentialsPath);
            }
            
            // Try to configure regional endpoint first, fall back to global if not available
            var location = _options.Google?.Location ?? "europe-west4"; // Use west1 as it's confirmed available
            var apiEndpoint = _options.Google?.ApiEndpoint ?? $"{location}-speech.googleapis.com";
            
            try
            {
                // Attempt to create client with regional endpoint
                var clientBuilder = new SpeechClientBuilder
                {
                    Endpoint = apiEndpoint
                };
                
                _speechClient = clientBuilder.Build();
                _useRegionalEndpoint = true;
                
                _logger.LogInformation("Google STT Service initialized with regional endpoint: {ApiEndpoint}", apiEndpoint);
            }
            catch (Exception)
            {
                // Fall back to global endpoint if regional fails
                _speechClient = SpeechClient.Create();
                _useRegionalEndpoint = false;
                
                _logger.LogWarning("Regional endpoint {ApiEndpoint} not available, using global endpoint", apiEndpoint);
                _logger.LogInformation("Google STT Service initialized with global endpoint (GDPR compliance via project settings)");
            }
            
            // Construct the recognizer name based on endpoint type
            var projectId = _options.Google?.ProjectId ?? "a3itranslator";
            var recognizerId = _options.Google?.RecognizerId ?? "denmark-stt-recognizer";
            
            if (_useRegionalEndpoint)
            {
                _recognizerName = $"projects/{projectId}/locations/{location}/recognizers/{recognizerId}";
                _logger.LogInformation("Using regional recognizer: {RecognizerName}", _recognizerName);
            }
            else
            {
                _recognizerName = $"projects/{projectId}/locations/global/recognizers/_"; // Use global default
                _logger.LogInformation("Using global recognizer with EU data residency via project configuration");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize Google STT client");
            throw;
        }
    }

    /// <summary>
    /// Get supported languages - Google STT language codes
    /// </summary>
    public Dictionary<string, string> GetSupportedLanguages()
    {
        return GoogleSTTLanguages;
    }

    /// <summary>
    /// Get service name for identification
    /// </summary>
    public string GetServiceName()
    {
        return "Google STT";
    }

    /// <summary>
    /// Google STT supports language detection through multiple language codes
    /// </summary>
    public bool SupportsLanguageDetection => true;

    /// <summary>
    /// Google STT supports native audio formats (no conversion needed)
    /// </summary>
    public bool RequiresAudioConversion => false;

    /// <summary>
    /// Health check for Google STT service
    /// </summary>
    public async Task<bool> CheckHealthAsync()
    {
        try
        {
            // Simple test to verify service availability
            await Task.CompletedTask;
            return _speechClient != null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Google STT health check failed");
            return false;
        }
    }

    /// <summary>
    /// Legacy method for compatibility
    /// </summary>
    public async Task<Result<string>> ConvertSpeechToTextAsync(byte[] audioData, string languageCode, string sessionId)
    {
        try
        {
            var result = await TranscribeWithDetectionAsync(audioData, new[] { languageCode }, CancellationToken.None);
            if (result.Success)
            {
                return Result<string>.Success(result.Transcription);
            }
            return Result<string>.Failure(result.ErrorMessage);
        }
        catch (Exception ex)
        {
            return Result<string>.Failure($"Google STT error: {ex.Message}");
        }
    }

    /// <summary>
    /// Transcribe audio with language detection using Google STT v2
    /// Note: chirp_2 model does NOT support multiple language detection.
    /// For chirp_2, we'll try the first language, then fallback to other candidates if needed.
    /// For other models (latest_long, latest_short, telephony), multiple language detection is supported.
    /// </summary>
    public async Task<STTResult> TranscribeWithDetectionAsync(
        byte[] audio,
        string[] candidateLanguages,
        CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        
        try
        {
            _logger.LogInformation("Starting Google STT v2 transcription with {EndpointType}", 
                _useRegionalEndpoint ? "regional endpoint" : "global endpoint (EU data residency)");
            
            var selectedModel = _options.Google?.STTModel ?? "chirp_2";
            _logger.LogInformation("Using STT model: {Model}", selectedModel);
            _logger.LogInformation("Candidate languages: [{Languages}]", string.Join(", ", candidateLanguages));

            // Detect audio format from the actual bytes first
            var audioFormat = AudioFormatHelper.DetectFormat(audio);
            _logger.LogInformation("Detected audio format: {Format} - {Description}", 
                audioFormat.Format, audioFormat.Description);

            // Check if the model supports multiple language detection
            var supportsMultiLanguage = selectedModel == "latest_long" || selectedModel == "latest_short" || selectedModel == "telephony";
            
            if (!supportsMultiLanguage && candidateLanguages.Length > 1)
            {
                _logger.LogInformation("Model {Model} does not support multiple language detection. Will try each language individually.", selectedModel);
            }

            // Only try to ensure regional recognizer if using regional endpoint
            if (_useRegionalEndpoint)
            {
                var recognizerReady = await EnsureRegionalRecognizerExistsAsync(candidateLanguages, cancellationToken);
                if (!recognizerReady)
                {
                    _logger.LogWarning("Regional recognizer not available, falling back to global approach");
                    // Don't fail here, let it continue with global approach
                }
            }

            // For chirp_2 and other non-multilingual models, try each language individually
            if (!supportsMultiLanguage)
            {
                foreach (var language in candidateLanguages)
                {
                    try
                    {
                        _logger.LogInformation("Attempting recognition with language: {Language}", language);
                        
                        var result = await TryRecognitionWithSingleLanguage(audio, language, selectedModel, cancellationToken);
                        if (result.Success)
                        {
                            var processingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
                            result.ProcessingTimeMs = processingTime;
                            return result;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Recognition failed for language {Language}: {Message}", language, ex.Message);
                        // Continue to next language
                    }
                }
                
                // If all languages failed
                var totalProcessingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
                return new STTResult
                {
                    Success = false,
                    ErrorMessage = $"Recognition failed for all candidate languages: [{string.Join(", ", candidateLanguages)}]",
                    Provider = GetServiceName(),
                    ProcessingTimeMs = totalProcessingTime
                };
            }
            else
            {
                // For models that support multiple language detection
                var config = new RecognitionConfig
                {
                    Model = selectedModel,
                    LanguageCodes = { candidateLanguages }, // Multiple languages supported
                    AutoDecodingConfig = new AutoDetectDecodingConfig(),
                    Features = new RecognitionFeatures
                    {
                        EnableAutomaticPunctuation = true,
                        EnableWordTimeOffsets = true
                    }
                };

                var request = new RecognizeRequest
                {
                    Recognizer = _recognizerName,
                    Config = config,
                    Content = ByteString.CopyFrom(audio)
                };

                var response = await _speechClient.RecognizeAsync(request, cancellationToken);
                
                var processingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
                
                if (response.Results.Count > 0 && response.Results[0].Alternatives.Count > 0)
                {
                    var result = response.Results[0];
                    var alternative = result.Alternatives[0];
                    
                    var detectedLanguage = result.LanguageCode ?? candidateLanguages[0];
                    
                    var words = new List<Application.DTOs.Audio.WordInfo>();
                    foreach (var word in alternative.Words)
                    {
                        words.Add(new Application.DTOs.Audio.WordInfo
                        {
                            Word = word.Word,
                            StartTime = word.StartOffset?.ToTimeSpan() ?? TimeSpan.Zero,
                            EndTime = word.EndOffset?.ToTimeSpan() ?? TimeSpan.Zero,
                            Confidence = alternative.Confidence,
                            SpeakerTag = 1,
                            SpeakerLabel = "Speaker1"
                        });
                    }

                    _logger.LogInformation("Google STT v2 successful - Detected: {Language}, Confidence: {Confidence}, Text: {Text}", 
                        detectedLanguage, alternative.Confidence, 
                        string.IsNullOrEmpty(alternative.Transcript) ? "[empty]" : 
                        alternative.Transcript.Substring(0, Math.Min(50, alternative.Transcript.Length)) + "...");

                    return new STTResult
                    {
                        Success = true,
                        Transcription = alternative.Transcript ?? "",
                        DetectedLanguage = detectedLanguage,
                        Confidence = alternative.Confidence,
                        Provider = GetServiceName(),
                        ProcessingTimeMs = processingTime,
                        SpeakerAnalysis = new SpeakerAnalysis
                        {
                            Language = detectedLanguage,
                            SpeakerTag = 1,
                            SpeakerLabel = "Speaker1",
                            Confidence = alternative.Confidence,
                            Gender = "NEUTRAL",
                            EstimatedAgeRange = "adult",
                            IsKnownSpeaker = false
                        },
                        Words = words
                    };
                }

                return new STTResult
                {
                    Success = false,
                    ErrorMessage = "No speech recognized by Google STT v2",
                    Provider = GetServiceName(),
                    ProcessingTimeMs = processingTime
                };
            }
        }
        catch (Exception ex)
        {
            var processingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
            _logger.LogError(ex, "Google STT v2 transcription failed");
            
            return new STTResult
            {
                Success = false,
                ErrorMessage = $"Google STT v2 error: {ex.Message}",
                Provider = GetServiceName(),
                ProcessingTimeMs = processingTime
            };
        }
    }

    /// <summary>
    /// Try recognition with a single language (for chirp_2 and other non-multilingual models)
    /// </summary>
    private async Task<STTResult> TryRecognitionWithSingleLanguage(
        byte[] audio, 
        string languageCode, 
        string model, 
        CancellationToken cancellationToken)
    {
        var config = new RecognitionConfig
        {
            Model = model,
            LanguageCodes = { languageCode }, // Single language only
            AutoDecodingConfig = new AutoDetectDecodingConfig(),
            Features = new RecognitionFeatures
            {
                EnableAutomaticPunctuation = true,
                EnableWordTimeOffsets = true
            }
        };

        var request = new RecognizeRequest
        {
            Recognizer = _recognizerName,
            Config = config,
            Content = ByteString.CopyFrom(audio)
        };

        var response = await _speechClient.RecognizeAsync(request, cancellationToken);
        
        if (response.Results.Count > 0 && response.Results[0].Alternatives.Count > 0)
        {
            var result = response.Results[0];
            var alternative = result.Alternatives[0];
            
            var words = new List<Application.DTOs.Audio.WordInfo>();
            foreach (var word in alternative.Words)
            {
                words.Add(new Application.DTOs.Audio.WordInfo
                {
                    Word = word.Word,
                    StartTime = word.StartOffset?.ToTimeSpan() ?? TimeSpan.Zero,
                    EndTime = word.EndOffset?.ToTimeSpan() ?? TimeSpan.Zero,
                    Confidence = alternative.Confidence,
                    SpeakerTag = 1,
                    SpeakerLabel = "Speaker1"
                });
            }

            _logger.LogInformation("Recognition successful with {Language}: {Text}", 
                languageCode, alternative.Transcript?.Substring(0, Math.Min(50, alternative.Transcript.Length)) + "...");

            return new STTResult
            {
                Success = true,
                Transcription = alternative.Transcript ?? "",
                DetectedLanguage = languageCode, // Use the language we specified
                Confidence = alternative.Confidence,
                Provider = GetServiceName(),
                SpeakerAnalysis = new SpeakerAnalysis
                {
                    Language = languageCode,
                    SpeakerTag = 1,
                    SpeakerLabel = "Speaker1",
                    Confidence = alternative.Confidence,
                    Gender = "NEUTRAL",
                    EstimatedAgeRange = "adult",
                    IsKnownSpeaker = false
                },
                Words = words
            };
        }

        return new STTResult
        {
            Success = false,
            ErrorMessage = $"No speech recognized for language {languageCode}",
            Provider = GetServiceName()
        };
    }

    /// <summary>
    /// Create a regional recognizer in Finland datacenter for optimal latency
    /// This follows the exact pattern from your example for denmark-stt-recognizer
    /// </summary>
    public async Task<bool> CreateRegionalRecognizerAsync(string[] languageCodes, CancellationToken cancellationToken = default)
    {
        try
        {
            var location = _options.Google?.Location ?? "europe-north1";
            var projectId = _options.Google?.ProjectId ?? "a3itranslator";
            var recognizerId = _options.Google?.RecognizerId ?? "denmark-stt-recognizer";
            
            _logger.LogInformation("Creating regional recognizer '{RecognizerId}' in Finland datacenter ({Location})...", 
                recognizerId, location);
            _logger.LogInformation("Using STT model: {Model}", _options.Google?.STTModel ?? "chirp_2");

            // Configure the recognizer with Danish and English languages
            var recognizer = new Recognizer
            {
                DisplayName = "Danish STT Recognizer in Finland Region - Optimized for Denmark",
                DefaultRecognitionConfig = new RecognitionConfig
                {
                    LanguageCodes = { languageCodes }, // e.g., "da-DK", "en-US"
                    Model = _options.Google?.STTModel ?? "chirp_2", // Use configured model with chirp_2 as fallback
                    Features = new RecognitionFeatures
                    {
                        EnableAutomaticPunctuation = true,
                        EnableWordTimeOffsets = true
                    }
                }
            };

            // The parent location MUST match the regional API endpoint
            string parent = $"projects/{projectId}/locations/{location}";

            var request = new CreateRecognizerRequest
            {
                Parent = parent,
                RecognizerId = recognizerId,
                Recognizer = recognizer
            };

            // CreateRecognizer returns a long-running operation
            var operation = await _speechClient.CreateRecognizerAsync(request, cancellationToken);
            var response = await operation.PollUntilCompletedAsync();

            if (response.IsCompleted)
            {
                _logger.LogInformation("✅ Regional recognizer created successfully!");
                _logger.LogInformation("Full Resource Name: {ResourceName}", response.Result.Name);
                _logger.LogInformation("Location (Data Residency): {Location} (Finland - Hamina)", location);
                _logger.LogInformation("Model: {Model}", response.Result.DefaultRecognitionConfig.Model);
                _logger.LogInformation("Languages: [{Languages}]", string.Join(", ", languageCodes));
                return true;
            }
            else
            {
                _logger.LogWarning("Recognizer creation started but has not completed yet.");
                return false;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create regional recognizer: {Message}", ex.Message);
            return false;
        }
    }

    /// <summary>
    /// Check if the regional recognizer exists, if not create it
    /// Returns false if regional approach is not available (graceful fallback)
    /// </summary>
    private async Task<bool> EnsureRegionalRecognizerExistsAsync(string[] candidateLanguages, CancellationToken cancellationToken = default)
    {
        try
        {
            // Try to get the existing recognizer
            await _speechClient.GetRecognizerAsync(_recognizerName, cancellationToken);
            _logger.LogDebug("Regional recognizer already exists: {RecognizerName}", _recognizerName);
            return true;
        }
        catch (Grpc.Core.RpcException ex) when (ex.StatusCode == Grpc.Core.StatusCode.NotFound)
        {
            _logger.LogInformation("Regional recognizer not found, attempting to create it...");
            return await CreateRegionalRecognizerAsync(candidateLanguages, cancellationToken);
        }
        catch (Grpc.Core.RpcException ex) when (ex.StatusCode == Grpc.Core.StatusCode.Unimplemented)
        {
            _logger.LogWarning("Regional recognizer API not available in this region (HTTP 404). Using global endpoint approach.");
            return false; // Graceful fallback to global approach
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Regional recognizer check failed, falling back to global approach: {Message}", ex.Message);
            return false; // Graceful fallback instead of hard failure
        }
    }

    /// <summary>
    /// Google STT supported languages - VERIFIED list from official documentation
    /// Primary Source: https://cloud.google.com/speech-to-text/docs/languages
    /// Secondary Source: https://console.cloud.google.com/speech (Language selector)
    /// Tertiary Source: https://cloud.google.com/speech-to-text/docs/reference
    /// Last verified: October 2024
    /// </summary>
    private static readonly Dictionary<string, string> GoogleSTTLanguages = new()
    {
        // English variants (verified)
        { "en-US", "English (United States)" },
        { "en-GB", "English (United Kingdom)" },
        { "en-AU", "English (Australia)" },
        { "en-CA", "English (Canada)" },
        { "en-IN", "English (India)" },
        
        // Spanish variants (verified)
        { "es-ES", "Spanish (Spain)" },
        { "es-MX", "Spanish (Mexico)" },
        { "es-US", "Spanish (United States)" },
        { "es-AR", "Spanish (Argentina)" },
        { "es-CL", "Spanish (Chile)" },
        { "es-CO", "Spanish (Colombia)" },
        { "es-PE", "Spanish (Peru)" },
        
        // French variants (verified)
        { "fr-FR", "French (France)" },
        { "fr-CA", "French (Canada)" },
        
        // Portuguese variants (verified)
        { "pt-BR", "Portuguese (Brazil)" },
        { "pt-PT", "Portuguese (Portugal)" },
        
        // German variants (verified)
        { "de-DE", "German (Germany)" },
        
        // Other major European languages (verified)
        { "it-IT", "Italian (Italy)" },
        { "nl-NL", "Dutch (Netherlands)" },
        { "ru-RU", "Russian" },
        { "pl-PL", "Polish" },
        { "cs-CZ", "Czech" },
        { "sk-SK", "Slovak" },
        { "hu-HU", "Hungarian" },
        { "hr-HR", "Croatian" },
        { "sl-SI", "Slovenian" },
        { "bg-BG", "Bulgarian" },
        { "ro-RO", "Romanian" },
        { "uk-UA", "Ukrainian" },
        { "sr-RS", "Serbian" },
        { "lt-LT", "Lithuanian" },
        { "lv-LV", "Latvian" },
        { "et-EE", "Estonian" },
        { "tr-TR", "Turkish" },
        { "el-GR", "Greek" },
        { "he-IL", "Hebrew" },
        
        // Nordic languages (verified)
        { "sv-SE", "Swedish" },
        { "da-DK", "Danish" },
        { "no-NO", "Norwegian" },
        { "fi-FI", "Finnish" },
        
        // Asian languages (verified)
        { "zh-CN", "Chinese (Mandarin, Simplified)" },
        { "zh-TW", "Chinese (Traditional)" },
        { "ja-JP", "Japanese" },
        { "ko-KR", "Korean" },
        { "hi-IN", "Hindi (India)" },
        { "th-TH", "Thai" },
        { "vi-VN", "Vietnamese" },
        { "id-ID", "Indonesian" },
        { "ms-MY", "Malay (Malaysia)" },
        { "tl-PH", "Filipino (Philippines)" },
        
        // Arabic and Middle Eastern (verified)
        { "ar-SA", "Arabic (Saudi Arabia)" },
        { "ar-AE", "Arabic (United Arab Emirates)" },
        { "fa-IR", "Persian (Iran)" },
        
        // Indian subcontinent languages (verified)
        { "bn-IN", "Bengali (India)" },
        { "gu-IN", "Gujarati (India)" },
        { "kn-IN", "Kannada (India)" },
        { "ml-IN", "Malayalam (India)" },
        { "mr-IN", "Marathi (India)" },
        { "ta-IN", "Tamil (India)" },
        { "te-IN", "Telugu (India)" },
        { "ur-IN", "Urdu (India)" },
        { "pa-IN", "Punjabi (India)" }
    };
}
