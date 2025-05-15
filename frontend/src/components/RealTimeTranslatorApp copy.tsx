// import { useState, useEffect, useRef, useCallback } from 'react';
// import { AlertTriangle } from 'lucide-react';
// import { Message } from '../types/Message';
// import ConversationHistory from './ConversationHistory';
// import LanguageSelector from './LanguageSelector';
// import ControlButtons from './ControlButtons';
// import ReplayButton from './ReplayButton';
// import InstructionDisplay from './InstructionDisplay';

// const companyName = 'chai code';
// const translateWordDanish = 'Oversæt';

// const RealTimeTranslatorApp = () => {
//     const [primaryLanguage, setPrimaryLanguage] = useState('da-DK');
//     const [targetLanguage, setTargetLanguage] = useState('en-US');
//     const [isListeningForStart, setIsListeningForStart] = useState(false);
//     const [isRecording, setIsRecording] = useState(false);
//     const [transcriptions, setTranscriptions] = useState<Message[]>([]);
//     const [translations, setTranslations] = useState<Message[]>([]);
//     const audioStream = useRef<MediaStream | null>(null);
//     const mediaRecorder = useRef<MediaRecorder | null>(null);
//     const recognition = useRef<SpeechRecognition | null>(null);
//     const socket = useRef<WebSocket | null>(null);
//     const [error, setError] = useState<string | null>(null);
//     const [websocketConnected, setWebsocketConnected] = useState(false);

//     // ===============================
//     // WebSocket Connection
//     // ===============================

//       useEffect(() => {
//         // Function to set up WebSocket connection
//         const setupWebSocket = () => {

//             if (!socket.current || socket.current.readyState === WebSocket.CLOSED) {
//                 socket.current = new WebSocket('ws://localhost:8000/ws');

//                 const handleOpen = () => {
//                     console.log('WebSocket connection established');
//                     setWebsocketConnected(true);
//                     console.log(`WebSocket connection ${websocketConnected}`);
//                     setError(null);
//                 };

//                 const handleMessage = (event: MessageEvent) => {
//                     try {
//                         const data = JSON.parse(event.data);
//                         if (data.translation && data.original) {
//                             const newTranscription: Message = { text: data.original, timestamp: new Date().toLocaleTimeString() };
//                             const newTranslation: Message = { text: data.translation, timestamp: new Date().toLocaleTimeString() };

//                             setTranscriptions(prev => [...prev, newTranscription]);
//                             setTranslations(prev => [...prev, newTranslation]);
//                             speak(data.translation, targetLanguage);
//                         }
//                         if (data.error) {
//                             setError(data.error);
//                         }
//                     } catch (e) {
//                         console.error("Error parsing websocket message", e);
//                         setError(`Error parsing message from server: ${ e instanceof Error ? e.message : 'Unknown error'}`);
//                     }
//                 };

//                 const handleError = (event: Event) => {
//                     console.error('WebSocket error:', event);
//                     let errorMessage = 'WebSocket Error';
//                     if (event instanceof ErrorEvent) {
//                         errorMessage += `: ${event.message}`;
//                     }
//                     setError(errorMessage);
//                     setWebsocketConnected(false);
//                 };

//                 const handleClose = () => {
//                     console.log('WebSocket connection closed');
//                     setWebsocketConnected(false);
//                     // Attempt to reconnect after a delay
//                     setTimeout(setupWebSocket, 5000); // Try to reconnect after 5 seconds
//                 };

//                 if (socket.current) {
//                     socket.current.addEventListener('open', handleOpen);
//                     socket.current.addEventListener('message', handleMessage);
//                     socket.current.addEventListener('error', handleError);
//                     socket.current.addEventListener('close', handleClose);
//                 }
//             }
//         };

//         // Set up WebSocket connection
//         setupWebSocket();

//         // Cleanup function to close WebSocket connection and stop other processes
//         return () => {
//             if (socket.current) {
//                 socket.current.close();
//             }
//             stopMicrophone();
//             stopRecording();
//             stopListeningForTrigger();
//         };
//     }, [targetLanguage]); //  Removed websocketConnected

//     // ===============================
//     // Microphone Handling
//     // ===============================

//     const startMicrophone = useCallback(async () => {
//         try {
//             const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//             audioStream.current = stream;
//             setIsListeningForStart(true);
//             setError(null);
//             startListeningForTrigger();
//         } catch (error) {
//             console.error('Error accessing microphone:', error);
//             const errorMessage = error instanceof Error ? error.message : 'Unknown error';
//             setError(`Could not access microphone. Please check permissions. Error: ${errorMessage}`);
//         }
//     }, []);

//     const stopMicrophone = useCallback(() => {
//         if (audioStream.current) {
//             audioStream.current.getTracks().forEach(track => track.stop());
//             audioStream.current = null;
//             stopListeningForTrigger();
//             stopRecording();
//         }
//     }, []);

//     // ===============================
//     // Speech Recognition and Trigger Detection
//     // ===============================
//     const startListeningForTrigger = useCallback(() => {
//         if (recognition.current) {
//             recognition.current.stop();
//             recognition.current.onresult = null;
//             recognition.current.onerror = null;
//         }

//         recognition.current = new (SpeechRecognition || window.webkitSpeechRecognition)();
//         recognition.current.continuous = true;
//         recognition.current.interimResults = true;
//         recognition.current.lang = primaryLanguage;

//         recognition.current.onresult = (event) => {
//             let transcript = '';
//             for (let i = event.resultIndex; i < event.results.length; ++i) {
//                 transcript += event.results[i][0].transcript.toLowerCase();
//             }

//             if (transcript.includes(`ok ${companyName.toLowerCase()}`) && !isRecording) {
//                 setIsRecording(true);
//                 setIsListeningForStart(false);
//                 stopListeningForTrigger();
//                 startRecording();
//             } else if (transcript.includes(`${translateWordDanish.toLowerCase()} ${companyName.toLowerCase()}`) && isRecording) {
//                 stopRecording();
//                 setIsRecording(false);
//                 startListeningForTrigger();
//             }
//         };

//         recognition.current.onerror = (event) => {
//             console.error('Speech recognition error:', event.error);
//             setError(`Speech recognition error. Please try again. Error: ${event.message}`);
//             setIsListeningForStart(false);
//         };

//         recognition.current.start();
//     }, [primaryLanguage, isRecording, companyName, translateWordDanish]);

//     const stopListeningForTrigger = useCallback(() => {
//         if (recognition.current) {
//             recognition.current.stop();
//             recognition.current.onresult = null;
//             recognition.current.onerror = null;
//             recognition.current = null;
//         }
//     }, []);

//     // ===============================
//     // Audio Recording
//     // ===============================

//     const startRecording = useCallback(() => {
//         if (!audioStream.current) return;
//         mediaRecorder.current = new MediaRecorder(audioStream.current, { mimeType: 'audio/webm;codecs=opus' });
//         mediaRecorder.current.ondataavailable = (event) => {
//             if (event.data.size > 0 && socket.current && socket.current.readyState === WebSocket.OPEN) { //check the state
//                 socket.current.send(event.data);
//             }
//         };
//         mediaRecorder.current.start(100);
//     }, []);

//     const stopRecording = useCallback(() => {
//         if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
//             mediaRecorder.current.stop();
//             mediaRecorder.current.ondataavailable = null;
//         }
//     }, []);

//     // ===============================
//     // Text-to-Speech
//     // ===============================

//     const speak = (text: string, lang: string) => {
//         const utterance = new SpeechSynthesisUtterance(text);
//         utterance.lang = lang;
//         window.speechSynthesis.speak(utterance);
//     };

//     // ===============================
//     // Replay
//     // ===============================

//     const replayTranslation = () => {
//         if (translations.length > 0) {
//             speak(translations[translations.length - 1].text, targetLanguage);
//         }
//     };

//     // ===============================
//     // Render
//     // ===============================

//     return (
//         <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
//             <div className="max-w-4xl mx-auto">
//                 <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">
//                     Real-time Translator MVP
//                 </h1>

//                 {/* Language Selection */}
//                 <div className="flex flex-col md:flex-row gap-4 mb-6">
//                     <LanguageSelector
//                         label="Primary Language"
//                         value={primaryLanguage}
//                         onChange={setPrimaryLanguage}
//                         options={[
//                             {  value: 'ur-PK', label: 'Urdu' },
//                             // Add more primary languages as needed
//                         ]}
//                     />
//                     <LanguageSelector
//                         label="Target Language"
//                         value={targetLanguage}
//                         onChange={(value) => setTargetLanguage(value)}
//                         options={[
//                             { value: 'da-DK', label: 'Danish' },
//                             { value: 'en-US', label: 'English' },
//                             // Add more target languages
//                         ]}
//                     />
//                 </div>

//                 {/* Control Buttons */}
//                 <ControlButtons
//                     onStart={startMicrophone}
//                     onStop={stopMicrophone}
//                     isListening={isListeningForStart}
//                     isRecording={isRecording}
//                 />

//                 {/* Instruction Display */}
//                 <InstructionDisplay
//                     isListening={isListeningForStart}
//                     isRecording={isRecording}
//                     companyName={companyName}
//                     translateWordDanish={translateWordDanish}
//                 />

//                 {/* Error Message */}
//                 {error && (
//                     <div className="mb-4 p-4 bg-red-100 dark:bg-red-900 rounded-md border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 flex items-center">
//                         <AlertTriangle className="mr-2 h-5 w-5" />
//                         {error}
//                     </div>
//                 )}

//                 {/* Conversation History */}
//                 <ConversationHistory
//                     transcriptions={transcriptions}
//                     translations={translations}
//                     targetLanguage={targetLanguage}
//                 />

//                 {/* Replay Button */}
//                 <ReplayButton onReplay={replayTranslation} disabled={translations.length === 0} />
//             </div>
//         </div>
//     );
// };

// export default RealTimeTranslatorApp;