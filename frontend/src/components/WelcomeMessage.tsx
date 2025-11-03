import { useEffect, useState, useRef } from 'react';
import { PlaybackManager } from '../services/PlaybackManager';
import { b64toBlob } from '../utils/blobUtils';
import { Button } from './ui/button';

interface WelcomeMessageProps {
  mainLanguage: string;
  targetLanguage: string;
  isPremium: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export const WelcomeMessage = ({
  mainLanguage,
  targetLanguage,
  isPremium,
  onComplete,
  onSkip,
}: WelcomeMessageProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [mainWelcomeText, setMainWelcomeText] = useState('');
  const [targetWelcomeText, setTargetWelcomeText] = useState('');
  const [mainAudioData, setMainAudioData] = useState<string | null>(null);
  const [targetAudioData, setTargetAudioData] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState('audio/mp3');
  const [currentlyPlaying, setCurrentlyPlaying] = useState<'main' | 'target' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [welcomeSequenceTriggered, setWelcomeSequenceTriggered] = useState(false);

  // Default welcome message in English
  const defaultWelcomeMessage = 
    "Welcome to AI Translator. Please Introduce yourself with your name and purpose of the meeting. This tool translates conversations in real-time. " +
    "There might be some inaccuracies in listening, transcription, or translation, just like humans. " +
    "Please monitor the conversation text on screen and if needed, repeat yourself using different words. " +
    "Let's begin your translation session.";

  // Use a ref for the playback manager to persist across renders
  const playbackManagerRef = useRef<PlaybackManager>(new PlaybackManager());

  // Helper function to get welcome message translations
  const getWelcomeTranslation = async (text: string, sourceLang: string, targetLang: string) => {
    try {
      console.log(`Translating from ${sourceLang} to ${targetLang}`);
      
      // Ensure we have valid language codes for the API
      // Convert language names to codes if needed
      const sourceCode = getLanguageCode(sourceLang);
      const targetCode = getLanguageCode(targetLang);
      
      console.log(`Using language codes: source=${sourceCode}, target=${targetCode}`);
      
      // Use the direct text translation endpoint
      const formData = new FormData();
      formData.append('text', text);
      formData.append('source_language', sourceCode);
      formData.append('target_language', targetCode);
      formData.append('is_premium', isPremium.toString());
      
      console.log('Sending translation request to backend');
      const response = await fetch('http://localhost:8000/translate-text/', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error (${response.status}): ${errorText}`);
        throw new Error(`Translation API error: ${response.status}, ${errorText}`);
      }
      
      console.log('Translation response received, parsing JSON');
      const result = await response.json();
      console.log('Translation result:', result);
      
      if (result.translation) {
        const hasAudio = !!result.translation_audio;
        console.log(`Translation successful, audio available: ${hasAudio}`);
        
        return {
          text: result.translation,
          audio: result.translation_audio || null,
          mimeType: result.translation_audio_mime_type || 'audio/mp3'
        };
      } else {
        console.error('No translation received in response');
        throw new Error('Translation not received');
      }
    } catch (error) {
      console.error('Failed to translate welcome message:', error);
      setError('Failed to translate welcome message. Click skip to continue.');
      // Return default text without audio
      return { text, audio: null, mimeType: 'audio/mp3' };
    }
  };
  
  // Helper function to convert language name to language code
  const getLanguageCode = (language: string): string => {
    // Handle common language names and convert to codes
    const langMap: Record<string, string> = {
      'english': 'en-US',
      'en': 'en-US',
      'spanish': 'es-ES',
      'es': 'es-ES',
      'french': 'fr-FR',
      'fr': 'fr-FR',
      'german': 'de-DE',
      'de': 'de-DE',
      'italian': 'it-IT',
      'it': 'it-IT',
      'chinese': 'zh-CN',
      'zh': 'zh-CN',
      'japanese': 'ja-JP',
      'ja': 'ja-JP',
      'korean': 'ko-KR',
      'ko': 'ko-KR',
      'arabic': 'ar-SA',
      'ar': 'ar-SA',
      'russian': 'ru-RU',
      'ru': 'ru-RU',
      'portuguese': 'pt-PT',
      'pt': 'pt-PT',
      'hindi': 'hi-IN',
      'hi': 'hi-IN',
      'danish': 'da-DK',
      'da': 'da-DK'
    };
    
    // Convert to lowercase for comparison
    const lowerLang = language.toLowerCase();
    
    // If it's already a language code like en-US, return as is
    if (/^[a-z]{2}-[A-Z]{2}$/.test(language)) {
      return language;
    }
    
    // If it's a simple code like 'en', use the mapping
    if (langMap[lowerLang]) {
      return langMap[lowerLang];
    }
    
    // If it's just a two-letter code not in our map, assume it's valid
    if (/^[a-z]{2}$/.test(lowerLang)) {
      return lowerLang;
    }
    
    // Default to original input if we can't determine a code
    console.warn(`Couldn't determine language code for: ${language}, using as-is`);
    return language;
  };

  // Load welcome messages on component mount
  useEffect(() => {
    const loadWelcomeMessages = async () => {
      setIsLoading(true);
      try {
        // Set initial welcome text while waiting for translations
        setMainWelcomeText(defaultWelcomeMessage);
        
        // ALWAYS translate to both languages to ensure we have text and audio for both
        console.log(`Preparing welcome message for main language: ${mainLanguage}`);
        
        // Get welcome message for main language
        let mainResult;
        if (mainLanguage.toLowerCase() !== 'english' && !mainLanguage.toLowerCase().startsWith('en')) {
          console.log(`Translating welcome message to main language: ${mainLanguage}`);
          mainResult = await getWelcomeTranslation(defaultWelcomeMessage, 'en', mainLanguage);
          setMainWelcomeText(mainResult.text);
        } else {
          // For English, use the default message but still get the audio
          console.log('Main language is English, using default text');
          mainResult = await getWelcomeTranslation(defaultWelcomeMessage, 'en', 'en-US');
          // Keep default English text
        }
        
        // Set main audio data
        setMainAudioData(mainResult.audio);
        
        // ALWAYS get target language translation and audio
        console.log(`Preparing welcome message for target language: ${targetLanguage}`);
        const targetResult = await getWelcomeTranslation(defaultWelcomeMessage, 'en', targetLanguage);
        setTargetWelcomeText(targetResult.text);
        setTargetAudioData(targetResult.audio);
        
        // Set the audio mime type
        if (targetResult.mimeType) {
          setAudioMimeType(targetResult.mimeType);
        } else if (mainResult?.mimeType) {
          setAudioMimeType(mainResult.mimeType);
        }
        
        // Set the audio mime type
        if (mainResult?.mimeType) {
          setAudioMimeType(mainResult.mimeType);
        }
        
      } catch (error) {
        console.error('Error preparing welcome messages:', error);
        setError('Failed to prepare welcome messages. Click skip to continue.');
      } finally {
        setIsLoading(false);
      }
    };

    // Store the playback manager reference
    const playbackManager = playbackManagerRef.current;
    
    loadWelcomeMessages();
    
    // Cleanup function
    return () => {
      playbackManager.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainLanguage, targetLanguage]);

  // Play audio sequence when ready
  useEffect(() => {
    if (!isLoading && !error && (mainAudioData || targetAudioData) && !welcomeSequenceTriggered) {
      console.log('Translations ready, starting welcome audio sequence');
      console.log(`Main audio data available: ${!!mainAudioData}`);
      console.log(`Target audio data available: ${!!targetAudioData}`);
      
      // Set flag to prevent duplicate playback
      setWelcomeSequenceTriggered(true);
      playWelcomeSequence();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, error, mainAudioData, targetAudioData, welcomeSequenceTriggered]);

  // Function to play welcome messages in sequence
  const playWelcomeSequence = () => {
    // Play target language FIRST, then main language
    // This ensures users hear the welcome in the language they want to translate TO
    
    if (targetAudioData) {
      try {
        console.log('Playing target language welcome audio FIRST');
        const targetBlob = b64toBlob(targetAudioData, audioMimeType);
        setCurrentlyPlaying('target');
        
        playbackManagerRef.current.playAudio(targetBlob, () => {
          console.log('Target language audio completed, now playing main language');
          
          // After target language, play main language if available
          if (mainAudioData) {
            try {
              console.log('Playing main language welcome audio');
              const mainBlob = b64toBlob(mainAudioData, audioMimeType);
              setCurrentlyPlaying('main');
              
              playbackManagerRef.current.playAudio(mainBlob, () => {
                console.log('Main language audio completed');
                setCurrentlyPlaying(null);
                onComplete();
              });
            } catch (error) {
              console.error('Error playing main audio:', error);
              setCurrentlyPlaying(null);
              onComplete();
            }
          } else {
            console.log('No main audio available, sequence complete');
            setCurrentlyPlaying(null);
            onComplete();
          }
        });
      } catch (error) {
        console.error('Error playing target audio:', error);
        
        // Try main audio as fallback if target audio fails
        if (mainAudioData) {
          try {
            console.log('Falling back to main language audio');
            const mainBlob = b64toBlob(mainAudioData, audioMimeType);
            setCurrentlyPlaying('main');
            
            playbackManagerRef.current.playAudio(mainBlob, () => {
              setCurrentlyPlaying(null);
              onComplete();
            });
          } catch (mainError) {
            console.error('Error playing main audio:', mainError);
            setCurrentlyPlaying(null);
            onComplete();
          }
        } else {
          setCurrentlyPlaying(null);
          onComplete();
        }
      }
    } else if (mainAudioData) {
      // If no target language audio, play only main language
      try {
        console.log('No target audio, playing only main language audio');
        const mainBlob = b64toBlob(mainAudioData, audioMimeType);
        setCurrentlyPlaying('main');
        
        playbackManagerRef.current.playAudio(mainBlob, () => {
          console.log('Main language audio completed');
          setCurrentlyPlaying(null);
          onComplete();
        });
      } catch (error) {
        console.error('Error playing main audio:', error);
        setCurrentlyPlaying(null);
        onComplete();
      }
    } else {
      // If no audio at all, just complete
      console.log('No audio available, completing welcome sequence');
      onComplete();
    }
  };

  // Handle skip button click
  const handleSkip = () => {
    playbackManagerRef.current.stop();
    setCurrentlyPlaying(null);
    onSkip();
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-center">Welcome to A3I Translator</h2>
      
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">Preparing welcome message...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
              <p>{error}</p>
            </div>
          )}

          <div className="p-4 border rounded-lg bg-gray-50">
            <h3 className="font-medium mb-2 text-green-600">
              {targetLanguage} {currentlyPlaying === 'target' && '(Playing...)'}
            </h3>
            <p>{targetWelcomeText || mainWelcomeText}</p>
          </div>

          <div className="p-4 border rounded-lg bg-gray-50">
            <h3 className="font-medium mb-2 text-blue-600">
              {mainLanguage} {currentlyPlaying === 'main' && '(Playing...)'}
            </h3>
            <p>{mainWelcomeText}</p>
          </div>

          <div className="flex justify-end space-x-4">
            <Button 
              onClick={handleSkip}
              variant="outline"
              className="px-6"
            >
              Skip
            </Button>
            
            {(!currentlyPlaying && (mainAudioData || targetAudioData)) && (
              <Button 
                onClick={() => {
                  // Reset the triggered flag before replaying
                  setWelcomeSequenceTriggered(false);
                  playWelcomeSequence();
                }}
                variant="default"
                className="px-6"
              >
                Replay
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
