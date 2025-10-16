namespace A3ITranslator.Domain.Enums;

/// <summary>
/// Supported user tiers for service differentiation
/// </summary>
public enum UserTier
{
    Standard = 0,
    Premium = 1
}

/// <summary>
/// Gender identification for voice selection
/// </summary>
public enum Gender
{
    Unknown = 0,
    Male = 1,
    Female = 2
}

/// <summary>
/// Session state for lifecycle management
/// </summary>
public enum SessionState
{
    Active = 0,
    Inactive = 1,
    Expired = 2,
    Terminated = 3
}

/// <summary>
/// Message types for conversation tracking
/// </summary>
public enum MessageType
{
    Transcription = 0,
    Translation = 1,
    AIResponse = 2,
    AIResponseTranslated = 3
}

/// <summary>
/// Content types for TTS processing
/// </summary>
public enum ContentType
{
    Translation = 0,
    AIResponse = 1,
    Error = 2
}

/// <summary>
/// STT provider types for multi-provider support
/// </summary>
public enum STTProvider
{
    Azure = 0,
    OpenAI = 1,
    Google = 2
}

/// <summary>
/// TTS provider types for multi-provider support
/// </summary>
public enum TTSProvider
{
    Azure = 0,
    Google = 1
}

/// <summary>
/// AI provider types for multi-provider support
/// </summary>
public enum AIProvider
{
    Gemini = 0,
    Claude = 1,
    OpenAI = 2,
    AzureOpenAI = 3
}

/// <summary>
/// Voice quality levels for TTS selection
/// </summary>
public enum VoiceQuality
{
    Standard = 0,
    Premium = 1,
    Neural = 2
}
