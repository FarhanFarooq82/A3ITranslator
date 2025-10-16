using A3ITranslator.Domain.Enums;
using A3ITranslator.Domain.ValueObjects;

namespace A3ITranslator.Domain.Tests.ValueObjects;

public class SpeakerInfoTests
{
    [Fact]
    public void Constructor_ValidParameters_CreatesSpeakerInfo()
    {
        // Arrange
        var speakerId = "speaker001";
        var speakerName = "Ahmed";
        var displayName = "Ahmed";
        var speakerNumber = 1;
        var confidence = 0.95f;
        var isKnownSpeaker = true;
        var source = "Azure_Recognition";
        var gender = Gender.Male;

        // Act
        var speakerInfo = new SpeakerInfo(
            speakerId, speakerName, displayName, speakerNumber,
            confidence, isKnownSpeaker, source, gender);

        // Assert
        Assert.Equal(speakerId, speakerInfo.SpeakerId);
        Assert.Equal(speakerName, speakerInfo.SpeakerName);
        Assert.Equal(displayName, speakerInfo.DisplayName);
        Assert.Equal(speakerNumber, speakerInfo.SpeakerNumber);
        Assert.Equal(confidence, speakerInfo.IdentificationConfidence);
        Assert.Equal(isKnownSpeaker, speakerInfo.IsKnownSpeaker);
        Assert.Equal(source, speakerInfo.Source);
        Assert.Equal(gender, speakerInfo.Gender);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_InvalidSpeakerId_ThrowsArgumentException(string? speakerId)
    {
        // Arrange & Act & Assert
        Assert.Throws<ArgumentException>(() =>
            new SpeakerInfo(speakerId!, "Ahmed", "Ahmed", 1, 0.95f, true, "test", Gender.Male));
    }

    [Theory]
    [InlineData(-0.1f)]
    [InlineData(1.1f)]
    [InlineData(2.0f)]
    public void Constructor_InvalidConfidence_ThrowsArgumentException(float confidence)
    {
        // Arrange & Act & Assert
        Assert.Throws<ArgumentException>(() =>
            new SpeakerInfo("speaker001", "Ahmed", "Ahmed", 1, confidence, true, "test", Gender.Male));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Constructor_InvalidSpeakerNumber_ThrowsArgumentException(int speakerNumber)
    {
        // Arrange & Act & Assert
        Assert.Throws<ArgumentException>(() =>
            new SpeakerInfo("speaker001", "Ahmed", "Ahmed", speakerNumber, 0.95f, true, "test", Gender.Male));
    }

    [Fact]
    public void Equals_SameSpeakerId_ReturnsTrue()
    {
        // Arrange
        var speakerInfo1 = CreateTestSpeakerInfo();
        var speakerInfo2 = new SpeakerInfo(
            speakerInfo1.SpeakerId, "Different Name", "Different Display", 2, 0.5f, false, "Different Source", Gender.Female);

        // Act & Assert
        Assert.True(speakerInfo1.Equals(speakerInfo2));
        Assert.True(speakerInfo1 == speakerInfo2);
    }

    [Fact]
    public void Equals_DifferentSpeakerId_ReturnsFalse()
    {
        // Arrange
        var speakerInfo1 = CreateTestSpeakerInfo();
        var speakerInfo2 = new SpeakerInfo(
            "different_speaker", speakerInfo1.SpeakerName, speakerInfo1.DisplayName, 
            speakerInfo1.SpeakerNumber, speakerInfo1.IdentificationConfidence, 
            speakerInfo1.IsKnownSpeaker, speakerInfo1.Source, speakerInfo1.Gender);

        // Act & Assert
        Assert.False(speakerInfo1.Equals(speakerInfo2));
        Assert.True(speakerInfo1 != speakerInfo2);
    }

    [Fact]
    public void Equals_Null_ReturnsFalse()
    {
        // Arrange
        var speakerInfo = CreateTestSpeakerInfo();

        // Act & Assert
        Assert.False(speakerInfo.Equals(null));
        Assert.True(speakerInfo != null);
    }

    [Fact]
    public void GetHashCode_SameSpeakerId_ReturnsSameHashCode()
    {
        // Arrange
        var speakerInfo1 = CreateTestSpeakerInfo();
        var speakerInfo2 = new SpeakerInfo(
            speakerInfo1.SpeakerId, "Different Name", "Different Display", 2, 0.5f, false, "Different Source", Gender.Female);

        // Act & Assert
        Assert.Equal(speakerInfo1.GetHashCode(), speakerInfo2.GetHashCode());
    }

    private static SpeakerInfo CreateTestSpeakerInfo()
    {
        return new SpeakerInfo(
            "speaker001", "Ahmed", "Ahmed", 1, 0.95f, true, "Azure_Recognition", Gender.Male);
    }
}

public class LanguageInfoTests
{
    [Fact]
    public void Constructor_ValidParameters_CreatesLanguageInfo()
    {
        // Arrange
        var code = "en-US";
        var name = "English";
        var nativeName = "English";
        var isRightToLeft = false;

        // Act
        var languageInfo = new LanguageInfo(code, name, nativeName, isRightToLeft);

        // Assert
        Assert.Equal("en-us", languageInfo.Code); // Should be lowercase
        Assert.Equal(name, languageInfo.Name);
        Assert.Equal(nativeName, languageInfo.NativeName);
        Assert.Equal(isRightToLeft, languageInfo.IsRightToLeft);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_InvalidCode_ThrowsArgumentException(string? code)
    {
        // Arrange & Act & Assert
        Assert.Throws<ArgumentException>(() =>
            new LanguageInfo(code!, "English", "English"));
    }

    [Fact]
    public void Equals_SameCode_ReturnsTrue()
    {
        // Arrange
        var lang1 = new LanguageInfo("en-US", "English", "English");
        var lang2 = new LanguageInfo("EN-us", "American English", "English"); // Different case and name

        // Act & Assert
        Assert.True(lang1.Equals(lang2));
        Assert.True(lang1 == lang2);
    }

    [Fact]
    public void PredefinedLanguages_HaveCorrectProperties()
    {
        // Assert
        Assert.Equal("en-us", LanguageInfo.English.Code);
        Assert.Equal("ar-sa", LanguageInfo.Arabic.Code);
        Assert.True(LanguageInfo.Arabic.IsRightToLeft);
        Assert.True(LanguageInfo.Urdu.IsRightToLeft);
        Assert.False(LanguageInfo.English.IsRightToLeft);
        Assert.False(LanguageInfo.Spanish.IsRightToLeft);
    }
}
