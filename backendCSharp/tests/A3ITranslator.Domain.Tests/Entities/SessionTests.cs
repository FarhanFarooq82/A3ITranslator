using A3ITranslator.Domain.Entities;
using A3ITranslator.Domain.Enums;
using A3ITranslator.Domain.ValueObjects;

namespace A3ITranslator.Domain.Tests.Entities;

public class SessionTests
{
    [Fact]
    public void Constructor_ValidParameters_CreatesSession()
    {
        // Arrange
        var userId = "user123";
        var mainLanguage = LanguageInfo.English;
        var otherLanguage = LanguageInfo.Arabic;
        var userTier = UserTier.Premium;

        // Act
        var session = new Session(userId, mainLanguage, otherLanguage, userTier);

        // Assert
        Assert.Equal(userId, session.UserId);
        Assert.Equal(mainLanguage, session.MainLanguage);
        Assert.Equal(otherLanguage, session.OtherLanguage);
        Assert.Equal(userTier, session.UserTier);
        Assert.Equal(SessionState.Active, session.State);
        Assert.True(session.IsActive());
        Assert.Empty(session.Messages);
        Assert.Empty(session.Facts);
        Assert.Equal(0, session.MessageCount);
        Assert.Equal(0, session.FactsCount);
        Assert.Equal(1, session.NextSpeakerNumber);
    }

    [Fact]
    public void Constructor_NullUserId_ThrowsArgumentException()
    {
        // Arrange & Act & Assert
        Assert.Throws<ArgumentException>(() =>
            new Session(null!, LanguageInfo.English, LanguageInfo.Arabic, UserTier.Standard));
    }

    [Fact]
    public void Constructor_NullMainLanguage_ThrowsArgumentNullException()
    {
        // Arrange & Act & Assert
        Assert.Throws<ArgumentNullException>(() =>
            new Session("user123", null!, LanguageInfo.Arabic, UserTier.Standard));
    }

    [Fact]
    public void AddMessage_ValidMessage_AddsMessageAndUpdatesCount()
    {
        // Arrange
        var session = CreateTestSession();
        var message = new ConversationMessage(
            session.Id,
            "User",
            "Hello world",
            LanguageInfo.English,
            MessageType.Transcription);

        // Act
        session.AddMessage(message);

        // Assert
        Assert.Single(session.Messages);
        Assert.Equal(1, session.MessageCount);
        Assert.Contains(message, session.Messages);
    }

    [Fact]
    public void AddFact_ValidFact_AddsFactAndUpdatesCount()
    {
        // Arrange
        var session = CreateTestSession();
        var key = "user_name";
        var value = "Ahmed";

        // Act
        session.AddFact(key, value);

        // Assert
        Assert.Single(session.Facts);
        Assert.Equal(1, session.FactsCount);
        Assert.Equal(value, session.Facts[key]);
    }

    [Fact]
    public void GetSpeakerNumber_NewSpeaker_AssignsNewNumber()
    {
        // Arrange
        var session = CreateTestSession();
        var speakerId = "speaker001";

        // Act
        var speakerNumber = session.GetSpeakerNumber(speakerId);

        // Assert
        Assert.Equal(1, speakerNumber);
        Assert.Equal(2, session.NextSpeakerNumber);
        Assert.Equal(speakerNumber, session.SpeakerNumbers[speakerId]);
    }

    [Fact]
    public void GetSpeakerNumber_ExistingSpeaker_ReturnsSameNumber()
    {
        // Arrange
        var session = CreateTestSession();
        var speakerId = "speaker001";
        var firstCall = session.GetSpeakerNumber(speakerId);

        // Act
        var secondCall = session.GetSpeakerNumber(speakerId);

        // Assert
        Assert.Equal(firstCall, secondCall);
        Assert.Equal(2, session.NextSpeakerNumber); // Should not increment again
    }

    [Fact]
    public void SetSpeakerName_ValidName_SetsSpeakerName()
    {
        // Arrange
        var session = CreateTestSession();
        var speakerId = "speaker001";
        var name = "Ahmed";

        // Act
        session.SetSpeakerName(speakerId, name);

        // Assert
        Assert.Equal(name, session.GetSpeakerName(speakerId));
        Assert.Equal(name, session.SpeakerNames[speakerId]);
    }

    [Fact]
    public void GetSpeakerName_UnknownSpeaker_ReturnsNull()
    {
        // Arrange
        var session = CreateTestSession();

        // Act
        var result = session.GetSpeakerName("unknown_speaker");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void ExpireSession_ValidSession_SetsStateToExpired()
    {
        // Arrange
        var session = CreateTestSession();

        // Act
        session.ExpireSession();

        // Assert
        Assert.Equal(SessionState.Expired, session.State);
        Assert.False(session.IsActive());
    }

    [Fact]
    public void TerminateSession_ValidSession_SetsStateToTerminated()
    {
        // Arrange
        var session = CreateTestSession();

        // Act
        session.TerminateSession();

        // Assert
        Assert.Equal(SessionState.Terminated, session.State);
        Assert.False(session.IsActive());
    }

    [Fact]
    public void IsExpired_SessionWithTimeout_ReturnsCorrectStatus()
    {
        // Arrange
        var session = new Session(
            "user123",
            LanguageInfo.English,
            LanguageInfo.Arabic,
            UserTier.Standard,
            TimeSpan.FromMilliseconds(1)); // Very short timeout

        // Act & Assert
        Assert.False(session.IsExpired()); // Should not be expired immediately
        
        // Wait for expiration
        Thread.Sleep(10);
        Assert.True(session.IsExpired());
        Assert.False(session.IsActive());
    }

    [Fact]
    public void UpdateActivity_ValidSession_UpdatesLastActivity()
    {
        // Arrange
        var session = CreateTestSession();
        var originalActivity = session.LastActivity;
        
        // Wait a bit to ensure time difference
        Thread.Sleep(10);

        // Act
        session.UpdateActivity();

        // Assert
        Assert.True(session.LastActivity > originalActivity);
    }

    private static Session CreateTestSession()
    {
        return new Session("user123", LanguageInfo.English, LanguageInfo.Arabic, UserTier.Standard);
    }
}
