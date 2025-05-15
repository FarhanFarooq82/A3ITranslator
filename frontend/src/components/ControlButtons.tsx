import React from 'react';
import { Button } from './ui/button';
import { Mic, StopCircle } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * Provides buttons to start and stop the translation session.
 */
const ControlButtons: React.FC<{
    onStart: () => void;
    onStop: () => void;
    isListening: boolean;
    isRecording: boolean;
}> = ({ onStart, onStop, isListening, isRecording }) => (
    <div className="flex gap-4">
        <Button
            onClick={onStart}
            disabled={isListening || isRecording}
            className={cn(
                "px-6 py-3 font-semibold text-lg",
                (isListening || isRecording)
                    ? "bg-gray-500 dark:bg-gray-700 text-white cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
            )}
        >
            {isListening ? (
                <>
                    <Mic className="mr-2 h-5 w-5 animate-pulse" />
                    Listening...
                </>
            ) : isRecording ? (
                <>
                    <Mic className="mr-2 h-5 w-5 animate-pulse" />
                    Recording...
                </>
            ) : (
                <>
                    <Mic className="mr-2 h-5 w-5" />
                    Start Session
                </>
            )}
        </Button>
        <Button
            onClick={onStop}
            disabled={!isListening && !isRecording}
            className={cn(
                "px-6 py-3 font-semibold text-lg",
                (!isListening && !isRecording)
                    ? "bg-gray-500 dark:bg-gray-700 text-white cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600 text-white"
            )}
        >
            <StopCircle className="mr-2 h-5 w-5" />
            Stop Session
        </Button>
    </div>
);

export default ControlButtons;