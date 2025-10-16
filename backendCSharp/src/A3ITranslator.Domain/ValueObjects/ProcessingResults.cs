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

/// <summary>
/// Translation result value object
/// </summary>
public class TranslationResult
{
    public string Text { get; }
    public LanguageInfo SourceLanguage { get; }
    public LanguageInfo TargetLanguage { get; }
    public float Confidence { get; }
    public string Provider { get; }
    public TimeSpan ProcessingTime { get; }
    public string? Tone { get; }
    public string? TextWithGestures { get; }

    public TranslationResult(
        string text,
        LanguageInfo sourceLanguage,
        LanguageInfo targetLanguage,
        float confidence,
        string provider,
        TimeSpan processingTime,
        string? tone = null,
        string? textWithGestures = null)
    {
        if (string.IsNullOrWhiteSpace(text))
            throw new ArgumentException("Translation text cannot be null or empty", nameof(text));
        
        if (confidence < 0 || confidence > 1)
            throw new ArgumentException("Confidence must be between 0 and 1", nameof(confidence));

        Text = text;
        SourceLanguage = sourceLanguage ?? throw new ArgumentNullException(nameof(sourceLanguage));
        TargetLanguage = targetLanguage ?? throw new ArgumentNullException(nameof(targetLanguage));
        Confidence = confidence;
        Provider = provider ?? throw new ArgumentNullException(nameof(provider));
        ProcessingTime = processingTime;
        Tone = tone;
        TextWithGestures = textWithGestures;
    }
}
