export const languages = [
  { value: "en-US", name: "English (US)" },
  { value: "da-DK", name: "Danish (Denmark)" },
  { value: "ur-PK", name: "Urdu (Pakistan)" },
  { value: "pa-IN", name: "Punjabi (India)" },
  { value: "es-ES", name: "Spanish (Spain)" },
  { value: "fr-FR", name: "French (France)" },
  { value: "de-DE", name: "German (Germany)" },
  { value: "it-IT", name: "Italian (Italy)" },
  { value: "ja-JP", name: "Japanese (Japan)" },
  { value: "ko-KR", name: "Korean (South Korea)" },
  { value: "zh-CN", name: "Chinese (Simplified)" },
  { value: "zh-TW", name: "Chinese (Traditional)" },
  { value: "ar-SA", name: "Arabic (Saudi Arabia)" },
  { value: "pt-BR", name: "Portuguese (Brazil)" },
  { value: "ru-RU", name: "Russian (Russia)" },
  { value: "tr-TR", name: "Turkish (Turkey)" },
  { value: "nl-NL", name: "Dutch (Netherlands)" },
  { value: "sv-SE", name: "Swedish (Sweden)" },
] as const;

export const SILENCE_THRESHOLD = 0.05;
export const SILENCE_DURATION = 3000;
export const SAMPLE_RATE = 100;
export const BUFFER_SIZE = 30;
export const BACKEND_API_URL = 'http://localhost:8000/process-audio';
