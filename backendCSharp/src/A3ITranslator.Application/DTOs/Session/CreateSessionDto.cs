using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Application.DTOs.Session;

/// <summary>
/// Create session request DTO
/// </summary>
public class CreateSessionDto
{
    public string UserId { get; set; } = string.Empty;
    public string MainLanguage { get; set; } = string.Empty;
    public string OtherLanguage { get; set; } = string.Empty;
    public RequestType RequestType { get; set; } = RequestType.Standard;
    public TimeSpan? SessionTimeout { get; set; }
}
