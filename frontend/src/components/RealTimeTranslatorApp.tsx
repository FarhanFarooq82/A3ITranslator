import React, { useState, useEffect, useRef, useCallback } from 'react';
import RecordRTC, { StereoAudioRecorder } from 'recordrtc';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { AlertCircle } from "lucide-react"

const RealTimeTranslatorApp = () => {
    const [transcript, setTranscript] = useState<string>('');
    const [interimTranscript, setInterimTranscript] = useState<string>('');
    const [targetWord, setTargetWord] = useState<string>('example');
    const [wordCount, setWordCount] = useState<number>(0);
    const [isListening, setIsListening] = useState<boolean>(false);
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isProcessingStop, setIsProcessingStop] = useState<boolean>(false);
    const [transcription, setTranscription] = useState<string>('');
    const [translation, setTranslation] = useState<string>('');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const RTCRecorderRef = useRef<RecordRTC | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const silenceDetectionActiveRef = useRef<boolean>(false);
    const silenceThreshold = 0.02;
    const silenceDuration = 2500;
    const backendApiUrl = 'http://localhost:8000/process-audio'; // Replace with your backend API URL

    const playAudio = (audioBlob: Blob) => {
        // Create a URL for the audio blob
        const audioUrl = URL.createObjectURL(audioBlob);
    
        // Create an audio element and play the audio
        const audio = new Audio(audioUrl);
        audio.play();
    
        // Clean up the URL after the audio finishes playing
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
        };
    };

    // After receiving the response from sendAudioToBackend
    const handleApiResponse = (response: any) => {
        setTranscription(response.transcription || '');
        setTranslation(response.translation || '');

        // Handle audio playback if audio is present
        if (response.translation_audio && response.translation_audio_mime_type) {
            const audioBlob = b64toBlob(response.translation_audio, response.translation_audio_mime_type);
            const url = URL.createObjectURL(audioBlob);
            setAudioUrl(url);
            playAudio(audioBlob); // Play the audio
        } else {
            setAudioUrl(null);
        }
    };

    // Helper function to convert base64 to Blob
    function b64toBlob(b64Data: string, contentType: string) {
        const byteCharacters = atob(b64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: contentType });
    }
    const sendAudioToBackend = async (audioBlob: Blob): Promise<any> => {
        try {
            // Create FormData and append the blob with specific filename and type
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.ogg'); // Note: 'file' matches FastAPI parameter name
    
            // Log the blob details for debugging
            console.log('Sending blob:', {
                size: audioBlob.size,
                type: audioBlob.type
            });
    
            const response = await fetch(backendApiUrl, {
                method: 'POST',
                body: formData,
            });
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            const responseJson = await response.json();
            console.log('Response from backend:', responseJson);
            return responseJson;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred while sending audio.';
            console.error('Error sending audio to backend:', errorMessage);
            throw new Error(errorMessage);
        }
    };

    const saveAudioLocally = (audioBlob: Blob, fileName: string) => {
        // Create a URL for the audio blob
        const audioUrl = URL.createObjectURL(audioBlob);
    
        // Create an anchor element and trigger a download
        const link = document.createElement('a');
        link.href = audioUrl;
        link.download = fileName; // Set the file name for the download
        document.body.appendChild(link);
        link.click();
    
        // Clean up the URL and remove the anchor element
        URL.revokeObjectURL(audioUrl);
        document.body.removeChild(link);
    };


    // Function to handle audio recording
    const handleAudioRecording = useCallback(async (stream: MediaStream) => {
        setIsRecording(true);
        setError(null);
        audioChunksRef.current = [];
    
        try {
            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
    
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            analyserRef.current = analyser;
    
            source.connect(analyser);
    
            console.log('Initializing RecordRTC');
            RTCRecorderRef.current = new RecordRTC(stream, {
                type: 'audio',
                mimeType: 'audio/ogg',
                recorderType: StereoAudioRecorder,
                numberOfAudioChannels: 1,
                desiredSampRate: 16000,
                timeSlice: 1000, // Get data every second
                ondataavailable: (blob: Blob) => {
                    if (blob.size > 0) {
                        audioChunksRef.current.push(blob);
                    }
                }
            });
    
            RTCRecorderRef.current.startRecording();
            startSilenceDetection(stream);
    
        } catch (error) {
            console.error('Error during recording:', error);
            setError(error instanceof Error ? error.message : 'Unknown error occurred during recording.');
        }
    }, [backendApiUrl]);
    
    const startSilenceDetection = (stream: MediaStream) => {
        if (!analyserRef.current) return;
    
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        silenceDetectionActiveRef.current = true; // Activate silence detection
    
        const checkSilence = () => {
            // Stop the loop if silence detection is no longer active
            if (!analyserRef.current || !silenceDetectionActiveRef.current) return;
    
            analyserRef.current.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
                sum += data[i];
            }
            const average = sum / data.length;
            const normalizedAverage = average / 256;
            console.log("DataLength :", data.length,"Average volume:", average, "Normalized average:", normalizedAverage);
            if (normalizedAverage < silenceThreshold) {
                if (!silenceTimeoutRef.current) {
                    silenceTimeoutRef.current = setTimeout(() => {
                        console.log("Silence detected, stopping recording");
                        stopAudioRecording(stream); // Stop recording
                        silenceTimeoutRef.current = null;
                    }, silenceDuration);
                }
            } else {
                clearSilenceTimeout();
            }
    
            // Continue the loop
            requestAnimationFrame(checkSilence);
        };
    
        checkSilence(); // Start the loop
    };

    const clearSilenceTimeout = () => {
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
        }
    };

    // Function to stop audio recording
    const stopAudioRecording = useCallback((stream: MediaStream) => {
        if (RTCRecorderRef.current && !isProcessingStop) {
            RTCRecorderRef.current.stopRecording(() => {
                const blob = RTCRecorderRef.current?.getBlob();
                if (blob) {
                    setIsProcessingStop(true);
                    console.log('Audio data collected:', blob.size);
                    saveAudioLocally(blob, 'recorded_audio.ogg');
                    sendAudioToBackend(blob)
                        .then(handleApiResponse)
                        .catch(error => {
                            console.error('Error sending audio to backend:', error);
                            setError('Failed to send audio to backend');
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
        stream.getTracks().forEach(track => track.stop());
    }, [isProcessingStop]);

    // Use useCallback for the main recognition logic
    const setupRecognition = useCallback(() => {
        if ('webkitSpeechRecognition' in window) {
            recognitionRef.current = new webkitSpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'en-US';

            recognitionRef.current.onstart = () => {
                setIsListening(true);
                setError(null);
            };

            recognitionRef.current.onresult = (event) => {
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
                    console.log('Target word detected! Stopping recognition and starting recording.');
                    if (recognitionRef.current) {
                        recognitionRef.current.stop();
                        setIsListening(false);
                    }
                    navigator.mediaDevices.getUserMedia({
                        audio: {
                            noiseSuppression: true, // Enable noise suppression
                            echoCancellation: true, // Optional: Reduce echo
                        },
                    })
                    .then(stream => {
                        handleAudioRecording(stream); // Pass stream
                    })
                    .catch(err => {
                        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                        setError(`Error starting recording after target word: ${errorMessage}`);
                        console.error("Error starting recording after target word:", err);
                    });
                }
            };

            recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
                let errorMessage = 'An unknown error occurred.';
                switch (event.error) {
                    case 'no-speech':
                        errorMessage = 'No speech was detected.';
                        break;
                    case 'aborted':
                        errorMessage = 'Speech input was aborted.';
                        break;
                    case 'audio-capture':
                        errorMessage = 'Failed to capture audio.';
                        break;
                    case 'network':
                        errorMessage = 'A network error occurred.';
                        break;
                    case 'not-allowed':
                        errorMessage = 'Permission to access the microphone was denied.';
                        break;
                    case 'bad-grammar':
                        errorMessage = 'Invalid grammar was specified.';
                        break;
                    default:
                        errorMessage = `An error occurred: ${event.error}`;
                }
                setError(errorMessage);
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
                setInterimTranscript('');
            };
        } else {
            setError('Web Speech API is not supported in this browser.');
        }
    }, [handleAudioRecording, targetWord]);

    // Initialize recognition on component mount
    useEffect(() => {
        setupRecognition();
        return () => {
        // Clean up speech recognition
        if (recognitionRef.current) {
            recognitionRef.current.onstart = null;
            recognitionRef.current.onresult = null;
            recognitionRef.current.onerror = null;
            recognitionRef.current.onend = null;
        }

        // Clean up RecordRTC
        if (RTCRecorderRef.current) {
            RTCRecorderRef.current.stopRecording(() => {
                RTCRecorderRef.current?.destroy();
                RTCRecorderRef.current = null;
            });
        }

        // Clean up audio context
        if (audioContextRef.current?.state !== 'closed') {
            audioContextRef.current?.close().catch(e => 
                console.error("Error closing audio context:", e)
            );
            audioContextRef.current = null;
        }

        // Clean up silence detection
        silenceDetectionActiveRef.current = false;
        clearSilenceTimeout();
        };
    }, [setupRecognition]);

    // Start/Stop recognition
    const toggleRecognition = () => {
        if (recognitionRef.current) {
            if (isListening) {
                recognitionRef.current.stop();
                setIsListening(false);
            } else {
                setTranscript('');
                setInterimTranscript('');
                if (recognitionRef.current && !isListening) {
                    recognitionRef.current.start();
                    setIsListening(true);
                }
            }
        }
    };

    // Calculate word count whenever transcript or targetWord changes
    useEffect(() => {
        const fullTranscript = (transcript + ' ' + interimTranscript).trim();
        const lowerCaseTranscript = fullTranscript.toLowerCase();
        const lowerCaseTargetWord = targetWord.toLowerCase();
        const targetWords = lowerCaseTargetWord.split(' ');
        let count = 0;

        if (targetWords.length === 1) {
            const words = lowerCaseTranscript.split(/\s+/);
            for (const word of words) {
                if (word === lowerCaseTargetWord) {
                    count++;
                }
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

            <div className="mb-4">
                <Button
                    onClick={toggleRecognition}
                    variant={isListening ? 'destructive' : 'default'}
                    size="lg"
                >
                    {isListening ? 'Stop Listening' : 'Start Listening'}
                </Button>
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
            {isRecording && <p className="text-red-500">Recording audio...</p>}
        </div>
    );
};

export default RealTimeTranslatorApp;