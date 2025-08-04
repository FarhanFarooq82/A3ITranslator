import React from 'react';
import { Button } from './ui/button';

interface PauseDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export const PauseDialog: React.FC<PauseDialogProps> = ({ onCancel, onConfirm }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
      <h2 className="text-lg font-semibold mb-4">Pause Recording?</h2>
      <p className="mb-6">
        Are you sure you want to pause the recording? The microphone will be released and you'll need to start a new recording when you resume.
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="outline">
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="default">
          Pause Session
        </Button>
      </div>
    </div>
  </div>
);
