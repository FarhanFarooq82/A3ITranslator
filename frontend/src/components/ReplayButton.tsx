import React from 'react';
import { Button } from './ui/button';
import { Play } from 'lucide-react';
import { cn } from '../utils/cn';

const ReplayButton: React.FC<{ onReplay: () => void; disabled: boolean }> = ({ onReplay, disabled }) => (
    <Button
        onClick={onReplay}
        disabled={disabled}
        className={cn(
            "px-4 py-2 font-semibold",
            disabled
                ? "bg-gray-400 dark:bg-gray-600 text-white cursor-not-allowed"
                : "bg-purple-500 hover:bg-purple-600 text-white"
        )}
    >
        <Play className="mr-2 h-4 w-4" />
        Replay Translation
    </Button>
);

export default ReplayButton;