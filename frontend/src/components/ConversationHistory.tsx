import React from 'react';
import { languages } from '../constants/languages';
import './ConversationHistory.css';

interface ConversationMessage {
  text: string;
  language: string;
  speaker: string;
  timestamp: string;
  type?: 'transcription' | 'translation' | 'ai_response'; // Enhanced type support
  // AI Response specific fields
  isDirectQuery?: boolean;
  aiResponse?: {
    answer_in_audio_language?: string;
    answer_translated?: string;
    answer_with_gestures?: string;
    confidence?: number;
    expertise_area?: string;
  };
  // Legacy support (deprecated)
  directResponse?: string;
  translation?: string;
  originalText?: string;
  targetLanguage?: string;
}

interface ConversationHistoryProps {
  conversation: ConversationMessage[];
  mainLanguage: string;
  conversationEndRef: React.RefObject<HTMLDivElement|null>;
}

// Create a language map from our languages constant
const staticLanguageMap: Record<string, string> = {};
// Initialize with static data from constants
languages.forEach(lang => {
  staticLanguageMap[lang.value] = lang.name;
  // Also add the base language code as a key
  const baseCode = lang.value.split('-')[0];
  if (!staticLanguageMap[baseCode]) {
    staticLanguageMap[baseCode] = lang.name.split(' ')[0]; // Just the language name without region
  }
});

/**
 * Displays the conversation history, showing original transcriptions and translations.
 */
const ConversationHistory: React.FC<ConversationHistoryProps> = ({ conversation, mainLanguage, conversationEndRef }) => {
  // Only render the last N messages that fit in the area (estimate 1.5em per line)
  // Show more lines since we're displaying both transcription and translation
  const maxLines = 20;
  const visible = conversation.slice(-maxLines * 2); // Double the capacity for paired messages

  // Get human-readable language name
  const getLanguageName = (languageCode: string) => {
    const lowerCode = languageCode.toLowerCase();
    
    // Check for exact match
    if (staticLanguageMap[lowerCode]) {
      return staticLanguageMap[lowerCode];
    }
    
    // Check for match with just the language part (e.g., 'en' from 'en-US')
    const baseLang = lowerCode.split('-')[0];
    if (staticLanguageMap[baseLang]) {
      return staticLanguageMap[baseLang];
    }
    
    // Return original if no match
    return languageCode;
  };

  // Get language flag for visual enhancement
  const getLanguageFlag = (languageCode: string): string => {
    const flags: { [key: string]: string } = {
      'en-US': '🇺🇸', 'en-GB': '🇬🇧', 'ur-PK': '🇵🇰', 'hi-IN': '🇮🇳',
      'ar-SA': '🇸🇦', 'fr-FR': '🇫🇷', 'es-ES': '🇪🇸', 'de-DE': '🇩🇪',
      'it-IT': '🇮🇹', 'pt-BR': '🇧🇷', 'ru-RU': '🇷🇺', 'ja-JP': '🇯🇵',
      'ko-KR': '🇰🇷', 'zh-CN': '🇨🇳', 'nl-NL': '🇳🇱', 'sv-SE': '🇸🇪',
      'da-DK': '🇩🇰', 'no-NO': '🇳🇴', 'fi-FI': '🇫🇮', 'pl-PL': '🇵🇱',
      'tr-TR': '🇹🇷', 'he-IL': '🇮🇱', 'th-TH': '🇹🇭', 'vi-VN': '🇻🇳',
      'id-ID': '🇮🇩', 'ms-MY': '🇲🇾', 'bn-BD': '🇧🇩', 'fa-IR': '🇮🇷'
    };
    return flags[languageCode] || '🌐';
  };

  // Detect if message is a question (simplified approach)
  const isQuestion = (message: ConversationMessage): boolean => {
    // Check if it's marked as an AI response type
    if (message.type === 'ai_response') {
      return false; // AI responses are not questions
    }
    
    // Check if message text contains question indicators
    if (message.text) {
      const text = message.text.toLowerCase();
      return text.includes('translator') ||
             message.text.includes('?') ||
             message.text.includes('؟') || // Arabic question mark
             message.text.includes('？'); // Japanese/Chinese question mark
    }
    
    return false;
  };

  // Enhanced color legend - three colors for different message types
  const legend = [
    { color: '#2563eb', label: `${getLanguageName(mainLanguage)} Messages` },
    { color: '#059669', label: 'Other Language Messages' },
    { color: '#f59e0b', label: 'Questions' },
    { color: '#10b981', label: 'AI Responses' }
  ];
  
  const formatToLocalTime = (isoOrTime: string) => {
    // If already in HH:MM:SS, just return
    if (/^\d{2}:\d{2}:\d{2}$/.test(isoOrTime)) return isoOrTime;
    // Try to parse as ISO and convert to local HH:MM:SS
    const date = new Date(isoOrTime);
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }
    // Fallback: return as is
    return isoOrTime;
  };

  // Generate a unique message ID to group transcription and translation
  const generateMessageId = (message: ConversationMessage) => {
    // Create a unique ID for each message based on speaker and approximate timestamp
    // This allows us to group transcription and translation that belong to the same utterance
    const time = new Date(message.timestamp).getTime();
    // Round to the nearest second to group messages that are very close in time
    const roundedTime = Math.round(time / 1000) * 1000;
    return `${message.speaker}-${roundedTime}`;
  };
  
  return (
    <div className="conversation-panel" style={{height: '22em', minHeight: '22em', maxHeight: '22em', overflowY: 'hidden', fontSize: '0.95rem', fontFamily: 'system-ui, sans-serif', padding: '0.8em 1em'}}>
      <div className="mb-2 p-2 bg-gray-50 rounded-md border border-gray-100 text-xs flex flex-wrap gap-4">
        {legend.map((item, idx) => (
          <div key={idx} style={{ color: item.color }} className="whitespace-nowrap font-medium flex items-center">
            <div style={{ backgroundColor: item.color, width: '8px', height: '8px', borderRadius: '50%', marginRight: '6px' }}></div>
            {item.label}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', overflowY: 'auto', paddingRight: '8px' }}>
        {(() => {
          // Group messages by audio/message ID (same speaker and close timestamp)
          const messageGroups: {[key: string]: ConversationMessage[]} = {};
          
          // First pass: group messages by speaker and approximate timestamp
          visible.forEach(msg => {
            const messageId = generateMessageId(msg);
            if (!messageGroups[messageId]) {
              messageGroups[messageId] = [];
            }
            messageGroups[messageId].push(msg);
          });
          
          // Convert to array of groups for rendering
          const groupsArray = Object.keys(messageGroups).map(groupId => {
            const messages = messageGroups[groupId];
            // Sort by type: transcription first, then translation
            const sortedMessages = [...messages].sort((a, b) => {
              const typeA = a.type || 'transcription';
              const typeB = b.type || 'transcription';
              return typeA === 'transcription' && typeB !== 'transcription' ? -1 : (
                typeA !== 'transcription' && typeB === 'transcription' ? 1 : 0
              );
            });
            
            // Use the first message as the representative for display properties
            const firstMsg = messages[0];
            return {
              id: groupId,
              messages: sortedMessages,
              speaker: firstMsg.speaker,
              timestamp: firstMsg.timestamp,
              language: firstMsg.language
            };
          });
          
          // Sort groups by timestamp
          const sortedGroups = groupsArray.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          
          // Now render each message group
          return sortedGroups.map((group, groupIdx) => {
            // Check if this group contains questions or AI responses
            const hasQuestion = group.messages.some(msg => isQuestion(msg));
            const hasAIResponse = group.messages.some(msg => msg.type === 'ai_response');
            
            const isMainLanguage = group.language === mainLanguage;
            let alignment = isMainLanguage ? 'flex-start' : 'flex-end';
            let color = isMainLanguage ? '#2563eb' : '#059669';
            let backgroundColor = isMainLanguage ? '#eef2ff' : '#ecfdf5';
            
            // Override colors for questions and AI responses
            if (hasAIResponse) {
              color = '#10b981';
              backgroundColor = '#ecfdf5';
              alignment = 'flex-start';
            } else if (hasQuestion) {
              color = '#f59e0b';
              backgroundColor = '#fffbeb';
              alignment = 'flex-start';
            }
            
            const languageName = getLanguageName(group.language);
            
            return (
              <React.Fragment key={group.id}>
                <div className={`message-bubble${isMainLanguage ? ' user' : ' ai'}`} style={{color, backgroundColor, alignSelf: alignment}}>
                  <div className="flex justify-between mb-1">
                    <span style={{fontSize:'0.8em', color:'#6b7280', fontWeight: 'bold'}}>
                      {hasAIResponse ? '🤖' : hasQuestion ? '❓' : '🎤'} {languageName}
                      {hasAIResponse && ' (AI Assistant)'}
                      {hasQuestion && !hasAIResponse && ' (Question)'}
                    </span>
                    <span className="timestamp">{formatToLocalTime(group.timestamp)}</span>
                  </div>
                  
                  {/* Enhanced message rendering with question and AI response support */}
                  {group.messages.map((msg, msgIdx) => {
                    const msgType = msg.type || 'transcription';
                    const msgIsQuestion = isQuestion(msg);
                    
                    return (
                      <div key={msgIdx} className="mb-1">
                        {/* Enhanced icons for different message types */}
                        {msgType === 'translation' && !msgIsQuestion && (
                          <span style={{fontSize: '0.8em', marginRight: '4px', color: '#666'}}>
                            🔄
                          </span>
                        )}
                        {msgType === 'ai_response' && (
                          <span style={{fontSize: '0.8em', marginRight: '4px', color: '#10b981'}}>
                            🤖
                          </span>
                        )}
                        {msgIsQuestion && msgType !== 'ai_response' && (
                          <span style={{fontSize: '0.8em', marginRight: '4px', color: '#f59e0b'}}>
                            ❓
                          </span>
                        )}
                        
                        {/* Enhanced text styling for different message types */}
                        <span style={{
                          color: msgType === 'ai_response' ? '#065f46' : 
                                 msgIsQuestion ? '#92400e' : '#1f2937',
                          fontWeight: msgIsQuestion || msgType === 'ai_response' ? '600' : 'normal',
                          fontSize: msgIsQuestion ? '1.05em' : '1em'
                        }}>
                          {/* Show AI response content appropriately */}
                          {msgType === 'ai_response' ? 
                            (msg.aiResponse?.answer_in_audio_language || msg.directResponse || msg.text) : 
                            msg.text
                          }
                        </span>
                        
                        {/* Show AI response translation if available */}
                        {msgType === 'ai_response' && msg.aiResponse?.answer_translated && (
                          <div style={{
                            marginTop: '0.5em',
                            paddingTop: '0.5em',
                            borderTop: '1px solid rgba(0,0,0,0.1)',
                            fontSize: '0.95em',
                            fontStyle: 'italic',
                            color: '#7c2d12'
                          }}>
                            <span style={{fontSize: '0.8em', marginRight: '4px', color: '#666'}}>
                              {getLanguageFlag(msg.targetLanguage || 'en-US')} Translation:
                            </span>
                            {msg.aiResponse.answer_translated}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Only show separator between different conversation turns */}
                {groupIdx < sortedGroups.length - 1 && 
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    margin: '0.5em 0'
                  }}>
                    <div style={{
                      flex: 1,
                      height: '1px', 
                      backgroundColor: '#e5e7eb'
                    }}></div>
                    <div style={{
                      fontSize: '0.7em',
                      color: '#9ca3af',
                      margin: '0 10px'
                    }}>
                      •
                    </div>
                    <div style={{
                      flex: 1,
                      height: '1px', 
                      backgroundColor: '#e5e7eb'
                    }}></div>
                  </div>
                }
              </React.Fragment>
            );
          });
        })()}
        <div ref={conversationEndRef} />
      </div>
    </div>
  );
};

export default ConversationHistory;