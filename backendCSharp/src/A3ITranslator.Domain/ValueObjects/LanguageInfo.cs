namespace A3ITranslator.Domain.ValueObjects;

/// <summary>
/// Language information value object
/// </summary>
public class LanguageInfo : IEquatable<LanguageInfo>
{
    public string Code { get; }
    public string Name { get; }
    public string NativeName { get; }
    public bool IsRightToLeft { get; }

    public LanguageInfo(string code, string name, string nativeName, bool isRightToLeft = false)
    {
        if (string.IsNullOrWhiteSpace(code))
            throw new ArgumentException("Language code cannot be null or empty", nameof(code));
        
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Language name cannot be null or empty", nameof(name));
        
        if (string.IsNullOrWhiteSpace(nativeName))
            throw new ArgumentException("Native name cannot be null or empty", nameof(nativeName));

        Code = code.ToLowerInvariant();
        Name = name;
        NativeName = nativeName;
        IsRightToLeft = isRightToLeft;
    }

    public bool Equals(LanguageInfo? other)
    {
        if (other is null) return false;
        if (ReferenceEquals(this, other)) return true;
        return Code == other.Code;
    }

    public override bool Equals(object? obj)
    {
        return Equals(obj as LanguageInfo);
    }

    public override int GetHashCode()
    {
        return Code.GetHashCode();
    }

    public static bool operator ==(LanguageInfo? left, LanguageInfo? right)
    {
        return left?.Equals(right) ?? right is null;
    }

    public static bool operator !=(LanguageInfo? left, LanguageInfo? right)
    {
        return !(left == right);
    }

    // Common language constants
    public static readonly LanguageInfo English = new("en-us", "English", "English");
    public static readonly LanguageInfo Arabic = new("ar-sa", "Arabic", "العربية", true);
    public static readonly LanguageInfo Urdu = new("ur-pk", "Urdu", "اردو", true);
    public static readonly LanguageInfo Hindi = new("hi-in", "Hindi", "हिन्दी");
    public static readonly LanguageInfo Spanish = new("es-es", "Spanish", "Español");
    public static readonly LanguageInfo French = new("fr-fr", "French", "Français");
}
