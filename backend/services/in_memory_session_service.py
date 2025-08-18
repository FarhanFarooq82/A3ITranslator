# In-Memory Session Service for A3I Translator
# Handles session-scoped conversation memory and context management

import json
import uuid
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pathlib import Path
import logging

# Import the Gemini service
from .gemini_service import get_gemini_client

logger = logging.getLogger(__name__)

class InMemorySessionService:
    def __init__(self, export_directory: str = "conversation_exports"):
        self.sessions: Dict[str, Dict] = {}  # session_id -> session_data
        self.export_dir = Path(export_directory)
        self.export_dir.mkdir(exist_ok=True)
        self.lock = threading.RLock()  # Thread-safe operations
        
        # Session configuration
        self.max_session_duration = timedelta(hours=4)  # Auto-cleanup after 4 hours
        self.cleanup_interval = timedelta(minutes=30)   # Check every 30 minutes
        self.max_context_messages = 15    # Maximum context messages for LLM
        self.sliding_window_minutes = 30  # 30 minute sliding window
        
        # Start cleanup thread
        self._start_cleanup_thread()
    
    def create_session(
        self, 
        main_language: str, 
        other_language: str, 
        is_premium: bool = False
    ) -> str:
        """Create a new in-memory session"""
        session_id = str(uuid.uuid4())
        
        with self.lock:
            self.sessions[session_id] = {
                "session_id": session_id,
                "main_language": main_language,
                "other_language": other_language,
                "is_premium": is_premium,
                "created_at": datetime.now(),
                "last_activity": datetime.now(),
                "messages": [],  # List of conversation messages
                "memory_facts": {},  # Dictionary of extracted facts
                "context_references": [],  # List of message references
                "message_count": 0,
                "facts_count": 0
            }
        
        logger.info(f"Created in-memory session: {session_id}")
        return session_id
    
    def add_message(
        self,
        session_id: str,
        speaker: str,
        text: str,
        language: str,
        message_type: str,
        interaction_id: Optional[str] = None
    ) -> Optional[Dict]:
        """Add message to session (fact extraction handled by comprehensive AI processing)"""
        with self.lock:
            if session_id not in self.sessions:
                logger.warning(f"Session {session_id} not found")
                return None
            
            session = self.sessions[session_id]
            message_id = len(session["messages"])
            
            # Auto-extract facts if enabled
            # Note: Fact extraction now handled by comprehensive AI response processing
            # extracted_facts = [] (no longer needed since facts come from Gemini JSON)
            
            # Create message object
            message = {
                "id": message_id,
                "speaker": speaker,
                "text": text,
                "language": language,
                "type": message_type,
                "timestamp": datetime.now().isoformat(),
                "interaction_id": interaction_id
            }
            
            # Add to session
            session["messages"].append(message)
            session["last_activity"] = datetime.now()
            session["message_count"] += 1
            
            logger.info(f"Added message to session {session_id}: {len(text)} chars (facts managed by comprehensive AI processing)")
            return message
    
    def get_session_context(self, session_id: str, max_messages: int = None) -> Dict[str, Any]:
        """Get session context for AI processing"""
        if max_messages is None:
            max_messages = self.max_context_messages
            
        with self.lock:
            if session_id not in self.sessions:
                return {
                    "messages": [],
                    "memory_facts": {},
                    "session_info": {},
                    "context_analysis": {"exists": False}
                }
            
            session = self.sessions[session_id]
            
            # Get recent messages (sliding window)
            cutoff_time = datetime.now() - timedelta(minutes=self.sliding_window_minutes)
            recent_messages = []
            
            for msg in session["messages"]:
                msg_time = datetime.fromisoformat(msg["timestamp"])
                if msg_time > cutoff_time:
                    recent_messages.append(msg)
            
            # Limit to max_messages most recent
            recent_messages = recent_messages[-max_messages:] if recent_messages else []
            
            # Session statistics
            session_info = {
                "session_id": session_id,
                "duration_minutes": (datetime.now() - session["created_at"]).total_seconds() / 60,
                "message_count": session["message_count"],
                "facts_count": session["facts_count"],
                "languages": [session["main_language"], session["other_language"]],
                "last_activity": session["last_activity"].isoformat(),
                "is_premium": session["is_premium"]
            }
            
            return {
                "messages": recent_messages,
                "memory_facts": session["memory_facts"],
                "session_info": session_info,
                "context_analysis": {"exists": True, "message_count": len(recent_messages)}
            }
    
    def search_memory_facts(
        self, 
        session_id: str, 
        query_terms: List[str]
    ) -> List[Dict]:
        """Search memory facts for relevant information"""
        with self.lock:
            if session_id not in self.sessions:
                return []
            
            session = self.sessions[session_id]
            memory_facts = session["memory_facts"]
            
            if not memory_facts or not query_terms:
                return []
            
            # Simple text matching across fact values and keys
            matching_facts = []
            for fact_key, fact_data in memory_facts.items():
                fact_text = f"{fact_data.get('fact_key', '')} {fact_data.get('fact_value', '')} {fact_data.get('extracted_from', '')}".lower()
                
                if any(term.lower() in fact_text for term in query_terms):
                    matching_facts.append(fact_data)
            
            # Sort by timestamp (most recent first)
            matching_facts.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            
            return matching_facts[:10]  # Return top 10 matches
    
    def get_translation_context(self, session_id: str, text_to_translate: str) -> str:
        """Get optimal context for translation prompts (facts + recent messages)"""
        with self.lock:
            if session_id not in self.sessions:
                return ""
            
            session = self.sessions[session_id]
            
            # Get recent conversation messages (last 3-4 messages for immediate context)
            recent_messages = []
            if session["messages"]:
                for msg in session["messages"][-4:]:
                    recent_messages.append(f"{msg['speaker']}: {msg['text'][:100]}")
            
            # Get relevant facts from session memory
            session_facts = list(session["memory_facts"].values())
            
            # Build context combining recent messages and facts
            context_parts = []
            
            # Add recent conversation context
            if recent_messages:
                recent_context = " | ".join(recent_messages[-2:])  # Last 2 messages
                context_parts.append(f"Recent: {recent_context}")
            
            # Add facts-based context
            if session_facts:
                # Group facts by type
                fact_groups = {}
                for fact in session_facts:
                    fact_type = fact.get('fact_type', 'other')
                    if fact_type not in fact_groups:
                        fact_groups[fact_type] = []
                    fact_groups[fact_type].append(fact)
                
                # Add personal/relationship context
                personal_facts = fact_groups.get('personal_info', []) + fact_groups.get('relationships', [])
                if personal_facts:
                    personal_context = []
                    for fact in personal_facts[:3]:  # Max 3 personal facts
                        fact_key = fact.get('fact_key', 'unknown')
                        fact_value = fact.get('fact_value', 'unknown')
                        personal_context.append(f"{fact_key}: {fact_value}")
                    if personal_context:
                        context_parts.append(f"Personal: {' | '.join(personal_context)}")
                
                # Add other relevant fact types
                for fact_type in ['locations', 'professional', 'preferences']:
                    if fact_type in fact_groups:
                        type_context = []
                        for fact in fact_groups[fact_type][:2]:  # Max 2 facts per type
                            fact_key = fact.get('fact_key', 'unknown')
                            fact_value = fact.get('fact_value', 'unknown')
                            type_context.append(f"{fact_key}: {fact_value}")
                        if type_context:
                            context_parts.append(f"{fact_type.title()}: {' | '.join(type_context)}")
            
            # Format final context
            if context_parts:
                context = f"CONTEXT: {' • '.join(context_parts[:4])}"  # Max 4 context categories
                return f"{context}\nINSTRUCTION: Use this context to resolve pronouns, clarify references, and maintain conversational flow."
            
            return ""
    
    def get_ai_assistant_context(self, session_id: str, query: str) -> str:
        """Get context for AI assistant queries (primarily facts-based)"""
        with self.lock:
            if session_id not in self.sessions:
                return ""
            
            session = self.sessions[session_id]
            
            # For AI assistant, search relevant facts based on query
            query_terms = query.lower().split()
            relevant_facts = self.search_memory_facts(session_id, query_terms)
            
            if not relevant_facts:
                # If no specific relevant facts, provide a summary of all recent facts
                all_facts = list(session["memory_facts"].values())
                if all_facts:
                    # Get most recent facts (last 5)
                    recent_facts = sorted(all_facts, key=lambda x: x.get('timestamp', ''), reverse=True)[:5]
                    return self._format_facts_context(recent_facts, "Recent conversation facts")
                return ""
            
            return self._format_facts_context(relevant_facts[:5], "Relevant facts")
    
    def _format_facts_context(self, facts: List[Dict], context_label: str) -> str:
        """Format facts into a clean context string for AI processing"""
        if not facts:
            return ""
        
        # Group facts by type for better organization
        fact_groups = {}
        for fact in facts:
            fact_type = fact.get('fact_type', 'other')
            if fact_type not in fact_groups:
                fact_groups[fact_type] = []
            fact_groups[fact_type].append(fact)
        
        # Format each group
        context_parts = []
        for fact_type, type_facts in fact_groups.items():
            if len(type_facts) > 0:
                fact_strings = []
                for fact in type_facts[:3]:  # Max 3 facts per type
                    fact_key = fact.get('fact_key', 'unknown')
                    fact_value = fact.get('fact_value', 'unknown')
                    speaker = fact.get('speaker', 'unknown')
                    fact_strings.append(f"{fact_key}: {fact_value} (mentioned by {speaker})")
                context_parts.append(f"{fact_type.replace('_', ' ').title()}: {' | '.join(fact_strings)}")
        
        if context_parts:
            return f"{context_label.upper()}: {' • '.join(context_parts)}"
        
        return ""
    
    def get_comprehensive_session_context(self, session_id: str, query: str = "") -> Dict[str, Any]:
        """Get comprehensive context including facts, messages, and session info for enhanced AI processing"""
        with self.lock:
            if session_id not in self.sessions:
                return {"exists": False}
            
            session = self.sessions[session_id]
            
            # Get basic session context
            basic_context = self.get_session_context(session_id)
            
            # Get facts summary
            all_facts = list(session["memory_facts"].values())
            facts_summary = {}
            
            if all_facts:
                # Categorize facts
                for fact in all_facts:
                    fact_type = fact.get('fact_type', 'other')
                    if fact_type not in facts_summary:
                        facts_summary[fact_type] = []
                    facts_summary[fact_type].append({
                        'key': fact.get('fact_key', ''),
                        'value': fact.get('fact_value', ''),
                        'speaker': fact.get('speaker', ''),
                        'confidence': fact.get('confidence', 0),
                        'timestamp': fact.get('timestamp', '')
                    })
                
                # Sort each category by timestamp (most recent first)
                for fact_type in facts_summary:
                    facts_summary[fact_type].sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            
            # Enhanced context for AI
            enhanced_context = {
                **basic_context,
                "facts_summary": facts_summary,
                "formatted_context": self.get_ai_assistant_context(session_id, query),
                "total_facts_by_type": {fact_type: len(facts) for fact_type, facts in facts_summary.items()},
                "session_languages": [session["main_language"], session["other_language"]],
                "conversation_flow": self._get_conversation_flow_summary(session_id)
            }
            
            return enhanced_context
    
    def _get_conversation_flow_summary(self, session_id: str) -> Dict[str, Any]:
        """Get a summary of conversation flow patterns"""
        if session_id not in self.sessions:
            return {}
        
        session = self.sessions[session_id]
        messages = session["messages"]
        
        if not messages:
            return {"message_count": 0}
        
        # Analyze conversation patterns
        speakers = {}
        message_types = {}
        languages = {}
        
        for msg in messages:
            # Count speakers
            speaker = msg.get('speaker', 'unknown')
            speakers[speaker] = speakers.get(speaker, 0) + 1
            
            # Count message types
            msg_type = msg.get('type', 'unknown')
            message_types[msg_type] = message_types.get(msg_type, 0) + 1
            
            # Count languages
            language = msg.get('language', 'unknown')
            languages[language] = languages.get(language, 0) + 1
        
        return {
            "message_count": len(messages),
            "speakers": speakers,
            "message_types": message_types,
            "languages_used": languages,
            "duration_minutes": (datetime.now() - session["created_at"]).total_seconds() / 60,
            "most_active_speaker": max(speakers.items(), key=lambda x: x[1])[0] if speakers else None,
            "primary_language": max(languages.items(), key=lambda x: x[1])[0] if languages else None
        }
    
    def build_enhanced_prompt(
        self, 
        session_id: str, 
        base_prompt: str, 
        current_text: str = "", 
        prompt_type: str = "translation"
    ) -> str:
        """Build enhanced prompt with session context for Gemini AI"""
        
        # Get appropriate context based on prompt type
        if prompt_type == "translation":
            context = self.get_translation_context(session_id, current_text)
        elif prompt_type == "ai_assistant":
            context = self.get_ai_assistant_context(session_id, current_text)
        else:
            # Generic context
            context = self.format_context_for_llm(session_id, current_text)
        
        # Handle session_context placeholder in the base prompt
        session_context_text = context if context else "No previous conversation context"
        
        # Format the base prompt with session context if it contains the placeholder
        if "{session_context}" in base_prompt:
            formatted_base_prompt = base_prompt.format(session_context=session_context_text)
        else:
            formatted_base_prompt = base_prompt
        
        # Build final enhanced prompt
        if current_text:
            enhanced_prompt = f"{formatted_base_prompt}\n\nUser Input: {current_text}"
        else:
            enhanced_prompt = formatted_base_prompt
        
        return enhanced_prompt
    
    def process_user_input(
        self,
        session_id: str,
        user_text: str,
        speaker: str,
        language: str,
        message_type: str = "user_input"
    ) -> Dict[str, Any]:
        """Process user input: store message + extract facts + return context"""
        
        # Store the message and extract facts
        message = self.add_message(
            session_id=session_id,
            speaker=speaker,
            text=user_text,
            language=language,
            message_type=message_type
        )
        
        if not message:
            return {"success": False, "error": "Session not found"}
        
        # Get session context
        session_context = self.get_session_context(session_id)
        
        # Get specialized context for different use cases
        translation_context = self.get_translation_context(session_id, user_text)
        ai_context = self.get_ai_assistant_context(session_id, user_text)
        
        return {
            "success": True,
            "message": message,
            "session_context": session_context,
            "translation_context": translation_context,
            "ai_assistant_context": ai_context,
            "facts_extracted": len(message.get("extracted_facts", []))
        }
    
    def export_session_to_file(self, session_id: str) -> Optional[str]:
        """Export session to JSON file and remove from memory"""
        with self.lock:
            if session_id not in self.sessions:
                logger.warning(f"Session {session_id} not found for export")
                return None
            
            session = self.sessions[session_id]
            
            # Prepare export data
            export_data = {
                "session_metadata": {
                    "session_id": session_id,
                    "main_language": session["main_language"],
                    "other_language": session["other_language"],
                    "is_premium": session["is_premium"],
                    "created_at": session["created_at"].isoformat(),
                    "ended_at": datetime.now().isoformat(),
                    "duration_minutes": (datetime.now() - session["created_at"]).total_seconds() / 60,
                    "total_messages": session["message_count"],
                    "total_facts": session["facts_count"]
                },
                "conversation": session["messages"],
                "memory_facts": session["memory_facts"],
                "export_timestamp": datetime.now().isoformat(),
                "format_version": "2.0"
            }
            
            # Generate filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"conversation_{session_id}_{timestamp}.json"
            filepath = self.export_dir / filename
            
            try:
                # Write to file
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(export_data, f, indent=2, ensure_ascii=False)
                
                # Remove from memory
                del self.sessions[session_id]
                
                logger.info(f"Exported session {session_id} to {filename} and removed from memory")
                return str(filepath)
                
            except Exception as e:
                logger.error(f"Failed to export session {session_id}: {e}")
                return None
    
    def get_active_session_count(self) -> int:
        """Get number of active sessions"""
        with self.lock:
            return len(self.sessions)
    
    def cleanup_old_sessions(self) -> int:
        """Clean up sessions older than max duration"""
        with self.lock:
            current_time = datetime.now()
            expired_sessions = []
            
            for session_id, session_data in self.sessions.items():
                if current_time - session_data["last_activity"] > self.max_session_duration:
                    expired_sessions.append(session_id)
            
            # Export and remove expired sessions
            exported_count = 0
            for session_id in expired_sessions:
                if self.export_session_to_file(session_id):
                    exported_count += 1
            
            logger.info(f"Cleaned up {exported_count} expired sessions")
            return exported_count
    
    def format_context_for_llm(self, session_id: str, current_query: str = "") -> str:
        """Format session context for LLM processing with explicit usage instructions"""
        context = self.get_session_context(session_id)
        
        if not context["context_analysis"]["exists"]:
            return "No session context available. This is a new conversation."
        
        formatted_parts = []
        
        # Add explicit context usage instructions
        formatted_parts.append("🔍 CONTEXT USAGE INSTRUCTIONS:")
        formatted_parts.append("- Use names and relationships below for speaker identification")
        formatted_parts.append("- Apply facts for pronoun resolution and context understanding")
        formatted_parts.append("- Reference conversation history for continuity and accuracy")
        formatted_parts.append("- Cross-check new information against existing facts")
        formatted_parts.append("")
        
        # Add session info
        session_info = context["session_info"]
        formatted_parts.append(f"📊 SESSION OVERVIEW:")
        formatted_parts.append(f"   Duration: {session_info['duration_minutes']:.1f} minutes")
        formatted_parts.append(f"   Total Messages: {session_info['message_count']}, Known Facts: {session_info['facts_count']}")
        formatted_parts.append(f"   Languages: {' ↔ '.join(session_info['languages'])}")
        formatted_parts.append("")
        
        # Add comprehensive memory facts
        memory_facts = context["memory_facts"]
        if memory_facts:
            # Group facts by category for better organization
            fact_categories = {}
            for fact_data in memory_facts.values():
                category = fact_data.get('fact_type', 'general')
                if category not in fact_categories:
                    fact_categories[category] = []
                fact_categories[category].append(fact_data)
            
            formatted_parts.append("💾 KNOWN FACTS DATABASE:")
            for category, facts in fact_categories.items():
                if facts:
                    formatted_parts.append(f"   📋 {category.upper()}:")
                    for fact in facts[:4]:  # Max 4 facts per category
                        fact_key = fact.get('fact_key', 'unknown')
                        fact_value = fact.get('fact_value', 'unknown')
                        confidence = fact.get('confidence', 0.5)
                        formatted_parts.append(f"      • {fact_key}: {fact_value} (confidence: {confidence:.1f})")
            formatted_parts.append("")
        
        # Add speaker profiles if available
        speaker_profiles = {}
        for fact_data in memory_facts.values() if memory_facts else []:
            person = fact_data.get('person', 'unknown')
            if person != 'unknown' and person not in speaker_profiles:
                speaker_profiles[person] = []
            if person != 'unknown':
                speaker_profiles[person].append(fact_data)
        
        if speaker_profiles:
            formatted_parts.append("� KNOWN SPEAKERS:")
            for person, person_facts in speaker_profiles.items():
                fact_summary = []
                for fact in person_facts[:3]:  # Top 3 facts per person
                    fact_summary.append(f"{fact.get('fact_key', '')}: {fact.get('fact_value', '')}")
                if fact_summary:
                    formatted_parts.append(f"   • {person}: {' | '.join(fact_summary)}")
            formatted_parts.append("")
        
        # Add recent conversation with context markers
        messages = context["messages"]
        if messages:
            formatted_parts.append("🕐 RECENT CONVERSATION CONTEXT:")
            formatted_parts.append("   (Use this to understand references, pronouns, and conversational flow)")
            for msg in messages[-6:]:  # Last 6 messages for context
                type_emoji = {
                    'transcription': '🎤',
                    'translation': '🔄',
                    'ai_query': '❓',
                    'ai_response': '🤖'
                }.get(msg['type'], '💬')
                text_preview = msg['text'][:120] + "..." if len(msg['text']) > 120 else msg['text']
                formatted_parts.append(f"   {type_emoji} {msg['speaker']}: {text_preview}")
            formatted_parts.append("")
        
        # Add current query context if provided
        if current_query:
            formatted_parts.append("🎯 CURRENT PROCESSING:")
            formatted_parts.append(f"   Input: {current_query[:200]}")
            formatted_parts.append("   ⚠️  IMPORTANT: Use the above context to process this input accurately!")
        
        return "\n".join(formatted_parts)
    
    def _start_cleanup_thread(self):
        """Start background thread for periodic cleanup"""
        def cleanup_worker():
            import time
            while True:
                try:
                    time.sleep(self.cleanup_interval.total_seconds())
                    self.cleanup_old_sessions()
                except Exception as e:
                    logger.error(f"Error in cleanup thread: {e}")
        
        cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
        cleanup_thread.start()
        logger.info("Started background cleanup thread")

    # ==============================================
    # COMPREHENSIVE FACT MANAGEMENT METHODS
    # ==============================================
    
    def get_session_facts(self, session_id: str) -> List[Dict]:
        """Get all facts for a session"""
        with self.lock:
            session = self.sessions.get(session_id)
            if not session:
                return []
            return list(session["memory_facts"].values())
    
    # ===============================================
    # DEDICATED FACT MANAGEMENT METHODS
    # ===============================================
    # These methods handle fact storage, validation,
    # correction, and lifecycle management
    
    def add_session_fact(self, session_id: str, fact: Dict) -> bool:
        """Add a new fact to the session"""
        try:
            with self.lock:
                session = self.sessions.get(session_id)
                if not session:
                    logger.warning(f"Session {session_id} not found for fact addition")
                    return False
                
                fact_id = fact.get("fact_id")
                if not fact_id:
                    logger.warning("Fact missing fact_id")
                    return False
                
                # Add to memory_facts
                session["memory_facts"][fact_id] = fact
                session["facts_count"] = len(session["memory_facts"])
                session["last_activity"] = datetime.now()
                
                logger.info(f"Added fact {fact_id} to session {session_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error adding fact to session {session_id}: {e}")
            return False
    
    def endorse_fact(self, session_id: str, fact_id: str, boost: float = 0.1) -> bool:
        """Endorse an existing fact by boosting its confidence"""
        try:
            with self.lock:
                session = self.sessions.get(session_id)
                if not session:
                    return False
                
                fact = session["memory_facts"].get(fact_id)
                if not fact:
                    logger.warning(f"Fact {fact_id} not found for endorsement")
                    return False
                
                # Boost confidence (max 1.0)
                current_confidence = fact.get("confidence", 0.5)
                new_confidence = min(1.0, current_confidence + boost)
                fact["confidence"] = new_confidence
                
                # Increment endorsement count
                fact["endorsement_count"] = fact.get("endorsement_count", 1) + 1
                fact["last_updated"] = datetime.now().isoformat()
                
                session["last_activity"] = datetime.now()
                
                logger.info(f"Endorsed fact {fact_id}: confidence {current_confidence:.2f} -> {new_confidence:.2f}")
                return True
                
        except Exception as e:
            logger.error(f"Error endorsing fact {fact_id}: {e}")
            return False
    
    def correct_fact(self, session_id: str, fact_id: str, new_fact: Dict, correction_details: str = "") -> bool:
        """Correct an existing fact with new information"""
        try:
            with self.lock:
                session = self.sessions.get(session_id)
                if not session:
                    return False
                
                old_fact = session["memory_facts"].get(fact_id)
                if not old_fact:
                    logger.warning(f"Fact {fact_id} not found for correction")
                    return False
                
                # Preserve some original metadata
                new_fact["fact_id"] = fact_id
                new_fact["created_at"] = old_fact.get("created_at")
                new_fact["last_updated"] = datetime.now().isoformat()
                new_fact["correction_history"] = old_fact.get("correction_history", [])
                
                # Add correction record
                correction_record = {
                    "timestamp": datetime.now().isoformat(),
                    "old_text": old_fact.get("fact_text", ""),
                    "new_text": new_fact.get("fact_text", ""),
                    "details": correction_details
                }
                new_fact["correction_history"].append(correction_record)
                
                # Replace the fact
                session["memory_facts"][fact_id] = new_fact
                session["last_activity"] = datetime.now()
                
                logger.info(f"Corrected fact {fact_id}: {correction_details}")
                return True
                
        except Exception as e:
            logger.error(f"Error correcting fact {fact_id}: {e}")
            return False
    
    def delete_fact(self, session_id: str, fact_id: str, reason: str = "") -> bool:
        """Delete a fact from the session"""
        try:
            with self.lock:
                session = self.sessions.get(session_id)
                if not session:
                    return False
                
                if fact_id in session["memory_facts"]:
                    deleted_fact = session["memory_facts"].pop(fact_id)
                    session["facts_count"] = len(session["memory_facts"])
                    session["last_activity"] = datetime.now()
                    
                    # Log deletion
                    fact_text = deleted_fact.get("fact_text", "")[:50]
                    logger.info(f"Deleted fact {fact_id} ({fact_text}...): {reason}")
                    return True
                else:
                    logger.warning(f"Fact {fact_id} not found for deletion")
                    return False
                    
        except Exception as e:
            logger.error(f"Error deleting fact {fact_id}: {e}")
            return False
    
    def deduplicate_facts(self, session_id: str, target_fact_id: str, similar_fact: Dict) -> bool:
        """Merge two similar facts, keeping the higher confidence version"""
        try:
            with self.lock:
                session = self.sessions.get(session_id)
                if not session:
                    return False
                
                target_fact = session["memory_facts"].get(target_fact_id)
                if not target_fact:
                    logger.warning(f"Target fact {target_fact_id} not found for deduplication")
                    return False
                
                # Compare confidence levels
                target_confidence = target_fact.get("confidence", 0.5)
                similar_confidence = similar_fact.get("confidence", 0.5)
                
                if similar_confidence > target_confidence:
                    # Replace with higher confidence fact
                    similar_fact["fact_id"] = target_fact_id
                    similar_fact["created_at"] = target_fact.get("created_at")
                    similar_fact["last_updated"] = datetime.now().isoformat()
                    similar_fact["endorsement_count"] = (
                        target_fact.get("endorsement_count", 1) + 
                        similar_fact.get("endorsement_count", 1)
                    )
                    session["memory_facts"][target_fact_id] = similar_fact
                    logger.info(f"Deduplicated: replaced {target_fact_id} with higher confidence version")
                else:
                    # Boost existing fact's confidence and endorsement count
                    target_fact["confidence"] = min(1.0, target_confidence + 0.1)
                    target_fact["endorsement_count"] = target_fact.get("endorsement_count", 1) + 1
                    target_fact["last_updated"] = datetime.now().isoformat()
                    logger.info(f"Deduplicated: boosted confidence of {target_fact_id}")
                
                session["last_activity"] = datetime.now()
                return True
                
        except Exception as e:
            logger.error(f"Error deduplicating facts: {e}")
            return False

    def store_fact_directly(self, session_id: str, fact_id: str, fact_data: dict) -> bool:
        """Store a fact directly without extraction processing"""
        try:
            with self.lock:
                session = self.sessions.get(session_id)
                if not session:
                    logger.warning(f"Session {session_id} not found for direct fact storage")
                    return False
                
                # Store in memory_facts using the new structure
                session["memory_facts"][fact_id] = fact_data
                session["facts_count"] = len(session["memory_facts"])
                session["last_activity"] = datetime.now()
                
                logger.info(f"Stored fact {fact_id} directly in session {session_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error storing fact directly: {e}")
            return False

    # ===============================================
    # COMPREHENSIVE FACT PROCESSING METHODS
    # ===============================================
    # These methods handle advanced fact processing
    # including AI response integration and analysis
    
    def process_comprehensive_facts(self, response_json: dict, session_id: str) -> dict:
        """
        Process comprehensive fact management including extraction, deduplication, endorsement, and corrections
        
        Args:
            response_json: Validated JSON response from Gemini containing fact_management data
            session_id: Session ID for fact storage
            
        Returns:
            Updated response_json with processed fact management results
        """
        try:
            fact_management = response_json.get("fact_management", {})
            extracted_facts = fact_management.get("extracted_facts", [])
            fact_operations = fact_management.get("fact_operations", [])
            
            # Initialize counters
            stats = {
                "new_facts_added": 0,
                "facts_endorsed": 0,
                "facts_corrected": 0,
                "facts_deleted": 0
            }
            
            # Get existing session facts for comparison
            session_facts = self.get_session_facts(session_id)
            
            # Process each fact operation from LLM
            for operation in fact_operations:
                operation_type = operation.get("operation", "NEW")
                
                try:
                    if operation_type == "NEW":
                        # Add new fact
                        new_fact = operation.get("new_fact")
                        if new_fact and new_fact.get("fact_text"):
                            # Generate unique fact ID
                            fact_id = f"fact_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{len(session_facts)}"
                            new_fact["fact_id"] = fact_id
                            new_fact["endorsement_count"] = 1
                            new_fact["created_at"] = datetime.utcnow().isoformat()
                            new_fact["last_updated"] = datetime.utcnow().isoformat()
                            
                            # Store in session
                            self.add_session_fact(session_id, new_fact)
                            stats["new_facts_added"] += 1
                            logger.info(f"➕ Added new fact: {new_fact['fact_text'][:50]}...")
                    
                    elif operation_type == "ENDORSE":
                        # Endorse existing fact
                        target_fact_id = operation.get("target_fact_id")
                        endorsement_boost = operation.get("endorsement_boost", 0.1)
                        
                        if target_fact_id:
                            success = self.endorse_fact(session_id, target_fact_id, endorsement_boost)
                            if success:
                                stats["facts_endorsed"] += 1
                                logger.info(f"👍 Endorsed fact: {target_fact_id}")
                    
                    elif operation_type == "CORRECT":
                        # Correct existing fact
                        target_fact_id = operation.get("target_fact_id")
                        new_fact = operation.get("new_fact")
                        correction_details = operation.get("correction_details", "")
                        
                        if target_fact_id and new_fact:
                            success = self.correct_fact(session_id, target_fact_id, new_fact, correction_details)
                            if success:
                                stats["facts_corrected"] += 1
                                logger.info(f"✏️ Corrected fact: {target_fact_id}")
                    
                    elif operation_type == "DELETE":
                        # Delete fact
                        target_fact_id = operation.get("target_fact_id")
                        reason = operation.get("reason", "")
                        
                        if target_fact_id:
                            success = self.delete_fact(session_id, target_fact_id, reason)
                            if success:
                                stats["facts_deleted"] += 1
                                logger.info(f"🗑️ Deleted fact: {target_fact_id}")
                    
                    elif operation_type == "DEDUPLICATE":
                        # Handle deduplication (merge similar facts)
                        target_fact_id = operation.get("target_fact_id")
                        new_fact = operation.get("new_fact")
                        
                        if target_fact_id and new_fact:
                            # This combines the facts, keeping the highest confidence version
                            success = self.deduplicate_facts(session_id, target_fact_id, new_fact)
                            if success:
                                stats["facts_endorsed"] += 1  # Count as endorsement
                                logger.info(f"🔄 Deduplicated fact: {target_fact_id}")
                                
                except Exception as e:
                    logger.error(f"Error processing fact operation {operation_type}: {e}")
                    continue
            
            # Update session insights
            updated_session_facts = self.get_session_facts(session_id)
            total_facts = len(updated_session_facts)
            
            # Determine primary focus from recent facts
            primary_focus = self.determine_primary_focus(updated_session_facts, "general")
            
            # Update response with processing results
            response_json["fact_management"]["session_insights"] = {
                "total_facts": total_facts,
                "new_facts_added": stats["new_facts_added"],
                "facts_endorsed": stats["facts_endorsed"],
                "facts_corrected": stats["facts_corrected"],
                "facts_deleted": stats["facts_deleted"],
                "primary_focus": primary_focus
            }
            
            logger.info(f"📊 Fact processing complete: {stats}")
            return response_json
            
        except Exception as e:
            logger.error(f"Error in comprehensive fact processing: {e}")
            # Return response with error indication
            response_json.setdefault("fact_management", {})["session_insights"] = {
                "total_facts": 0,
                "new_facts_added": 0,
                "facts_endorsed": 0,
                "facts_corrected": 0,
                "facts_deleted": 0,
                "primary_focus": "processing_error"
            }
            return response_json

    def determine_primary_focus(self, session_facts: list, default_focus: str = "general") -> str:
        """Determine the primary focus of the conversation based on facts"""
        try:
            if not session_facts:
                return default_focus
            
            # Count fact categories
            categories = {}
            for fact in session_facts:
                category = fact.get("category", "other")
                categories[category] = categories.get(category, 0) + 1
            
            # Find most common category
            if categories:
                primary_category = max(categories.items(), key=lambda x: x[1])[0]
                
                # Map categories to meaningful focus areas
                focus_mapping = {
                    "personal": "personal_development",
                    "relationship": "family_relationships", 
                    "preference": "personal_preferences",
                    "event": "life_events",
                    "location": "places_and_travel",
                    "other": "general_conversation"
                }
                
                return focus_mapping.get(primary_category, "general_conversation")
            
            return default_focus
            
        except Exception as e:
            logger.error(f"Error determining primary focus: {e}")
            return "general_conversation"

    def add_message_with_fact_processing(
        self, 
        session_id: str, 
        speaker: str, 
        text: str, 
        language: str = "", 
        message_type: str = "conversation",
        response_json: dict = None
    ) -> bool:
        """
        Enhanced add_message that processes facts asynchronously after adding the message.
        This reduces latency by processing facts in background after response is sent.
        
        Args:
            session_id: Session identifier
            speaker: Speaker name (User, AI Assistant, Translator)
            text: Message content
            language: Language code
            message_type: Type of message (conversation, transcription, translation, ai_response)
            response_json: Complete response JSON for fact processing (optional)
            
        Returns:
            bool: Success status of message addition (fact processing happens in background)
        """
        try:
            # Add message immediately (synchronous, fast)
            message_success = self.add_message(
                session_id=session_id,
                speaker=speaker,
                text=text,
                language=language,
                message_type=message_type
            )
            
            # Process facts asynchronously if response_json provided (background, non-blocking)
            if message_success and response_json and response_json.get("fact_management"):
                def background_fact_processing():
                    """Background task for comprehensive fact processing"""
                    try:
                        logger.info(f"🚀 Starting background fact processing for session {session_id}")
                        processed_response = self.process_comprehensive_facts(response_json, session_id)
                        logger.info(f"✅ Background fact processing completed for session {session_id}")
                    except Exception as e:
                        logger.error(f"❌ Background fact processing failed for session {session_id}: {e}")
                
                # Start background thread (non-blocking)
                fact_thread = threading.Thread(target=background_fact_processing, daemon=True)
                fact_thread.start()
                logger.info(f"🎯 Initiated background fact processing for session {session_id}")
            
            return message_success
            
        except Exception as e:
            logger.error(f"Error in enhanced message addition: {e}")
            return False

# Global instance
in_memory_sessions = InMemorySessionService()
