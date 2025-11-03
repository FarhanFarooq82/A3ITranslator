import React from 'react';
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { AlertCircle } from "lucide-react";

interface StatusDisplayProps {
  status: string;
  silenceCountdown: number | null;
  error: string | null;
}

// Component to display status messages, errors, and silence countdowns
const StatusDisplay: React.FC<StatusDisplayProps> = ({ status, silenceCountdown, error }) => (
  <>
    {error && (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )}

    {status && status.includes("No speech detected") && (
      <div className="py-2 px-4 bg-yellow-100 text-yellow-800 rounded-md mb-4">
        <span className="font-medium">Audio too quiet:</span> {status}
      </div>
    )}

    {status && !status.includes("No speech detected") && (
      <div className="text-gray-600 mb-4">
        {status}
        {silenceCountdown !== null && ` (${silenceCountdown})`}
      </div>
    )}
  </>
);

export default StatusDisplay;
