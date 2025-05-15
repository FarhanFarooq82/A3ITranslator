import { Message } from "../types/Message";
import React from "react";
import MessageItem from "./MessageItem"; // Adjust the path as needed

/**
 * Displays the conversation history, showing original transcriptions and translations.
 */
const ConversationHistory: React.FC<{
    transcriptions: Message[];
    translations: Message[];
    targetLanguage: string;
}> = ({ transcriptions, translations, targetLanguage }) => (
    <div className="flex flex-col gap-4">
        <div className="flex-1">
            <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">Danish (Original)</h3>
            <div className="overflow-y-auto max-h-60 border rounded-md p-2 bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800">
                {transcriptions.map((message, index) => (
                    <MessageItem key={`original-${index}`} message={message} isOriginal={true} />
                ))}
            </div>
        </div>
        <div className="flex-1">
            <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">
                {targetLanguage === 'en-US' ? 'English' : targetLanguage} (Translation)
            </h3>
            <div className="overflow-y-auto max-h-60 border rounded-md p-2 bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800">
                {translations.map((message, index) => (
                    <MessageItem key={`translation-${index}`} message={message} isOriginal={false} />
                ))}
            </div>
        </div>
    </div>
);

export default ConversationHistory;