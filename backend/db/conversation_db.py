import sqlite3
import json
from typing import List, Dict, Optional
from ..models.conversation import ConversationItem, ConversationSummary

def init_conversation_db():
    """Initialize SQLite database for conversation storage"""
    conn = sqlite3.connect('conversations.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            session_id TEXT PRIMARY KEY,
            conversation_data TEXT,
            summary_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def get_conversation_from_db(session_id: str) -> Optional[Dict]:
    """Retrieve conversation from database"""
    conn = sqlite3.connect('conversations.db')
    cursor = conn.cursor()
    cursor.execute(
        'SELECT conversation_data, summary_data FROM conversations WHERE session_id = ?',
        (session_id,)
    )
    result = cursor.fetchone()
    conn.close()
    if result:
        conversation_data = json.loads(result[0]) if result[0] else []
        summary_data = json.loads(result[1]) if result[1] else None
        return {
            'conversation': conversation_data,
            'summary': summary_data
        }
    return None

def save_conversation_to_db(session_id: str, conversation: List[Dict], summary: Optional[Dict] = None):
    """Save conversation to database"""
    conn = sqlite3.connect('conversations.db')
    cursor = conn.cursor()
    conversation_json = json.dumps([c.dict() if hasattr(c, 'dict') else c for c in conversation])
    summary_json = json.dumps(summary.dict() if summary and hasattr(summary, 'dict') else summary) if summary else None
    cursor.execute('''
        INSERT OR REPLACE INTO conversations 
        (session_id, conversation_data, summary_data, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ''', (session_id, conversation_json, summary_json))
    conn.commit()
    conn.close()
