
import { Message } from "../types/Message";
import React from "react";
import { cn } from '../utils/cn';;


const MessageItem: React.FC<{ message: Message; isOriginal: boolean }> = ({ message, isOriginal }) => (
    <div className={cn(
        "mb-2 p-2 rounded-md",
        isOriginal
            ? "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
            : "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 border border-blue-200 dark:border-blue-800",
        "shadow-sm"
    )}>
        <p className="text-sm text-gray-500 dark:text-gray-400">[{message.timestamp}]</p>
        <p className="text-base">{message.text}</p>
    </div>
);

export default MessageItem;