import React from 'react';
import { Button } from './ui/button';

interface SessionDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export const SessionDialog: React.FC<SessionDialogProps> = ({ onCancel, onConfirm }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
      <h2 className="text-lg font-semibold mb-4">End Session?</h2>
      <p className="mb-6">
        Are you sure you want to end the session? This will release the microphone and clear all data.
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="outline">
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="destructive">
          End Session
        </Button>
      </div>
    </div>
  </div>
);
