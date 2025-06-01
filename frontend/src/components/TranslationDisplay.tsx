import React from 'react';

interface TranslationDisplayProps {
  audioUrl: string | null;
  translation: string;
  isPlaying: boolean;
}

export const TranslationDisplay: React.FC<TranslationDisplayProps> = ({ audioUrl, translation, isPlaying }) => (
  <div className="space-y-4">
    {(audioUrl || isPlaying) && (
      <>
        <div>
          <h3 className="text-lg font-medium mb-2">Translation Audio</h3>
          <audio 
            controls 
            src={audioUrl} 
            className="w-full"
          ></audio>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-800 dark:text-gray-200">{translation}</p>
        </div>
      </>
    )}
  </div>
);
