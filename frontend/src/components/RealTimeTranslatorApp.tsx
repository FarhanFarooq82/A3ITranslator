import React, { useState, useEffect, useRef, useCallback } from 'react';
import RecordRTC, { StereoAudioRecorder } from 'recordrtc';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { AlertCircle } from "lucide-react"
import LanguageSelector from './LanguageSelector';
import ControlButtons from './ControlButtons';
import ConversationHistory from './ConversationHistory';

const languages = [
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
];

const SILENCE_THRESHOLD = 0.05;
const SILENCE_DURATION = 3000;
const SAMPLE_RATE = 100;
const BUFFER_SIZE = 30;

const RealTimeTranslatorApp = () => {
  // State
  console.log("MOUNTED: RealTimeTranslatorApp");
  const [targetWord, setTargetWord] = useState('Translate');
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingStop, setIsProcessingStop] = useState(false);
  const [translation, setTranslation] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mainLanguage, setMainLanguage] = useState(languages[0].value);
  const [otherLanguage, setOtherLanguage] = useState(languages[1].value);
  const [status, setStatus] = useState('');
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  // UI state: show session start controls only at first
  const [sessionStarted, setSessionStarted] = useState(false);
  // Session ID state
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Confirmation dialog state
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [conversation, setConversation] = useState<{ text: string; language: string; speaker: string; timestamp: string }[]>([]);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const RTCRecorderRef = useRef<RecordRTC | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const silenceCountdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const silenceDetectionActiveRef = useRef<boolean>(false);
  const activeStreamRef = useRef<MediaStream | null>(null); // <--- for stream management

  const backendApiUrl = 'http://localhost:8000/process-audio';

  // Helper: base64 to Blob
  function b64toBlob(b64Data: string, contentType: string) {
    const byteCharacters = atob(b64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  }

  // Helper to generate a session ID
  function generateSessionId() {
    return (
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).substring(2, 10)
    );
  }

  // --- Workflow State ---
  // isListening: true when listening for trigger word
  // isRecording: true when recording audio
  // isPlaying: true when playing translation audio

  // --- UI Button Logic ---
  // Show Record button when listening for trigger word (isListening && !isRecording && !isPlaying)
  // Show Translate button when recording (isRecording && !isPlaying)

  // --- Workflow Functions ---

  // Start listening for trigger word (after session start or after translation playback)

    // Start session handler
  const handleStartSession = (e) => {
    console.log("handleStartSession called");
    e.preventDefault?.();
    let id = sessionId;
    if (!id) {
      id = generateSessionId();
      const expiry = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
      localStorage.setItem('a3i_session', JSON.stringify({ id, expiry }));
      setSessionId(id);
      setSessionStarted(true);
    }
    console.log('sessionStarted startsession', sessionStarted,'islistening',isListening);
    startListening();
    console.log('sessionStarted before',sessionStarted,'islistening',isListening);
  };


  const startListening = async () => {
    setStatus('Listening for trigger word...');
    setIsListening(true);
    setupRecognition();
  };

  const languageName = (lang: string) => {
    const found = languages.find(l => l.value === lang);
    return found ? found.name.split(' ')[0] : lang;
  };

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const setupRecognition = () => {
    if ('webkitSpeechRecognition' in window) {
      recognitionRef.current = new webkitSpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = mainLanguage;
      recognitionRef.current.onstart = () => {
        setError(null);
      };
      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            currentTranscript += event.results[i][0].transcript;
          }
        }
        const lowerCaseTranscript = currentTranscript.toLowerCase();
        const lowerCaseTargetWord = targetWord.toLowerCase();
        if (lowerCaseTranscript.includes(lowerCaseTargetWord)) {
          setStatus('Trigger word detected! Recording...');
          recognitionRef.current?.stop();
          setIsListening(false);
          startRecording();
        }
        // Do NOT append local transcript to conversation here; only use backend response
      };
      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech') {
          setStatus('Listening for trigger word...npm run dve');
          console.log('sessionStarted recog ref no speech error', sessionStarted);
          setTimeout(() => {
            startListening();
          }, 100);
        } else {
          setError('Speech recognition error: ' + event.error);
          setIsListening(false);
        }
      };
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
      recognitionRef.current.start();
    } else {
      setError('Web Speech API is not supported in this browser.');
    }
  };

  // Start recording (from trigger word or manual Record button)
const startRecording = async () => {
    setStatus('Recording...');
    setIsRecording(true);
    setIsListening(false);
    setIsPlaying(false);
    if (recognitionRef.current) recognitionRef.current.stop();

    let stream: MediaStream;
    try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    activeStreamRef.current = stream;
    } catch (err) {
      setError('No audio stream available for recording.');
      setIsRecording(false);
      return;
    }
    audioChunksRef.current = [];
    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      source.connect(analyser);
      RTCRecorderRef.current = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/ogg',
        recorderType: StereoAudioRecorder,
        numberOfAudioChannels: 1,
        desiredSampRate: 16000,
        timeSlice: 1000,
        ondataavailable: (blob: Blob) => {
          if (blob.size > 0) {
            audioChunksRef.current.push(blob);
          }
        }
      });
      RTCRecorderRef.current.startRecording();
      startSilenceDetection();
    } catch (error) {
      setError('Error during recording: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setIsRecording(false);
    }
  };

  // Stop recording (from silence or manual Translate button)
  const stopAudioRecording = useCallback(() => {
    if (RTCRecorderRef.current && !isProcessingStop) {
      RTCRecorderRef.current.stopRecording(() => {
        const blob = RTCRecorderRef.current?.getBlob();
        if (blob) {
          setIsProcessingStop(true);
          sendAudioToBackend(blob)
            .then(handleApiResponse)
            .catch(error => {
              setError('Failed to send audio to backend: ' + (error instanceof Error ? error.message : 'Unknown error'));
            })
            .finally(() => {
              setIsProcessingStop(false);
              setIsRecording(false);
              RTCRecorderRef.current?.destroy();
              RTCRecorderRef.current = null;
            });
        }
      });
    }
    silenceDetectionActiveRef.current = false;
    clearSilenceTimeout();
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }
  }, [isProcessingStop]);

  // Manual Record button handler
  const handleManualRecord = async () => {
    console.log("handleManualRecord called");
    if (isListening && !isRecording && !isPlaying) {
      await startRecording();
    }
  };

  // Manual Translate button handler
  const handleManualTranslate = () => {
    console.log("handleManualTranslate called");
    if (isRecording && !isPlaying) {
      setStatus('Translating...');
      stopAudioRecording();
    }
  };

  // Play audio and restart listening after playback
  const playAudio = (audioBlob: Blob, caption : string ) => {
    setStatus(caption);
    setIsPlaying(true);
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => {
      setIsPlaying(false);
      setStatus('');
      setAudioUrl(null);
      console.log('sessionStarted play', sessionStarted);
      if (sessionStarted) {
        startListening();
      }
      URL.revokeObjectURL(url);
    };
  };

  // Handle backend response
  const handleApiResponse = (response: any) => {
    setTranslation(response.translation || '');
     // If spoken language is main language, append transcription only
    if (response.audio_language === mainLanguage && response.transcription) {
      setConversation(prev => [
        ...prev,
        {
          text: response.transcription,
          language: response.audio_language,
          speaker: languageName(response.audio_language) + ' Speaker',
          timestamp: response.timestamp || ''
        }
      ]);
    }
    // If translation language is main language, append translation only
    else if (response.translation_language === mainLanguage && response.translation) {
      setConversation(prev => [
        ...prev,
        {
          text: response.translation,
          language: response.audio_language,
          speaker: languageName(response.audio_language) + ' Speaker',
          timestamp: response.timestamp || ''
        }
      ]);
    }
    if (response.translation_audio && response.translation_audio_mime_type) {
      const audioBlob = b64toBlob(response.translation_audio, response.translation_audio_mime_type);
      playAudio(audioBlob, response.translation);
    } else {
      setAudioUrl(null);
      if (sessionStarted) {
        startListening();
      }
    }
  };

  // Send audio to backend
  const sendAudioToBackend = async (audioBlob: Blob): Promise<any> => {
    try {
      setStatus('Translating...');
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.ogg');
      formData.append('main_language', mainLanguage);
      formData.append('other_language', otherLanguage);
      const response = await fetch(backendApiUrl, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const responseJson = await response.json();
      setStatus('Translation Process Completed');
      return responseJson;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred while sending audio.';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  // Silence detection
  const startSilenceDetection = () => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    const volumeBuffer: number[] = [];
    silenceDetectionActiveRef.current = true;
    let lastCheckTime = Date.now();

    const checkSilence = () => {
      if (!analyserRef.current || !silenceDetectionActiveRef.current) return;
      const currentTime = Date.now();
      if (currentTime - lastCheckTime >= SAMPLE_RATE) {
        analyserRef.current.getByteFrequencyData(data);
        let sumOfSquares = 0;
        for (let i = 0; i < data.length; i++) {
          sumOfSquares += data[i] * data[i];
        }
        const rms = Math.sqrt(sumOfSquares / data.length);
        const normalizedRMS = rms / 256;
        volumeBuffer.push(normalizedRMS);
        if (volumeBuffer.length > BUFFER_SIZE) volumeBuffer.shift();
        const averageVolume = volumeBuffer.reduce((a, b) => a + b, 0) / volumeBuffer.length;

        if (volumeBuffer.length === BUFFER_SIZE && averageVolume < SILENCE_THRESHOLD) {
          if (!silenceTimeoutRef.current) {
            setSilenceCountdown(SILENCE_DURATION / 1000);
            let countdown = SILENCE_DURATION / 1000;
            if (silenceCountdownIntervalRef.current) clearInterval(silenceCountdownIntervalRef.current);
            silenceCountdownIntervalRef.current = setInterval(() => {
              countdown -= 1;
              setSilenceCountdown(countdown);
              if (countdown <= 0) {
                clearInterval(silenceCountdownIntervalRef.current!);
                setSilenceCountdown(null);
              }
            }, 1000);

            silenceTimeoutRef.current = setTimeout(() => {
              const recentAverage = volumeBuffer.slice(-10).reduce((a, b) => a + b, 0) / 10;
              if (recentAverage < SILENCE_THRESHOLD) {
                setSilenceCountdown(null);
                clearInterval(silenceCountdownIntervalRef.current!);
                stopAudioRecording();
              } else {
                clearSilenceTimeout();
                clearInterval(silenceCountdownIntervalRef.current!);
                setSilenceCountdown(null);
                setStatus('Recording...');
              }
            }, SILENCE_DURATION);
          }
        } else {
          clearSilenceTimeout();
          clearInterval(silenceCountdownIntervalRef.current!);
          setSilenceCountdown(null);
        }
        lastCheckTime = currentTime;
      }
      requestAnimationFrame(checkSilence);
    };
    checkSilence();
  };

  const clearSilenceTimeout = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  };

  
  // Stop session logic
  const handleStopSession = () => {
    console.log("handleStopSession called");
    setShowEndSessionConfirm(true);
  };

  // Confirm end session
  const confirmEndSession = () => {
    console.log("confirmEndSession called");
    setSessionStarted(false);
    setSessionId(null);
    localStorage.removeItem('a3i_session');
    setTargetWord('Translate');
    setIsListening(false);
    setIsRecording(false);
    setIsPlaying(false);
    setError(null);
    setIsProcessingStop(false);
    setTranslation('');
    setAudioUrl(null);
    setStatus('');
    setSilenceCountdown(null);
    setConversation([]); // Clear conversation on end session
    // Stop and release all refs
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (RTCRecorderRef.current) {
      RTCRecorderRef.current.stopRecording(() => {
        RTCRecorderRef.current?.destroy();
        RTCRecorderRef.current = null;
      });
    }
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    }
    silenceDetectionActiveRef.current = false;
    clearSilenceTimeout();
    if (silenceCountdownIntervalRef.current) {
      clearInterval(silenceCountdownIntervalRef.current);
      silenceCountdownIntervalRef.current = null;
    }
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }
    setShowEndSessionConfirm(false);
  };

  // Cancel end session
  const cancelEndSession = () => {
    console.log("cancelEndSession called");
    setShowEndSessionConfirm(false);
  };

    useEffect(() => {
    console.log("EFFECT: session restore useEffect");
    const session = localStorage.getItem('a3i_session');
    if (session) {
      const { id, expiry } = JSON.parse(session);
      if (Date.now() < expiry) {
        setSessionId(id);
        setSessionStarted(true);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("EFFECT: RealTimeTranslatorApp cleanup on unmount");
      recognitionRef.current = null;
      if (RTCRecorderRef.current) {
        RTCRecorderRef.current.stopRecording(() => {
          RTCRecorderRef.current?.destroy();
          RTCRecorderRef.current = null;
        });
      }
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;
      }
      silenceDetectionActiveRef.current = false;
      clearSilenceTimeout();
      if (silenceCountdownIntervalRef.current) {
        clearInterval(silenceCountdownIntervalRef.current);
        silenceCountdownIntervalRef.current = null;
      }
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop());
        activeStreamRef.current = null;
      }
    };
  }, []);

  // Button visibility logic (updated for session)
  const showStartSession = !sessionStarted;
  const showMainUI = sessionStarted;
  const showStopSession = sessionStarted; // Only show Stop Session after session started
  const showRecord = showMainUI && isListening && !isRecording && !isPlaying;
  const showTranslate = showMainUI && isRecording && !isPlaying;

  // --- UI ---
  return ( 
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">A3I Translator</h1>
      {/* Add a global log for every render */}
      <div style={{position:'fixed',top:0,right:0,background:'#fff',zIndex:9999,fontSize:'10px',padding:'2px'}}>Check console for logs</div>
      {/* Conversation History */}
      {showMainUI && (
        <ConversationHistory
          conversation={conversation}
          mainLanguage={mainLanguage}
          conversationEndRef={conversationEndRef}
        />
      )}
      {/* End Session Confirmation Dialog - overlays everything else when visible */}
      {showEndSessionConfirm ? (
        <SessionDialog onCancel={cancelEndSession} onConfirm={confirmEndSession} />
      ) : (
        <>
          {/* Stop Session Button - only visible after session started */}
          {showStopSession && (
            <div className="w-full flex justify-end mb-2">
              <Button onClick={handleStopSession} variant="destructive" size="sm">
                Stop Session
              </Button>
            </div>
          )}
          {/* Language Selection - always visible */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <LanguageSelector
              label="Main Language:"
              value={mainLanguage}
              onChange={setMainLanguage}
              options={languages.map(l => ({ value: l.value, label: l.name }))}
            />
            <LanguageSelector
              label="Target Language  :"
              value={otherLanguage}
              onChange={setOtherLanguage}
              options={languages.map(l => ({ value: l.value, label: l.name }))}
            />
          </div>
          {/* Start Session Button - only at first */}
          {showStartSession && (
            <div className="mb-4">
              <Button type="button" onClick={handleStartSession} size="lg">
                Start Session
              </Button>
            </div>
          )}
          {/* Main UI - hidden until session starts */}
          {showMainUI && (
            <>
              <div className="mb-4 w-full max-w-md">
                <Input
                  type="text"
                  placeholder="Enter target word(s)"
                  value={targetWord}
                  onChange={(e) => setTargetWord(e.target.value)}
                  className="mb-2"
                />
              </div>
              <ControlButtons
                showRecord={showRecord}
                showTranslate={showTranslate}
                onRecord={handleManualRecord}
                onTranslate={handleManualTranslate}
              />
              <TranslationDisplay audioUrl={audioUrl} />
              {error && (
                <Alert variant="destructive" className="mt-4 w-full max-w-md">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {status && (
                <div className="mb-4 text-blue-700 font-semibold text-lg">
                  {status}
                  {silenceCountdown !== null && <span> {silenceCountdown}</span>}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

// SessionDialog component
const SessionDialog = ({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
      <h2 className="text-lg font-semibold mb-4">End Session?</h2>
      <p className="mb-6">Are you sure you want to end the session? This will release the microphone and clear all data.</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="outline">Cancel</Button>
        <Button onClick={onConfirm} variant="destructive">End Session</Button>
      </div>
    </div>
  </div>
);

// TranslationDisplay component
const TranslationDisplay = ({ audioUrl }: { audioUrl: string | null }) => (
  <div>
    {audioUrl && (
      <div>
        <h3>Translation Audio</h3>
        <audio controls src={audioUrl}></audio>
      </div>
    )}
  </div>
);

export default RealTimeTranslatorApp;