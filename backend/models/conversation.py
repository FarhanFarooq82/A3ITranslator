from pydantic import BaseModel
from typing import List, Dict, Optional, Union

class ConversationItem(BaseModel):
    text: str
    language: str
    speaker: str
    timestamp: str
    type: str  # 'transcription' or 'translation'

class ConversationSummary(BaseModel):
    topics: List[str]
    keyDecisions: List[str]
    domainTerms: List[str]
    timeRange: Dict[str, str]
    messageCount: int
    tokenEstimate: int

class BackendContext(BaseModel):
    recentMessages: List[ConversationItem]
    conversationSummary: Optional[ConversationSummary]
    sessionInfo: Dict[str, Union[int, str]]
    tokenEstimate: int

class ComprehensiveAudioResult(BaseModel):
    transcription: str
    spoken_language: str
    intent: str  # 'translation' or 'assistant_query'
    intent_confidence: float
    detected_domain: Optional[str] = None
    conversation_tone: Optional[str] = None
    translation: Optional[Dict] = None
    expert_response: Optional[Dict] = None

class SyncConversationRequest(BaseModel):
    sessionId: str
    conversation: List[ConversationItem]
    timestamp: int
