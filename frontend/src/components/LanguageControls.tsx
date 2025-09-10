import React from 'react';
import { Button } from './ui/button';
import { ArrowLeftRight } from "lucide-react";
import LanguageSelector from './LanguageSelector';

interface LanguageControlsProps {
  mainLanguage: string;
  setMainLanguage: (lang: string) => void;
  otherLanguage: string;
  setOtherLanguage: (lang: string) => void;
  isPremium: boolean;
  setPremium: (isPremium: boolean) => void;
  swapLanguages: () => void;
}

// Component to control language selection and premium settings
const LanguageControls: React.FC<LanguageControlsProps> = ({ 
  mainLanguage, 
  setMainLanguage, 
  otherLanguage, 
  setOtherLanguage,
  isPremium,
  setPremium,
  swapLanguages 
}) => (
  <div className="flex flex-col md:flex-row gap-4 mb-6 items-center language-dropdown">
    <LanguageSelector
      label="Main Language:"
      value={mainLanguage}
      onChange={setMainLanguage}
    />
    <Button 
      onClick={swapLanguages}
      variant="outline"
      size="icon"
      className="rounded-full h-10 w-10 flex-shrink-0 mt-6"
      title="Swap languages"
    >
      <ArrowLeftRight className="h-5 w-5" />
    </Button>
    <LanguageSelector
      label="Target Language:"
      value={otherLanguage}
      onChange={setOtherLanguage}
    />
    <div className="flex items-center mt-3 md:mt-6 premium-checkbox">
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="premium-checkbox"
          checked={isPremium}
          onChange={(e) => setPremium(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="premium-checkbox" className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Premium
        </label>
      </div>
    </div>
  </div>
);

export default LanguageControls;
