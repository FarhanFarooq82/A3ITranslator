import React from 'react';
import { languages } from '../constants/languages';

interface ConversationMessage {
  text: string;
  language: string;
  speaker: string;
  timestamp: string;
  type?: 'transcription' | 'translation'; // Make type optional for backward compatibility
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

  // Simplified color legend - only two colors
  const legend = [
    { color: '#2563eb', label: `${getLanguageName(mainLanguage)} Messages` },
    { color: '#059669', label: 'Other Language Messages' }
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
    <div
      className="mb-4 w-full max-w-xl border rounded-lg shadow-sm bg-white flex flex-col justify-end"
      style={{
        height: '22em',
        minHeight: '22em',
        maxHeight: '22em',
        overflowY: 'hidden',
        fontSize: '0.95rem',
        fontFamily: 'system-ui, sans-serif',
        padding: '0.8em 1em',
        background: '#f9fafb',
        borderColor: '#e5e7eb',
      }}
    >
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
            const isMainLanguage = group.language === mainLanguage;
            const alignment = isMainLanguage ? 'flex-start' : 'flex-end';
            const color = isMainLanguage ? '#2563eb' : '#059669';
            const languageName = getLanguageName(group.language);
            
            return (
              <React.Fragment key={group.id}>
                <div style={{
                  color,
                  margin: '0.6em 0',
                  padding: '0.8em 1em',
                  backgroundColor: isMainLanguage ? '#eef2ff' : '#ecfdf5',
                  borderRadius: '0.8rem',
                  borderTopLeftRadius: isMainLanguage ? '0' : '0.8rem',
                  borderTopRightRadius: isMainLanguage ? '0.8rem' : '0',
                  whiteSpace: 'pre-line',
                  wordBreak: 'break-word',
                  maxWidth: '85%',
                  alignSelf: alignment,
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                  borderLeft: isMainLanguage ? `3px solid ${color}` : 'none',
                  borderRight: isMainLanguage ? 'none' : `3px solid ${color}`
                }}>
                  <div className="flex justify-between mb-1">
                    <span style={{fontSize:'0.8em', color:'#6b7280', fontWeight: 'bold'}}>
                      🎤 {languageName}
                    </span>
                    <span style={{fontSize:'0.8em', color:'#6b7280'}}>
                      {formatToLocalTime(group.timestamp)}
                    </span>
                  </div>
                  
                  {/* Show transcription and translation without separators between them */}
                  {group.messages.map((msg, msgIdx) => {
                    const msgType = msg.type || 'transcription';
                    return (
                      <div key={msgIdx} className="mb-0">
                        {/* Add an icon only for translation */}
                        {msgType === 'translation' && (
                          <span style={{fontSize: '0.8em', marginRight: '4px', color: '#666'}}>
                            🔄
                          </span>
                        )}
                        <span style={{color: '#1f2937'}}>{msg.text}</span>
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