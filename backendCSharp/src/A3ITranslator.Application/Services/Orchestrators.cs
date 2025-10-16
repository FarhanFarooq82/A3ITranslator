using A3ITranslator.Application.Common;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.UseCases;
using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Application.Services;

/// <summary>
/// Simple STT orchestrator with provider selection and fallback
/// </summary>
public class STTOrchestrator : ISTTOrchestrator
{
    private readonly IEnumerable<ISTTService> _sttServices;
    private readonly ISpeakerIdentificationService _speakerService;

    public STTOrchestrator(
        IEnumerable<ISTTService> sttServices,
        ISpeakerIdentificationService speakerService)
    {
        _sttServices = sttServices;
        _speakerService = speakerService;
    }

    public async Task<Result<STTResponseDto>> ProcessAsync(STTRequestDto request)
    {
        // Simple provider selection: Azure -> OpenAI -> Google
        var providerOrder = new[] { STTProvider.Azure, STTProvider.OpenAI, STTProvider.Google };

        foreach (var providerType in providerOrder)
        {
            var provider = _sttServices.FirstOrDefault(p => p.ProviderType == providerType);
            if (provider == null) continue;

            // Check if provider is healthy
            if (!await provider.IsHealthyAsync()) continue;

            // Try transcription
            var result = await provider.TranscribeAsync(request);
            if (result.IsSuccess && result.Value != null)
            {
                // Add speaker identification if needed
                if (result.Value.Speaker == null && request.AudioData.Length > 0)
                {
                    var speakerResult = await _speakerService.IdentifyOrCreateSpeakerAsync(
                        request.SessionId, request.AudioData, $"{providerType}_STT");

                    if (speakerResult.IsSuccess)
                    {
                        result.Value.Speaker = speakerResult.Value;
                    }
                }

                return result;
            }
        }

        return Result<STTResponseDto>.Failure("All STT providers failed or are unavailable");
    }
}

/// <summary>
/// Simple Translation orchestrator with provider selection and fallback
/// </summary>
public class TranslationOrchestrator : ITranslationOrchestrator
{
    private readonly IEnumerable<ITranslationService> _translationServices;

    public TranslationOrchestrator(IEnumerable<ITranslationService> translationServices)
    {
        _translationServices = translationServices;
    }

    public async Task<Result<TranslationResponseDto>> ProcessAsync(TranslationRequestDto request)
    {
        // Simple provider selection: Gemini -> Claude -> OpenAI -> Azure OpenAI
        var providerOrder = new[] { AIProvider.Gemini, AIProvider.Claude, AIProvider.OpenAI, AIProvider.AzureOpenAI };

        foreach (var providerType in providerOrder)
        {
            var provider = _translationServices.FirstOrDefault(p => p.ProviderType == providerType);
            if (provider == null) continue;

            // Check if provider is healthy
            if (!await provider.IsHealthyAsync()) continue;

            // Try translation
            var result = await provider.TranslateAsync(request);
            if (result.IsSuccess)
            {
                return result;
            }
        }

        return Result<TranslationResponseDto>.Failure("All translation providers failed or are unavailable");
    }
}

/// <summary>
/// Simple TTS orchestrator with provider selection and fallback
/// </summary>
public class TTSOrchestrator : ITTSOrchestrator
{
    private readonly IEnumerable<ITTSService> _ttsServices;

    public TTSOrchestrator(IEnumerable<ITTSService> ttsServices)
    {
        _ttsServices = ttsServices;
    }

    public async Task<Result<TTSResponseDto>> ProcessAsync(TTSRequestDto request)
    {
        // Provider selection based on user tier
        var providerOrder = request.UserTier == UserTier.Premium 
            ? new[] { TTSProvider.Azure, TTSProvider.Google }  // Premium: Azure Neural first
            : new[] { TTSProvider.Google, TTSProvider.Azure }; // Standard: Google Standard first

        foreach (var providerType in providerOrder)
        {
            var provider = _ttsServices.FirstOrDefault(p => p.ProviderType == providerType);
            if (provider == null) continue;

            // Check if provider is healthy
            if (!await provider.IsHealthyAsync()) continue;

            // Try speech generation
            var result = await provider.GenerateSpeechAsync(request);
            if (result.IsSuccess)
            {
                return result;
            }
        }

        return Result<TTSResponseDto>.Failure("All TTS providers failed or are unavailable");
    }
}
