using A3ITranslator.Application.DTOs.Session;
using A3ITranslator.Application.DTOs.Speaker;
using A3ITranslator.Domain.Entities;
using A3ITranslator.Domain.ValueObjects;

namespace A3ITranslator.Application.Common;

/// <summary>
/// Simple mapping utilities for converting between domain entities and DTOs
/// </summary>
public static class MappingExtensions
{
    /// <summary>
    /// Convert Session entity to SessionDto
    /// </summary>
    public static SessionDto ToDto(this Session session)
    {
        return new SessionDto
        {
            Id = session.Id,
            UserId = session.UserId,
            MainLanguage = session.MainLanguage.Code,
            OtherLanguage = session.OtherLanguage.Code,
            RequestType = session.UserTier,
            State = session.State,
            CreatedAt = session.CreatedAt,
            LastActivity = session.LastActivity,
            MessageCount = session.MessageCount,
            FactsCount = session.FactsCount
        };
    }

    /// <summary>
    /// Convert SpeakerInfo value object to SpeakerDto
    /// </summary>
    public static DTOs.Speaker.SpeakerDto ToDto(this Domain.ValueObjects.SpeakerInfo speakerInfo)
    {
        return new DTOs.Speaker.SpeakerDto
        {
            SpeakerId = speakerInfo.SpeakerId,
            SpeakerName = speakerInfo.SpeakerName,
            DisplayName = speakerInfo.DisplayName,
            SpeakerNumber = speakerInfo.SpeakerNumber,
            IdentificationConfidence = speakerInfo.IdentificationConfidence,
            IsKnownSpeaker = speakerInfo.IsKnownSpeaker,
            Source = speakerInfo.Source,
            Gender = speakerInfo.Gender
        };
    }

    /// <summary>
    /// Convert SpeakerDto to SpeakerInfo value object
    /// </summary>
    public static Domain.ValueObjects.SpeakerInfo ToValueObject(this DTOs.Speaker.SpeakerDto dto)
    {
        return new Domain.ValueObjects.SpeakerInfo(
            dto.SpeakerId,
            dto.SpeakerName,
            dto.DisplayName,
            dto.SpeakerNumber,
            dto.IdentificationConfidence,
            dto.IsKnownSpeaker,
            dto.Source,
            dto.Gender);
    }

    /// <summary>
    /// Convert SpeakerProfile entity to SpeakerDto
    /// </summary>
    public static DTOs.Speaker.SpeakerDto ToDto(this SpeakerProfile profile)
    {
        return new DTOs.Speaker.SpeakerDto
        {
            SpeakerId = profile.ExternalSpeakerId,
            SpeakerName = profile.Name,
            DisplayName = profile.GetDisplayName(),
            SpeakerNumber = profile.SpeakerNumber,
            IdentificationConfidence = profile.IdentificationConfidence,
            IsKnownSpeaker = !string.IsNullOrEmpty(profile.Name),
            Source = profile.Source,
            Gender = profile.Gender
        };
    }

    /// <summary>
    /// Convert ConversationMessage entity to AddMessageDto
    /// </summary>
    public static AddMessageDto ToDto(this ConversationMessage message)
    {
        return new AddMessageDto
        {
            Speaker = message.Speaker,
            Text = message.Text,
            Language = message.Language.Code,
            MessageType = message.MessageType,
            SpeakerInfo = message.SpeakerInfo?.ToDto()
        };
    }

    /// <summary>
    /// Convert CreateSessionDto to Session entity
    /// </summary>
    public static Session ToEntity(this CreateSessionDto dto)
    {
        var mainLanguage = GetLanguageInfo(dto.MainLanguage);
        var otherLanguage = GetLanguageInfo(dto.OtherLanguage);

        return new Session(
            dto.UserId,
            mainLanguage,
            otherLanguage,
            dto.UserTier,
            dto.SessionTimeout);
    }

    /// <summary>
    /// Convert AddMessageDto to ConversationMessage entity
    /// </summary>
    public static ConversationMessage ToEntity(this AddMessageDto dto, string sessionId)
    {
        var language = GetLanguageInfo(dto.Language);
        var speakerInfo = dto.SpeakerInfo?.ToValueObject();

        return new ConversationMessage(
            sessionId,
            dto.Speaker,
            dto.Text,
            language,
            dto.MessageType,
            speakerInfo);
    }

    /// <summary>
    /// Simple language info helper
    /// </summary>
    private static LanguageInfo GetLanguageInfo(string languageCode)
    {
        return languageCode.ToLowerInvariant() switch
        {
            "en-us" or "en" => LanguageInfo.English,
            "ar-sa" or "ar" => LanguageInfo.Arabic,
            "ur-pk" or "ur" => LanguageInfo.Urdu,
            "hi-in" or "hi" => LanguageInfo.Hindi,
            "es-es" or "es" => LanguageInfo.Spanish,
            "fr-fr" or "fr" => LanguageInfo.French,
            _ => new LanguageInfo(languageCode, languageCode.ToUpperInvariant(), languageCode.ToUpperInvariant())
        };
    }
}
