import React from 'react';
import { Button } from './ui/button';

interface RecordingControlsProps {
  showPause: boolean;
  showUnpause: boolean;
  showClearRestart: boolean;
  isRecording: boolean;
  isPaused: boolean;
  handlePause: () => void;
  handleUnpause: () => void;
  handleClearRestart: () => void;
  handleManualTranslate: () => void;
}

// Component for recording control buttons (pause, unpause, clear/restart, translate)
const RecordingControls: React.FC<RecordingControlsProps> = ({
  showPause,
  showUnpause,
  showClearRestart,
  isRecording,
  isPaused,
  handlePause,
  handleUnpause,
  handleClearRestart,
  handleManualTranslate
}) => (
  <div className="flex gap-2 mb-4">
    {showPause && (
      <Button 
        variant="secondary" 
        onClick={handlePause} 
        title="Pause recording - this will release the microphone and remove current recording"
      >
        Pause
      </Button>
    )}
    {showUnpause && (
      <Button 
        variant="secondary" 
        onClick={handleUnpause} 
      >
        Unpause
      </Button>
    )}
    {showClearRestart && (
      <Button variant="outline" onClick={handleClearRestart}>Clear/Restart</Button>
    )}
    {isRecording && !isPaused && (
      <Button variant="default" onClick={handleManualTranslate}>Translate</Button>
    )}
  </div>
);

export default RecordingControls;
