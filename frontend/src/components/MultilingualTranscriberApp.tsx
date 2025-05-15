import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import LanguageSelector from './LanguageSelector';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle } from "lucide-react"

// Define the available languages (these should match your backend)
// const languages = [
//     { code: 'en-US', name: 'English (US)' },
//     { code: 'es-ES', name: 'Spanish (Spain)' },
//     { code: 'fr-FR', name: 'French (France)' },
//     { code: 'de-DE', name: 'German (Germany)' },
//     { code: 'zh-CN', name: 'Chinese (China)' },
// ];

// Audio recording and WebSocket sending logic
const useAudioAndWebSocket = (
    sourceLanguage: string,
    targetLanguage: string,
    setTranscription: React.Dispatch<React.SetStateAction<string>>, // Changed type here
    setIsSessionActive: (isActive: boolean) => void,
    setError: (message: string | null) => void // Add setError
) => {
    const ws = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    // Function to stop the WebSocket connection and audio recording
    const stopSession = useCallback(() => {
        setIsSessionActive(false);
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
        }
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
    }, [setIsSessionActive]);
    
    // Function to handle WebSocket messages
    const handleWebSocketMessage = useCallback((event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'transcription') {
                setTranscription((prev: string) => prev + data.text);
            } else if (data.type === 'error') {
                setError(data.message); // Set error message
                stopSession(); // Stop on error
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            setError("Error parsing server message.");
            stopSession();
        }
    }, [setTranscription, setError,stopSession ]);

    // Function to start the WebSocket connection and audio recording
    const startSession = useCallback(async () => {
        if (!sourceLanguage || !targetLanguage) {
            setError('Please select both source and target languages.');
            return;
        }
        setError(null); // Clear any previous errors
        setIsSessionActive(true);
        setTranscription(''); // Clear previous transcription

        // Initialize WebSocket connection
        try {
            ws.current = new WebSocket(`ws://localhost:8000/audio/?source_language=${sourceLanguage}&target_language=${targetLanguage}`); // Connect
            ws.current.onmessage = handleWebSocketMessage;
            ws.current.onclose = () => {
                console.log('WebSocket connection closed');
                setIsSessionActive(false);
            };
            ws.current.onerror = (event) => {
                console.error("WebSocket error:", event);
                setError("WebSocket connection error.");
                setIsSessionActive(false);
            };

            await new Promise(resolve => {
                if (ws.current?.readyState === WebSocket.OPEN) {
                    resolve(null);
                } else {
                    ws.current?.addEventListener('open', resolve);
                }
            });
        } catch (error) {
            console.error('Error connecting to WebSocket:', error);
            setError('Failed to connect to the server.');
            setIsSessionActive(false);
            return;
        }


        // Initialize media recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContextRef.current = new AudioContext();
            mediaRecorderRef.current = new MediaRecorder(stream);

            mediaRecorderRef.current.ondataavailable = async (event) => {
                if (event.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
                    try {
                        ws.current.send(event.data);
                    } catch (e) {
                        console.error("Error sending audio data:", e);
                        setError("Error sending audio data to server.");
                        stopSession();
                    }
                }
            };

            mediaRecorderRef.current.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
                audioContextRef.current?.close();
            };
            mediaRecorderRef.current.start(250); // Send data every 250ms

        } catch (error) {
            console.error('Error starting audio recording:', error);
            setError(`Error accessing microphone: ${(error as Error).message}`); // Set user-friendly message.
            setIsSessionActive(false);
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.close();
            }
        }
    }, [sourceLanguage, targetLanguage, handleWebSocketMessage, setIsSessionActive, setTranscription, setError, stopSession]);

    // Cleanup function to ensure resources are released
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current) {
                mediaRecorderRef.current.stop();
                mediaRecorderRef.current = null;
            }
            if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
        };
    }, []);

    return { startSession, stopSession };
};

// Main App Component
const MultilingualTranscriberApp = () => {
    const [sourceLanguage, setSourceLanguage] = useState<string>('');
    const [targetLanguage, setTargetLanguage] = useState<string>('');
    const [transcription, setTranscription] = useState<string>('');
    const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null); // State for error messages

    const { startSession, stopSession } = useAudioAndWebSocket(
        sourceLanguage,
        targetLanguage,
        setTranscription,
        setIsSessionActive,
        setError
    );

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start p-4">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Multilingual Transcriber</h1>

            {/* Language Selection Dropdowns */}
                           {/* Language Selection */}
                           <div className="flex space-x-4 mb-6 w-full max-w-md">
                    <LanguageSelector
                        label="Source Language"
                        value={sourceLanguage}
                        onChange={setSourceLanguage}
                        options={[
                            { value: 'da-DK', label: 'Danish' },
                            { value: 'en-US', label: 'English' },
                            { value: 'es-ES', label: 'Spanish' },
                            { value: 'fr-FR', label: 'French' },
                            { value: 'de-DE', label: 'German' },
                            { value: 'it-IT', label: 'Italian' },
                            { value: 'zh-CN', label: 'Chinese (Simplified)' },
                            { value: 'ja-JP', label: 'Japanese' },
                            { value: 'ko-KR', label: 'Korean' },
                            { value: 'ar-SV', label: 'Arabic' },
                            { value: 'ur-PK', label: 'urdu' },
                            // Add more primary languages as needed
                        ]}
                    />
                    <LanguageSelector
                        label="Target Language"
                        value={targetLanguage}
                        onChange={(value) => setTargetLanguage(value)}
                        options={[
                            { value: 'en-US', label: 'English' },
                            { value: 'da-DK', label: 'Danish' },
                            { value: 'en-UK', label: 'English(UK)' },
                            { value: 'es-ES', label: 'Spanish' },
                            { value: 'fr-FR', label: 'French' },
                            { value: 'de-DE', label: 'German' },
                            { value: 'it-IT', label: 'Italian' },
                            { value: 'zh-CN', label: 'Chinese (Simplified)' },
                            { value: 'ja-JP', label: 'Japanese' },
                            { value: 'ko-KR', label: 'Korean' },
                            { value: 'ru-RU', label: 'Russian' },
                            { value: 'ur-PK', label: 'urdu' },
                        ]}
                    />
                </div>

            {/* Start/Stop Session Button */}
            <div className="mb-6">
                {isSessionActive ? (
                    <Button onClick={stopSession} variant="destructive" size="lg">
                        Stop Session
                    </Button>
                ) : (
                    <Button onClick={startSession} variant="default" size="lg">
                        Start Session
                    </Button>
                )}
            </div>

            {/* Transcription Text Area */}
            <div className="w-full max-w-md">
                <Textarea
                    value={transcription}
                    readOnly
                    placeholder="Transcription will appear here..."
                    className="min-h-[200px] bg-gray-50 border-gray-300 text-gray-700"
                />
            </div>
            {/* Error message Alert */}
            {error && (
                <Alert variant="destructive" className="mt-4 w-full max-w-md">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
        </div>
    );
};

export default MultilingualTranscriberApp;
