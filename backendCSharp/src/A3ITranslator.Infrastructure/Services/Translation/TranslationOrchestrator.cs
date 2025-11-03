using Microsoft.Extensions.Logging;
using A3ITranslator.Application.Services;
using A3ITranslator.Application.DTOs.Translation;
using System.Text.Json;

namespace A3ITranslator.Infrastructure.Services.Translation;

/// <summary>
/// Translation orchestrator - coordinates prompt building and GenAI processing with fallback strategy
/// </summary>
public class TranslationOrchestrator : ITranslationOrchestrator
{
    private readonly ITranslationPromptService _promptService;
    private readonly IEnumerable<IGenAIService> _genAIServices;
    private readonly ILogger<TranslationOrchestrator> _logger;

    public TranslationOrchestrator(
        ITranslationPromptService promptService,
        IEnumerable<IGenAIService> genAIServices,
        ILogger<TranslationOrchestrator> logger)
    {
        _promptService = promptService;
        _genAIServices = genAIServices;
        _logger = logger;
    }

    public async Task<TranslationResponse> ProcessTranslationAsync(EnhancedTranslationRequest request)
    {
        var startTime = DateTime.UtcNow;
        
        try
        {
            _logger.LogInformation("Processing translation for session {SessionId}", request.SessionId);
            
            // Step 1: Build prompts using prompt service
            var (systemPrompt, userPrompt) = _promptService.BuildTranslationPrompts(request);
            
            // Step 2: Try each GenAI service until one succeeds (fallback strategy)
            string? genAIResponse = null;
            string serviceUsed = "None";
            Exception? lastException = null;
            
            foreach (var genAIService in _genAIServices)
            {
                try
                {
                    _logger.LogDebug("Attempting translation with service: {ServiceName}", genAIService.GetServiceName());
                    
                    // Check if service is healthy
                    var isHealthy = await genAIService.CheckHealthAsync();
                    if (!isHealthy)
                    {
                        _logger.LogWarning("Service {ServiceName} is not healthy, skipping", genAIService.GetServiceName());
                        continue;
                    }
                    
                    genAIResponse = await genAIService.GenerateResponseAsync(systemPrompt, userPrompt);
                    serviceUsed = genAIService.GetServiceName();
                    _logger.LogInformation("Translation successful with service: {ServiceName}", serviceUsed);
                    break;
                }
                catch (Exception ex)
                {
                    lastException = ex;
                    _logger.LogWarning(ex, "Service {ServiceName} failed, trying next service", genAIService.GetServiceName());
                    continue;
                }
            }
            
            if (genAIResponse == null)
            {
                throw new InvalidOperationException($"All GenAI services failed. Last error: {lastException?.Message}");
            }
            
            // Step 3: Parse JSON response and build structured response
            var response = ParseGenAIResponse(genAIResponse, serviceUsed, startTime);
            
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing translation");
            return new TranslationResponse
            {
                Success = false,
                Translation = request.Text, // Fallback to original text
                TranslationWithGestures = request.Text,
                ErrorMessage = ex.Message,
                ProcessingTimeMs = (DateTime.UtcNow - startTime).TotalMilliseconds,
                Intent = "ERROR"
            };
        }
    }

    private TranslationResponse ParseGenAIResponse(string genAIResponse, string serviceUsed, DateTime startTime)
    {
        try
        {
            _logger.LogDebug("Parsing GenAI response from {ServiceName}", serviceUsed);
            
            // Try to parse JSON response
            var jsonResponse = JsonSerializer.Deserialize<JsonElement>(genAIResponse);
            
            var response = new TranslationResponse
            {
                Success = true,
                Translation = GetJsonProperty(jsonResponse, "translation", genAIResponse),
                TranslationWithGestures = GetJsonProperty(jsonResponse, "translation_with_gestures", genAIResponse),
                AIAssistanceConfirmed = GetJsonBoolProperty(jsonResponse, "ai_assistance_confirmed", false),
                AIResponse = GetJsonProperty(jsonResponse, "ai_response", null),
                AIResponseTranslated = GetJsonProperty(jsonResponse, "ai_response_translated", null),
                Confidence = GetJsonFloatProperty(jsonResponse, "confidence", 0.95f),
                ProviderUsed = serviceUsed,
                Reasoning = GetJsonProperty(jsonResponse, "reasoning", null),
                SpeakerAcknowledged = GetJsonProperty(jsonResponse, "speaker_acknowledged", null),
                ProcessingTimeMs = (DateTime.UtcNow - startTime).TotalMilliseconds,
                Intent = GetJsonBoolProperty(jsonResponse, "ai_assistance_confirmed", false) ? "AI_ASSISTANCE" : "SIMPLE_TRANSLATION"
            };

            return response;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse JSON response from {ServiceName}, treating as plain text", serviceUsed);
            
            // Fallback: treat as plain text response
            return new TranslationResponse
            {
                Success = true,
                Translation = genAIResponse,
                TranslationWithGestures = genAIResponse,
                AIAssistanceConfirmed = false,
                Confidence = 0.8f, // Lower confidence for non-structured response
                ProviderUsed = serviceUsed,
                ProcessingTimeMs = (DateTime.UtcNow - startTime).TotalMilliseconds,
                Intent = "SIMPLE_TRANSLATION",
                Reasoning = "Plain text response, no structured data available"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error parsing GenAI response from {ServiceName}", serviceUsed);
            throw;
        }
    }

    private string GetJsonProperty(JsonElement jsonElement, string propertyName, string? defaultValue)
    {
        try
        {
            if (jsonElement.TryGetProperty(propertyName, out var property))
            {
                return property.GetString() ?? defaultValue ?? "";
            }
            return defaultValue ?? "";
        }
        catch
        {
            return defaultValue ?? "";
        }
    }

    private bool GetJsonBoolProperty(JsonElement jsonElement, string propertyName, bool defaultValue)
    {
        try
        {
            if (jsonElement.TryGetProperty(propertyName, out var property))
            {
                return property.GetBoolean();
            }
            return defaultValue;
        }
        catch
        {
            return defaultValue;
        }
    }

    private float GetJsonFloatProperty(JsonElement jsonElement, string propertyName, float defaultValue)
    {
        try
        {
            if (jsonElement.TryGetProperty(propertyName, out var property))
            {
                if (property.ValueKind == JsonValueKind.Number)
                {
                    return property.GetSingle();
                }
            }
            return defaultValue;
        }
        catch
        {
            return defaultValue;
        }
    }
}
