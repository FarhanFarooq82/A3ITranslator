# Audio Management Refactoring Guide

## onSilenceEnd to onSoundResumed Migration

We've renamed the `onSilenceEnd` callback to `onSoundResumed` throughout the application for better clarity. This change affects several files:

### 1. SilenceDetectionService.ts
- Changed parameter name in `startDetection` method
- Changed parameter name in `handleSilence` method

### 2. AudioRecordingManager.ts
- Updated the `RecordingCallbacks` interface to use `onSoundResumed` 
- Updated the `startRecording` method to pass `callbacks.onSoundResumed`

### 3. TranslationContext.tsx
- Updated the callbacks object in `triggerRecording` function to use `onSoundResumed`

### 4. Tests
- Updated tests to use the new callback name

## Reasoning

The original name `onSilenceEnd` was ambiguous and could be confused with "the end of the silence detection process." The new name `onSoundResumed` more clearly indicates the purpose of this callback: it's triggered when sound is detected after a period of silence.

## Usage

When implementing or using the silence detection functionality:

```typescript
// Create callbacks object for silence detection 
const callbacks: RecordingCallbacks = {
  onSilenceCountdown: (countdown) => {
    // Called during silence with countdown value
  },
  onSoundResumed: () => {
    // Called when sound is detected (speech resumes)
  },
  onSilenceComplete: () => {
    // Called when silence completes (end recording)
  }
};

// Start recording with silence detection callbacks
await recordingManager.startRecording(callbacks);
```

## Future Improvements

Consider implementing similar clarity improvements to other callback names:
- `onSilenceCountdown` could potentially be renamed to `onSilenceProgress` 
- `onSilenceComplete` could potentially be renamed to `onSilenceTimeout`
