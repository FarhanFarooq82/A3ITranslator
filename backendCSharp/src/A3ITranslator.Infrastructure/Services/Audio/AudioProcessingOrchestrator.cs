using A3ITranslator.Application.DTOs.Audio;
using A3ITranslator.Application.Services;
using Microsoft.Extensions.Logging;

namespace A3ITranslator.Infrastructure.Services.Audio;

/// <summary>
/// Orchestrates audio processing with fallback chains and error handling
/// </summary>
public class AudioProcessingOrchestrator : IAudioProcessingOrchestrator
{
    private readonly ILogger<AudioProcessingOrchestrator> _logger;
    private readonly ISTTProviderSelector _providerSelector;
    private readonly IEnumerable<ISTTService> _sttServices;
    private readonly STTQualityThresholds _qualityThresholds;

    public AudioProcessingOrchestrator(
        ILogger<AudioProcessingOrchestrator> logger,
        ISTTProviderSelector providerSelector,
        IEnumerable<ISTTService> sttServices)
    {
        _logger = logger;
        _providerSelector = providerSelector;
        _sttServices = sttServices;
        _qualityThresholds = new STTQualityThresholds
        {
            MinimumConfidence = 0.6f,
            PreferredConfidence = 0.8f,
            MaxRetryAttempts = 3
        };
    }

    // public async Task<STTResult> ProcessAudioAsync(
    //     byte[] audio,
    //     string mainLanguage,
    //     string targetLanguage,
    //     CancellationToken cancellationToken = default)
    // {
    //     _logger.LogDebug("Processing audio for language pair {MainLanguage} -> {TargetLanguage} (legacy method)", mainLanguage, targetLanguage);

    //     var orderedProviders = _providerSelector.GetOrderedProviders(mainLanguage, targetLanguage);
        
    //     if (!orderedProviders.Any())
    //     {
    //         _logger.LogError("No STT providers available for language pair {MainLanguage} -> {TargetLanguage}", mainLanguage, targetLanguage);
    //         return new STTResult
    //         {
    //             Success = false,
    //             ErrorMessage = $"No STT providers support the language pair {mainLanguage} -> {targetLanguage}",
    //             ProcessingTimeMs = 0
    //         };
    //     }

    //     var startTime = DateTime.UtcNow;
    //     STTResult? lastResult = null;
    //     var attemptCount = 0;

    //     foreach (var provider in orderedProviders)
    //     {
    //         if (cancellationToken.IsCancellationRequested)
    //         {
    //             _logger.LogWarning("Audio processing cancelled");
    //             break;
    //         }

    //         attemptCount++;
    //         _logger.LogDebug("Attempting STT with provider {Provider} (attempt {Attempt})", provider.GetServiceName(), attemptCount);

    //         try
    //         {
    //             var candidateLanguages = new[] { mainLanguage };
    //             var result = await provider.TranscribeWithDetectionAsync(audio, candidateLanguages, cancellationToken);
                
    //             if (result.Success && IsQualityAcceptable(result))
    //             {
    //                 var processingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
    //                 result.ProcessingTimeMs = processingTime;
    //                 result.Provider = provider.GetServiceName();
                    
    //                 _logger.LogInformation("STT successful with provider {Provider} in {ProcessingTime}ms, confidence: {Confidence}", 
    //                     provider.GetServiceName(), processingTime, result.Confidence);
                    
    //                 return result;
    //             }
    //             else
    //             {
    //                 _logger.LogWarning("STT provider {Provider} returned low quality result or failed. Success: {Success}, Confidence: {Confidence}", 
    //                     provider.GetServiceName(), result.Success, result.Confidence);
    //                 lastResult = result;
    //             }
    //         }
    //         catch (Exception ex)
    //         {
    //             _logger.LogError(ex, "STT provider {Provider} failed with exception", provider.GetServiceName());
    //             lastResult = new STTResult
    //             {
    //                 Success = false,
    //                 ErrorMessage = $"Provider {provider.GetServiceName()} failed: {ex.Message}",
    //                 Provider = provider.GetServiceName()
    //             };
    //         }

    //         // Stop retrying if we've exceeded max attempts
    //         if (attemptCount >= _qualityThresholds.MaxRetryAttempts)
    //         {
    //             _logger.LogWarning("Max retry attempts ({MaxAttempts}) reached", _qualityThresholds.MaxRetryAttempts);
    //             break;
    //         }
    //     }

    //     var totalProcessingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
        
    //     // Return the last result or a failure result
    //     if (lastResult != null)
    //     {
    //         lastResult.ProcessingTimeMs = totalProcessingTime;
    //         return lastResult;
    //     }

    //     return new STTResult
    //     {
    //         Success = false,
    //         ErrorMessage = "All STT providers failed or were cancelled",
    //         ProcessingTimeMs = totalProcessingTime
    //     };
    // }

    // public async Task<STTResult> ProcessAudioWithProviderAsync(
    //     byte[] audio,
    //     string providerId,
    //     string[] candidateLanguages,
    //     CancellationToken cancellationToken = default)
    // {
    //     _logger.LogDebug("Processing audio with specific provider {Provider}", providerId);

    //     var provider = _sttServices.FirstOrDefault(s => s.GetServiceName() == providerId);
    //     if (provider == null)
    //     {
    //         _logger.LogError("STT provider {Provider} not found", providerId);
    //         return new STTResult
    //         {
    //             Success = false,
    //             ErrorMessage = $"STT provider '{providerId}' not found",
    //             Provider = providerId
    //         };
    //     }

    //     var startTime = DateTime.UtcNow;

    //     try
    //     {
    //         var result = await provider.TranscribeWithDetectionAsync(audio, candidateLanguages, cancellationToken);
    //         var processingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
            
    //         result.ProcessingTimeMs = processingTime;
    //         result.Provider = providerId;

    //         _logger.LogInformation("STT completed with provider {Provider} in {ProcessingTime}ms, success: {Success}", 
    //             providerId, processingTime, result.Success);

    //         return result;
    //     }
    //     catch (Exception ex)
    //     {
    //         var processingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
    //         _logger.LogError(ex, "STT provider {Provider} failed", providerId);
            
    //         return new STTResult
    //         {
    //             Success = false,
    //             ErrorMessage = $"Provider {providerId} failed: {ex.Message}",
    //             Provider = providerId,
    //             ProcessingTimeMs = processingTime
    //         };
    //     }
    // }

    private bool IsQualityAcceptable(STTResult result)
    {
        if (!result.Success)
            return false;

        // Check confidence threshold
        if (result.Confidence < _qualityThresholds.MinimumConfidence)
        {
            _logger.LogDebug("Result rejected due to low confidence: {Confidence} < {MinConfidence}",
                result.Confidence, _qualityThresholds.MinimumConfidence);
            return false;
        }

        // Check if transcription is meaningful (not empty or too short)
        if (string.IsNullOrWhiteSpace(result.Transcription) || result.Transcription.Length < 2)
        {
            _logger.LogDebug("Result rejected due to empty or too short transcription");
            return false;
        }

        return true;
    }
    
    public async Task<STTResult> ProcessAudioWithSessionProvidersAsync(
        byte[] audio,
        List<string> assignedSTTProviders,
        string mainLanguage,
        string targetLanguage,
        CancellationToken cancellationToken = default)
    {
        _logger.LogDebug("Processing audio with session-assigned providers: [{Providers}]", 
            string.Join(", ", assignedSTTProviders));

        if (!assignedSTTProviders.Any())
        {
            _logger.LogError("No STT providers assigned to this session");
            return new STTResult
            {
                Success = false,
                ErrorMessage = "No STT providers assigned to this session",
                ProcessingTimeMs = 0
            };
        }

        var startTime = DateTime.UtcNow;
        STTResult? lastResult = null;
        var attemptCount = 0;

        foreach (var providerName in assignedSTTProviders)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning("Audio processing cancelled");
                break;
            }

            var provider = _sttServices.FirstOrDefault(s => s.GetServiceName() == providerName);
            if (provider == null)
            {
                _logger.LogWarning("Assigned STT provider {Provider} not found, skipping", providerName);
                continue;
            }

            attemptCount++;
            _logger.LogDebug("Attempting STT with assigned provider {Provider} (attempt {Attempt})", providerName, attemptCount);

            try
            {
                var candidateLanguages = new[] { mainLanguage };
                var result = await provider.TranscribeWithDetectionAsync(audio, candidateLanguages, cancellationToken);
                
                if (result.Success && IsQualityAcceptable(result))
                {
                    var processingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
                    result.ProcessingTimeMs = processingTime;
                    result.Provider = providerName;
                    result.IsFallbackResult = attemptCount > 1;
                    
                    _logger.LogInformation("STT successful with session provider {Provider} in {ProcessingTime}ms, confidence: {Confidence}", 
                        providerName, processingTime, result.Confidence);
                    
                    return result;
                }
                else
                {
                    lastResult = result;
                    _logger.LogWarning("STT failed with provider {Provider}: {Error}", providerName, result.ErrorMessage);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exception with STT provider {Provider}", providerName);
                lastResult = new STTResult
                {
                    Success = false,
                    ErrorMessage = $"Provider {providerName} failed: {ex.Message}",
                    Provider = providerName
                };
            }

            if (attemptCount >= _qualityThresholds.MaxRetryAttempts)
            {
                _logger.LogWarning("Maximum retry attempts ({MaxAttempts}) reached", _qualityThresholds.MaxRetryAttempts);
                break;
            }
        }

        var totalProcessingTime = (DateTime.UtcNow - startTime).TotalMilliseconds;
        _logger.LogError("All assigned STT providers failed for session");
        
        return lastResult ?? new STTResult
        {
            Success = false,
            ErrorMessage = "All assigned STT providers failed",
            ProcessingTimeMs = totalProcessingTime
        };
    }
}
