using A3ITranslator.Application.Services;
using A3ITranslator.Application.DTOs.Translation;
using System.Text.Json;

namespace A3ITranslator.Infrastructure.Services.Translation;

/// <summary>
/// Service for building optimized system and user prompts for translation with AI assistance
/// </summary>
public class TranslationPromptService : ITranslationPromptService
{
    public (string systemPrompt, string userPrompt) BuildTranslationPrompts(EnhancedTranslationRequest request)
    {
        var systemPrompt = BuildSystemPrompt();
        var userPrompt = BuildUserPrompt(request);
        
        return (systemPrompt, userPrompt);
    }

    private string BuildSystemPrompt()
    {
        return """
        Task: Translate text and optionally provide AI assistance based on intent detection.

        CRITICAL SCRIPT RULES:
        - ABSOLUTELY NEVER use romanized text for native script languages
        - Urdu: MUST use Arabic/Nastaliq script (اردو), NEVER Latin characters
        - Hindi: MUST use Devanagari script (हिन्दी), NEVER Latin characters
        - Arabic: MUST use Arabic script (العربية), NEVER Latin characters
        - Bengali: MUST use Bengali script (বাংলা), NEVER Latin characters
        - Persian: MUST use Persian script (فارسی), NEVER Latin characters

        PROCESSING STEPS:

        STEP 1 - TRANSLATION (ALWAYS REQUIRED):
        1. Use session facts to resolve pronouns (he/she/it → specific person names from facts)
        2. Apply cultural context from relationship facts (mama/papa vs mom/dad)
        3. Reference previous conversation topics for ambiguous terms
        4. Translate to target language using native scripts
        5. Keep translation natural and conversational
        6. Create SSML enhanced version for natural TTS (no <speak> wrapper)

        STEP 2 - AI ASSISTANCE (ONLY IF TRIGGER DETECTED):
        IF trigger_detected = true:
        1. INTENT CONFIRMATION: Is the speaker genuinely addressing the translator system?
           - Analyze full context, not just trigger phrase
           - Check for false positives (reporting speech, discussions, negations)
           - Consider speaker intent and conversation flow

        2. IF CONFIRMED as genuine AI assistance request:
           - Generate helpful response using session facts and speaker information
           - Address speaker by name from speaker info
           - Use session knowledge for accurate, contextual answers
           - Create response in source language
           - Translate AI response to target language
           - Create SSML enhanced version of AI response (source language)

        3. IF NOT CONFIRMED (false positive):
           - Skip AI assistance processing
           - Treat as simple translation

        STEP 3 - SSML ENHANCEMENT RULES:
        - IF AI response confirmed: Enhance AI response in source language
        - IF no AI response: Enhance translation in target language
        - Add appropriate pauses, emphasis, and natural speech markers

        OUTPUT FORMAT (JSON):
        {
          "translation": "translated text in target language native script",
          "translation_with_gestures": "SSML enhanced version",
          "ai_assistance_confirmed": true/false,
          "ai_response": "AI answer in source language (if confirmed, else null)",
          "ai_response_translated": "AI answer in target language (if confirmed, else null)",
          "confidence": 0.0-1.0
        }
        """;
    }

    private string BuildUserPrompt(EnhancedTranslationRequest request)
    {
        var sessionFacts = ExtractSessionFacts(request.SessionContext);
        var speakerName = request.SpeakerInfo?.SpeakerName ?? "unknown";
        var sessionContextJson = request.SessionContext != null ? 
            JsonSerializer.Serialize(request.SessionContext, new JsonSerializerOptions { WriteIndented = false }) : 
            "{}";

        return $"""
        INPUTS:
        - Text: "{request.Text}"
        - Source Language: {request.SourceLanguage}
        - Target Language: {request.TargetLanguage}
        - Trigger Detected: {request.TriggerDetected}
        - Speaker: {speakerName}
        - Session Facts: {sessionFacts}
        - Session Context: {sessionContextJson}

        SPEAKER INFORMATION:
        {BuildSpeakerInfo(request.SpeakerInfo)}

        Process the above inputs according to the system instructions and return the JSON response.
        """;
    }

    private string ExtractSessionFacts(Dictionary<string, object>? sessionContext)
    {
        if (sessionContext == null || !sessionContext.Any())
            return "No previous context available";

        var facts = new List<string>();
        
        // Extract relevant facts from session context
        if (sessionContext.ContainsKey("speaker_info"))
            facts.Add($"Speaker: {sessionContext["speaker_info"]}");
            
        if (sessionContext.ContainsKey("conversation_topics"))
            facts.Add($"Topics: {sessionContext["conversation_topics"]}");
            
        if (sessionContext.ContainsKey("relationships"))
            facts.Add($"Relationships: {sessionContext["relationships"]}");

        if (sessionContext.ContainsKey("personal_facts"))
            facts.Add($"Personal Facts: {sessionContext["personal_facts"]}");

        if (sessionContext.ContainsKey("preferences"))
            facts.Add($"Preferences: {sessionContext["preferences"]}");

        if (sessionContext.ContainsKey("locations"))
            facts.Add($"Locations: {sessionContext["locations"]}");

        if (sessionContext.ContainsKey("events"))
            facts.Add($"Events: {sessionContext["events"]}");

        return facts.Any() ? string.Join(", ", facts) : "No previous context available";
    }

    private string BuildSpeakerInfo(A3ITranslator.Application.DTOs.Speaker.SpeakerInfo? speakerInfo)
    {
        if (speakerInfo == null)
            return "Speaker information not available";

        return $"""
        - Speaker ID: {speakerInfo.SpeakerId}
        - Speaker Name: {speakerInfo.SpeakerName ?? "Unknown"}
        - Display Name: {speakerInfo.DisplayName}
        - Speaker Number: {speakerInfo.SpeakerNumber}
        - Identification Confidence: {speakerInfo.IdentificationConfidence:F2}
        - Is Known Speaker: {speakerInfo.IsKnownSpeaker}
        - Source: {speakerInfo.Source}
        - Gender: {speakerInfo.Gender}
        """;
    }
}
