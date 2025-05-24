import React from 'react';

interface ConversationMessage {
  text: string;
  language: string;
  speaker: string;
  timestamp: string;
}

interface ConversationHistoryProps {
  conversation: ConversationMessage[];
  mainLanguage: string;
  conversationEndRef: React.RefObject<HTMLDivElement>;
}

/**
 * Displays the conversation history, showing original transcriptions and translations.
 */
const ConversationHistory: React.FC<ConversationHistoryProps> = ({ conversation, mainLanguage, conversationEndRef }) => {
  // Only render the last N messages that fit in the area (estimate 1.5em per line)
  const maxLines = 8;
  const visible = conversation.slice(-maxLines);
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
  return (
    <div
      className="mb-4 w-full max-w-md border rounded bg-white flex flex-col justify-end"
      style={{
        height: '7.5em',
        minHeight: '7.5em',
        maxHeight: '7.5em',
        overflowY: 'hidden',
        fontSize: '0.9rem',
        fontFamily: 'monospace',
        padding: '0.5em 0.75em',
        background: '#f9fafb',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
        {visible.map((msg, idx) => (
          <div key={idx} style={{
            color: msg.language === mainLanguage ? '#2563eb' : '#059669',
            fontWeight: msg.language === mainLanguage ? 'bold' : 'normal',
            margin: 0,
            whiteSpace: 'pre-line',
            wordBreak: 'break-word',
          }}>
            <span style={{fontSize:'0.8em', color:'#888', marginRight:4}}>[{formatToLocalTime(msg.timestamp)}]</span>
            {msg.speaker}: {msg.text}
          </div>
        ))}
        <div ref={conversationEndRef} />
      </div>
    </div>
  );
};

export default ConversationHistory;