import React from 'react';
import { Button } from './ui/button';

/**
 * Provides buttons to start and stop the translation session.
 */
const ControlButtons: React.FC<{
  showRecord: boolean;
  showTranslate: boolean;
  onRecord: () => void;
  onTranslate: () => void;
}> = ({ showRecord, showTranslate, onRecord, onTranslate }) => (
  <div className="mb-4">
    {showRecord && (
      <Button type="button" onClick={onRecord} size="lg">
        Record
      </Button>
    )}
    {showTranslate && (
      <Button type="button" onClick={onTranslate} size="lg">
        Translate
      </Button>
    )}
  </div>
);

export default ControlButtons;