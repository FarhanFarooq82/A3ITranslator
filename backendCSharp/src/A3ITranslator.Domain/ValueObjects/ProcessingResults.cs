using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Domain.ValueObjects;

/// <summary>
/// Audio processing result value object
/// </summary>
public class AudioProcessingResult
{
    public byte[] AudioData { get; }
    public string MimeType { get; }
    public TimeSpan ProcessingTime { get; }
    public string Provider { get; }
    public bool WasCached { get; }
    public string? VoiceUsed { get; }
    public VoiceQuality Quality { get; }

    public AudioProcessingResult(
        byte[] audioData,
        string mimeType,
        TimeSpan processingTime,
        string provider,
        bool wasCached = false,
        string? voiceUsed = null,
        VoiceQuality quality = VoiceQuality.Standard)
    {
        AudioData = audioData ?? throw new ArgumentNullException(nameof(audioData));
        MimeType = mimeType ?? throw new ArgumentNullException(nameof(mimeType));
        ProcessingTime = processingTime;
        Provider = provider ?? throw new ArgumentNullException(nameof(provider));
        WasCached = wasCached;
        VoiceUsed = voiceUsed;
        Quality = quality;
    }

    public string ToBase64() => Convert.ToBase64String(AudioData);
}
