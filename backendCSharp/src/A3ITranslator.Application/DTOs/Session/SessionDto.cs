using A3ITranslator.Domain.Enums;

namespace A3ITranslator.Application.DTOs.Session;

/// <summary>
/// Session information DTO
/// </summary>
public class SessionDto
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string MainLanguage { get; set; } = string.Empty;
    public string OtherLanguage { get; set; } = string.Empty;
    public RequestType RequestType { get; set; }
    public SessionState State { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastActivity { get; set; }
    public int MessageCount { get; set; }
    public int FactsCount { get; set; }
}
