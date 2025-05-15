import React from "react";

/**
 * Displays instructions to the user based on the current state of the application.
 */
const InstructionDisplay: React.FC<{
    isListening: boolean;
    isRecording: boolean;
    companyName: string;
    translateWordDanish: string;
}> = ({ isListening, isRecording, companyName, translateWordDanish }) => {
    let message = '';
    if (!isListening && !isRecording) {
        message = "Click 'Start Session' to begin.";
    } else if (isListening) {
        message = `Say '**OK ${companyName}**' to start recording.`;
    } else if (isRecording) {
        message = `Recording... Say '**${translateWordDanish} ${companyName}**' to stop.`;
    } else {
        message = "Processing audio and translating...";
    }

    return (
        <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200">
            <p className="text-base font-medium">{message}</p>
        </div>
    );
};

export default InstructionDisplay;