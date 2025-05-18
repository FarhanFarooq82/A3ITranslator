import React, { useState, useEffect, useRef, useCallback } from 'react';
import RecordRTC, { StereoAudioRecorder } from 'recordrtc';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { AlertCircle } from "lucide-react"

const languages = [
  { value: "en-US", name: "English (US)" },
  { value: "da-DK", name: "Danish (Denmark)" },
  { value: "ur-PK", name: "Urdu (Pakistan)" }
];

const SILENCE_THRESHOLD = 0.05;
const SILENCE_DURATION = 3000;
const SAMPLE_RATE = 100;
const BUFFER_SIZE = 30;

const RealTimeTranslatorApp = () => {
  // State
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [targetWord, setTargetWord] = useState('Listen A3I');
  const [wordCount, setWordCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingStop, setIsProcessingStop] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [translation, setTranslation] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mainLanguage, setMainLanguage] = useState(languages[0].value);
  const [otherLanguage, setOtherLanguage] = useState(languages[1].value);
  const [status, setStatus] = useState('');
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);

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

  // Play audio and restart listening after playback
  const playAudio = (audioBlob: Blob) => {
    setStatus('Playing...');
    setIsPlaying(true);
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => {
      setIsPlaying(false);
      setStatus('');
      setAudioUrl(null);
      startListening();
      URL.revokeObjectURL(url);
    };
  };

  // Handle backend response
  const handleApiResponse = (response: any) => {
    setTranscription(response.transcription || '');
    setTranslation(response.translation || '');
    if (response.translation_audio && response.translation_audio_mime_type) {
      const audioBlob = b64toBlob(response.translation_audio, response.translation_audio_mime_type);
      playAudio(audioBlob);
    } else {
      setAudioUrl(null);
      startListening();
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

  // Start listening for trigger word
  const startListening = async () => {
    setStatus('Listening for trigger word...');
    setIsListening(true);
    setIsRecording(false);
    setIsPlaying(false);
    setTranscript('');
    setInterimTranscript('');
    setAudioUrl(null);

    // Clean up previous stream
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }

    // Get mic stream for recognition
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamRef.current = stream;
      setupRecognition();
    } catch (err) {
      setError('Microphone access denied or unavailable.');
      setIsListening(false);
    }
  };

  // Setup recognition with a stream
  const setupRecognition = () => {
    if ('webkitSpeechRecognition' in window) {
      recognitionRef.current = new webkitSpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setError(null);
      };
      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let currentTranscript = '';
        let currentInterimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            currentTranscript += event.results[i][0].transcript;
          } else {
            currentInterimTranscript += event.results[i][0].transcript + ' ';
          }
        }
        setTranscript((prevTranscript) => prevTranscript + currentTranscript);
        setInterimTranscript(currentInterimTranscript);

        const lowerCaseTranscript = currentTranscript.toLowerCase();
        const lowerCaseTargetWord = targetWord.toLowerCase();
        if (lowerCaseTranscript.includes(lowerCaseTargetWord)) {
          setStatus('Trigger word detected! Recording...');
          recognitionRef.current?.stop();
          setIsListening(false);
          startRecording();
        }
      };
      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        setError('Speech recognition error: ' + event.error);
        setIsListening(false);
      };
      recognitionRef.current.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };
      recognitionRef.current.start();
    } else {
      setError('Web Speech API is not supported in this browser.');
    }
  };

  // Start recording (from trigger word or manual)
  const startRecording = async () => {
    setStatus('Recording...');
    setIsRecording(true);
    setIsListening(false);

    // Stop recognition stream if running
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Use the active stream for recording
    const stream = activeStreamRef.current;
    if (!stream) {
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

  // Stop recording (from silence or manual)
  const stopAudioRecording = useCallback(() => {
    if (RTCRecorderRef.current && !isProcessingStop) {
      RTCRecorderRef.current.stopRecording(() => {
        const blob = RTCRecorderRef.current?.getBlob();
        if (blob) {
          setIsProcessingStop(true);
          sendAudioToBackend(blob)
            .then(handleApiResponse)
            .catch(error => {
              setError('Failed to send audio to backend {}: ' + (error instanceof Error ? error.message : 'Unknown error'));
            })
            .finally(() => {
              setIsProcessingStop(false);
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

  // Manual record button
  const handleManualRecord = async () => {
    setStatus('Recording...');
    setIsRecording(true);
    setIsListening(false);

    // If already have a stream, use it; otherwise, get a new one
    let stream = activeStreamRef.current;
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { noiseSuppression: true, echoCancellation: true },
        });
        activeStreamRef.current = stream;
      } catch (err) {
        setError('Error starting manual recording: ' + (err instanceof Error ? err.message : 'Unknown error'));
        setIsRecording(false);
        return;
      }
    }
    startRecording();
  };

  // Manual translate button
  const handleManualTranslate = () => {
    setStatus('Translating...');
    setIsRecording(false);
    stopAudioRecording();
  };

  // Start/Stop recognition button
  const toggleRecognition = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setStatus('');
    } else {
      startListening();
    }
  };

  // Word count effect
  useEffect(() => {
    const fullTranscript = (transcript + ' ' + interimTranscript).trim();
    const lowerCaseTranscript = fullTranscript.toLowerCase();
    const lowerCaseTargetWord = targetWord.toLowerCase();
    const targetWords = lowerCaseTargetWord.split(' ');
    let count = 0;
    if (targetWords.length === 1) {
      const words = lowerCaseTranscript.split(/\s+/);
      for (const word of words) {
        if (word === lowerCaseTargetWord) count++;
      }
    } else {
      const phrase = targetWords.join(' ');
      let index = lowerCaseTranscript.indexOf(phrase);
      while (index !== -1) {
        count++;
        index = lowerCaseTranscript.indexOf(phrase, index + phrase.length);
      }
    }
    setWordCount(count);
  }, [transcript, targetWord, interimTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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

  // Button visibility logic
  const showStartListening = !isListening && !isRecording && !isPlaying;
  const showRecord = isListening && !isRecording && !isPlaying;
  const showTranslate = isRecording && !isPlaying;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Real Time Translator</h1>
      <div>
        <h3>Transcription</h3>
        <Textarea value={transcription} readOnly />
        <h3>Translation</h3>
        <Textarea value={translation} readOnly />
        {audioUrl && (
          <div>
            <h3>Translation Audio</h3>
            <audio controls src={audioUrl}></audio>
          </div>
        )}
      </div>
      <div className="mb-4 w-full max-w-md">
        <Input
          type="text"
          placeholder="Enter target word(s)"
          value={targetWord}
          onChange={(e) => setTargetWord(e.target.value)}
          className="mb-2"
        />
        <Textarea
          value={transcript + ' ' + interimTranscript}
          readOnly
          placeholder="Transcription will appear here..."
          className="min-h-[200px] bg-gray-50 border-gray-300 text-gray-700"
        />
      </div>
      {/* Language Selection */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div>
          <label htmlFor="main-lang-select" className="block text-sm font-medium text-gray-700">Main Language (Speech Recognition):</label>
          <select value={mainLanguage} onChange={e => setMainLanguage(e.target.value)}>
            {languages.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="other-lang-select" className="block text-sm font-medium text-gray-700">Other Language (Translation Target):</label>
          <select
            id="other-lang-select"
            value={otherLanguage}
            onChange={e => setOtherLanguage(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {languages.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.name}</option>
            ))}
          </select>
        </div>
      </div>
      {/* Main control buttons */}
      <div className="mb-4">
        {showStartListening && (
          <Button onClick={toggleRecognition} size="lg">
            Start Listening
          </Button>
        )}
        {showRecord && (
          <Button onClick={handleManualRecord} size="lg">
            Record
          </Button>
        )}
        {showTranslate && (
          <Button onClick={handleManualTranslate} size="lg">
            Translate
          </Button>
        )}
      </div>
      <div className="mb-6 text-lg text-gray-700">
        Word Count: <span className="font-semibold">{wordCount}</span>
      </div>
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
    </div>
  );
};

export default RealTimeTranslatorApp;