using A3ITranslator.Application.DTOs.Audio;

namespace A3ITranslator.Application.Services;

/// <summary>
/// Interface for STT provider selection with fallback support
/// </summary>
public interface ISTTProviderSelector
{
    // STTProviderInfo SelectBestProvider(string mainLanguage, string targetLanguage);
    List<ISTTService> GetOrderedProviders(string mainLanguage, string targetLanguage);
    bool SupportsLanguagePair(string providerName, string mainLanguage, string targetLanguage);
    
    // Session-based provider assignment methods
    List<string> GetAssignedSTTProvidersForSession(string mainLanguage, string targetLanguage);
    string GetPreferredSTTProviderForSession(string mainLanguage, string targetLanguage);
    List<string> GetAssignedTTSProvidersForSession(string mainLanguage, string targetLanguage);
    string GetPreferredTTSProviderForSession(string mainLanguage, string targetLanguage);
}

/// <summary>
/// Main orchestrator for audio processing with fallback chains
/// </summary>
public interface IAudioProcessingOrchestrator
{
    // Task<STTResult> ProcessAudioAsync(
    //     byte[] audio,
    //     string mainLanguage,
    //     string targetLanguage,
    //     CancellationToken cancellationToken = default
    // );
    
    // Task<STTResult> ProcessAudioWithProviderAsync(
    //     byte[] audio,
    //     string providerId,
    //     string[] candidateLanguages,
    //     CancellationToken cancellationToken = default
    // );
    
    Task<STTResult> ProcessAudioWithSessionProvidersAsync(
        byte[] audio,
        List<string> assignedSTTProviders,
        string mainLanguage,
        string targetLanguage,
        CancellationToken cancellationToken = default
    );
}

/// <summary>
/// Interface for audio processing orchestration
/// </summary>
public interface IAudioProcessingService
{
    Task<STTResult> ProcessAudioAsync(
        byte[] audioData,
        string mainLanguage,
        string targetLanguage,
        string audioFormat,
        CancellationToken cancellationToken = default
    );
    
    Task<AudioProcessResponse> ProcessAudioWithSessionAsync(
        AudioProcessRequest request,
        CancellationToken cancellationToken = default
    );
}
