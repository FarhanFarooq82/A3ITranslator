from typing import List, Dict, Optional
from ..models.conversation import ConversationItem, ConversationSummary
import logging

logger = logging.getLogger(__name__)

def analyze_conversation_intent(text: str, conversation_context: List[ConversationItem]) -> Dict:
    """Analyze if input is a translation request or assistant query"""
    assistant_keywords = [
        'help', 'explain', 'what is', 'how to', 'why', 'question', 'advice',
        'recommend', 'suggest', 'tell me about', 'information', 'clarify'
    ]
    text_lower = text.lower()
    is_assistant_query = any(keyword in text_lower for keyword in assistant_keywords)
    if '?' in text or text_lower.startswith(('what', 'how', 'why', 'when', 'where', 'can you')):
        is_assistant_query = True
    intent = 'assistant_query' if is_assistant_query else 'translation'
    confidence = 0.8 if is_assistant_query else 0.9
    return {
        'intent': intent,
        'confidence': confidence,
        'detected_domain': 'general' if is_assistant_query else None,
        'conversation_tone': 'casual'
    }

def generate_conversation_summary(conversation: List[ConversationItem]) -> ConversationSummary:
    """Generate a summary of the conversation for context compression"""
    if not conversation:
        return ConversationSummary(
            topics=[],
            keyDecisions=[],
            domainTerms=[],
            timeRange={'start': '', 'end': ''},
            messageCount=0,
            tokenEstimate=0
        )
    topics = []
    domain_terms = []
    for item in conversation:
        words = item.text.split()
        topics.extend([word for word in words if len(word) > 5])
        domain_terms.extend([word for word in words if word.isupper() and len(word) > 2])
    topics = list(set(topics))[:10]
    domain_terms = list(set(domain_terms))[:10]
    time_range = {
        'start': conversation[0].timestamp,
        'end': conversation[-1].timestamp
    }
    total_text = ' '.join([item.text for item in conversation])
    token_estimate = len(total_text.split()) * 1.3
    return ConversationSummary(
        topics=topics,
        keyDecisions=[],
        domainTerms=domain_terms,
        timeRange=time_range,
        messageCount=len(conversation),
        tokenEstimate=int(token_estimate)
    )
