# main.py - FastAPI Backend for A3I Translator
# Clean modular architecture implementation

# --- Standard Library Imports ---
import json
import logging
import base64
import os
import uuid
import sqlite3
import re
import threading
from datetime import datetime, timedelta
from pathlib import Path
from functools import lru_cache
from typing import Dict, List, Optional, Union

# --- Third-Party Imports ---
import requests
import azure.cognitiveservices.speech as speechsdk
from fastapi import FastAPI, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from google.cloud import texttospeech_v1beta1 as texttospeech
from contextlib import asynccontextmanager

# --- Project Imports ---
from .models.conversation import ConversationItem, ConversationSummary, BackendContext, ComprehensiveAudioResult, SyncConversationRequest
from .db.conversation_db import init_conversation_db, get_conversation_from_db, save_conversation_to_db
from .services.in_memory_session_service import in_memory_sessions
from .services.azure_speech_language_service import AzureSpeechLanguageService
from .services.gemini_service import (
    get_gemini_client, 
    generate_gemini_content, 
    process_audio_with_gemini,
    translate_text_with_gemini,
    generate_expert_response_with_gemini
)
from .services.tts_service import synthesize_text_to_audio
from .utils.response_parser import fix_json_response, validate_and_fix_response, create_fallback_response
from .utils.ssml_utils import fix_ssml_content, process_text_to_ssml

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Environment Setup ---
env_path = Path(__file__).resolve().parent / '.env'
logger.info(f"Loading .env file from: {env_path}")
load_dotenv(dotenv_path=env_path)

logger.info(f"Environment variable GOOGLE_API_KEY exists: {'GOOGLE_API_KEY' in os.environ}")
logger.info(f"Environment variable PLAYAI_KEY exists: {'PLAYAI_KEY' in os.environ}")
logger.info(f"Environment variable PLAYAI_USER_ID exists: {'PLAYAI_USER_ID' in os.environ}")

# --- Global Service Instances ---
azure_speech_service: Optional[AzureSpeechLanguageService] = None

# --- FastAPI Lifespan Event ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan event to initialize Azure datasets on startup"""
    global azure_speech_service
    
    logger.info("=== FastAPI Startup: Initializing Azure Speech Language Service ===")
    
    try:
        # Check if Azure credentials are available before attempting initialization
        azure_key = os.environ.get("AZURE_SPEECH_KEY", "")
        azure_region = os.environ.get("AZURE_SPEECH_REGION", "")
        
        if not azure_key or not azure_region:
            logger.warning("⚠️ Azure Speech credentials not available, skipping Azure initialization")
            logger.info("💡 Will use fallback language data for MVP")
        else:
            # Initialize the Azure Speech Language Service
            azure_speech_service = AzureSpeechLanguageService()
            
            # Load datasets from Azure on startup
            await azure_speech_service.initialize_datasets_on_startup()
            
            # Log initialization success with stats
            stats = azure_speech_service.get_dataset_stats()
            logger.info(f"✅ Azure Speech datasets initialized successfully!")
            logger.info(f"📊 Loaded {stats['languages_count']} languages, {stats['voices_count']} voices")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize Azure Speech datasets: {e}", exc_info=True)
        # Continue startup even if Azure initialization fails (fallback data will be used)
        if azure_speech_service:
            logger.info("💡 Using fallback language data for MVP")
        else:
            logger.warning("⚠️ Azure service not initialized, using minimal fallback")
    
    logger.info("=== FastAPI Startup Complete ===")
    
    try:
        # Yield control to FastAPI (app runs here)
        yield
    except Exception as e:
        logger.error(f"Error during application lifespan: {e}", exc_info=True)
    finally:
        # Cleanup (if needed)
        logger.info("=== FastAPI Shutdown ===")

# --- FastAPI App Setup ---
app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration Constants ---
DEFAULT_TTS_LANGUAGE_CODE = 'da-DK'
DEFAULT_TTS_VOICE_GENDER = texttospeech.SsmlVoiceGender.SSML_VOICE_GENDER_UNSPECIFIED
DEFAULT_AUDIO_ENCODING = texttospeech.AudioEncoding.MP3
DEFAULT_AUDIO_MIME_TYPE = "audio/mp3"

# Model availability and retry configuration
MODEL_RETRY_DELAY = int(os.environ.get("MODEL_RETRY_DELAY", "60"))  # seconds
MODEL_CHECK_TIMEOUT = int(os.environ.get("MODEL_CHECK_TIMEOUT", "30"))  # seconds
ENABLE_MODEL_FALLBACK = os.environ.get("ENABLE_MODEL_FALLBACK", "true").lower() == "true"

# --- Environment Variables ---
google_api_key = os.environ.get("GOOGLE_API_KEY")
if not google_api_key:
    logger.error("GOOGLE_API_KEY environment variable not set - Gemini functionality will not work")
    # Don't raise error, let app start but with limited functionality

AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY", "")
if not AZURE_SPEECH_KEY:
    logger.warning("AZURE_SPEECH_KEY environment variable not set or empty in .env file")
    logger.info("TTS functionality will use fallback options")
else:
    logger.info(f"AZURE_SPEECH_KEY successfully loaded from .env file: {AZURE_SPEECH_KEY[:5]}... (hidden)")

AZURE_SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION", "")
if not AZURE_SPEECH_REGION:
    logger.warning("AZURE_SPEECH_REGION environment variable not set or empty in .env file")
    AZURE_SPEECH_REGION = "westeurope"  # Default region
    logger.info(f"Using default Azure region: {AZURE_SPEECH_REGION}")
else:
    logger.info(f"Using Azure region: {AZURE_SPEECH_REGION}")

# --- Client Setup ---
# Initialize Google Cloud Text-to-Speech client
try:
    tts_client = texttospeech.TextToSpeechClient()
    logger.info("Google Cloud Text-to-Speech client initialized.")
except Exception as e:
    logger.error(f"Failed to initialize Google Cloud Text-to-Speech client: {e}", exc_info=True)

# --- System Prompt ---

# Comprehensive System Prompt with all advanced features
ENHANCED_SYSTEM_PROMPT = """Task: Process audio input with comprehensive analysis including script enforcement, fact management, speaker identification, and AI assistance.

Languages:
- Accept an array of two BCP-47 language codes from the user (e.g. ["ur-PK", "en-US"]).
- One is the main language (preferred translation target), the other is the secondary source or alternative language.

CRITICAL SCRIPT RULES:
- ABSOLUTELY NEVER use romanized text for native script languages
- Urdu: MUST use Arabic/Nastaliq script (اردو), NEVER Latin characters
- Hindi: MUST use Devanagari script (हिन्दी), NEVER Latin characters  
- Arabic: MUST use Arabic script (العربية), NEVER Latin characters
- Bengali: MUST use Bengali script (বাংলা), NEVER Latin characters
- Persian: MUST use Persian script (فارسی), NEVER Latin characters
- If a language has a native script, it MUST be used exclusively

SESSION CONTEXT AND FACTS: {session_context}

CRITICAL: Use the above context and facts for ALL processing steps below!

Processing Instructions:

1. AUDIO PROCESSING & TRANSCRIPTION:
   - Detect spoken language from audio (must match one of user-provided codes)
   - **USE CONTEXT**: Check session facts for names, places, technical terms that might appear in audio
   - **USE CONVERSATION HISTORY**: Reference recent messages to understand context and resolve ambiguous words
   - Transcribe using ONLY native script for native script languages
   - **CONTEXT RESOLUTION**: If unclear audio contains pronouns or references, use session facts to identify what they refer to
   - If ambiguity arises between similar languages, prioritize based on script characteristics
   - VERIFY: Script authenticity before finalizing transcription

2. SPEAKER IDENTIFICATION:
   - Analyze voice characteristics: gender, age range, accent patterns, language
   - **MANDATORY**: Search through ALL session facts to find matching speaker profiles
   - **USE PREVIOUS SPEAKER DATA**: Compare voice characteristics against known speakers from facts
   - **CROSS-REFERENCE**: Match voice patterns, language preferences, and speaking styles from session history
   - If facts suggest specific person characteristics, use for identification
   - **FACT-BASED IDENTIFICATION**: Use names, relationships, age info from facts to identify speaker
   - Determine if this is a new speaker or known person from session
   - Include the detected language for complete speaker profile

3. DIRECT QUERY DETECTION:
   - Check for trigger phrases in any supported language:
     * "hey translator" / "ok translator" / "dear translator"
     * "translator, can you..." / equivalent in other languages
   - If direct query detected:
     * **USE SESSION FACTS**: Search provided facts database for relevant information to answer query
     * **PERSONALIZED RESPONSE**: Use known names, preferences, relationships from facts
     * **CONTEXT-AWARE**: Reference previous conversations and established facts
     * Generate helpful response in same language as spoken
     * ALSO translate the AI response to the other language
     * **FACT INTEGRATION**: Include relevant personal details and conversation history in response

4. TRANSLATION PROCESS (if not direct query):
   - **CONTEXT-DRIVEN TRANSLATION**: Use session facts to resolve pronouns (he/she/it/they → specific names)
   - **RELATIONSHIP AWARENESS**: Use family/relationship facts to choose appropriate terms (mama/papa vs mom/dad)
   - **CULTURAL CONTEXT**: Apply personal preferences and cultural background from facts
   - Translate to target language using simple vocabulary
   - **PRONOUN RESOLUTION**: Replace ambiguous pronouns with specific names from session facts
   - Match speaker's gender and tone with correct pronoun usage
   - **HISTORICAL CONTEXT**: Reference previous conversation topics and established context
   - Detect emotional tone and context
   - Enhance with SSML (without <voice> or <speak> wrapper tags)
   - Add contextual nonverbal expressions if present

5. COMPREHENSIVE FACT MANAGEMENT:
   
   A. FACT EXTRACTION:
   - Extract ALL factual information from transcription
   - **USE EXISTING CONTEXT**: Cross-reference against current session facts to avoid duplicates
   - Identify: names, relationships, ages, locations, preferences, events, dates
   - **CONTEXT ENHANCEMENT**: Use conversation history to add context to extracted facts
   - Categorize by person (if multiple people mentioned)
   - **CONVERSATION ANALYSIS**: Use session context to determine conversation purpose: CHILD_FOCUSED, ISSUE_FOCUSED, PERSON_FOCUSED, TOPIC_FOCUSED
   
   B. FACT VERIFICATION & ENHANCEMENT:
   - **MANDATORY COMPARISON**: Compare EVERY new fact against existing session facts database
   - **SEARCH EXISTING FACTS**: Use fact search to find related or similar information
   - ENDORSE: If new fact confirms existing fact, increase confidence
   - CORRECT: If new fact contradicts existing fact, update with correction
   - DEDUPLICATE: Merge similar facts, keep highest confidence version
   - **CONTEXT VALIDATION**: Use conversation history to validate fact accuracy
   - NEW: Add completely new facts to knowledge base only if not found in existing facts
   
   C. FACT ORGANIZATION:
   - Group facts by person/entity using existing session context for accurate grouping
   - **RELATIONSHIP MAPPING**: Use existing relationship facts to connect new information
   - Maintain confidence scores (0.1-1.0) based on context consistency
   - Track endorsement counts from repeated mentions across conversation history
   - Store in English for consistency
   - **CONTEXT METADATA**: Include source metadata (when extracted, from which conversation, related context)

6. SCRIPT VALIDATION:
   - Final verification that all output uses correct native scripts
   - No romanized text for languages with native writing systems

CONTEXT USAGE VERIFICATION:
Before generating output, verify that you have:
- ✅ Used session facts for speaker identification
- ✅ Applied conversation history for transcription accuracy
- ✅ Leveraged existing facts for pronoun resolution in translation
- ✅ Referenced personal relationships and preferences from facts
- ✅ Cross-checked new facts against existing fact database
- ✅ Used context to enhance AI assistant responses (if direct query)

Output format (JSON):

{{
  "timestamp": "current_time_ISO",
  "audio_language": "detected_language_BCP_47",
  "transcription": "native_script_transcription_VERIFIED",
  "translation_language": "target_language_BCP_47",
  "translation": "translated_text_native_script",
  "tone": "emotional_tone",
  "Translation_with_gestures": "SSML_enhanced_translation (without wrapper tags)",
  
  "speaker_analysis": {{
    "gender": "MALE | FEMALE | NEUTRAL",
    "language": "detected_speaker_language_BCP_47",
    "estimated_age_range": "child | teen | young_adult | adult | senior",
    "is_known_speaker": true | false,
    "speaker_identity": "name_if_identified_from_facts",
    "confidence": 0.0-1.0
  }},
  
  "is_direct_query": true | false,
  
  "ai_response": {{
    "answer_in_audio_language": "AI response in same language as audio (if direct query)",
    "answer_translated": "AI response translated to other language (if direct query)", 
    "answer_with_gestures": "SSML enhanced AI response in audio language (if direct query)",
    "confidence": 0.0-1.0,
    "expertise_area": "general | personal | technical | educational"
  }},
  
  "fact_management": {{
    "extracted_facts": [
      {{
        "fact_id": "unique_identifier",
        "person": "person_name_or_speaker",
        "category": "personal | relationship | preference | event | location | other",
        "fact_text": "factual_statement_in_English",
        "confidence": 0.0-1.0,
        "source": "current_transcription",
        "timestamp": "extraction_time"
      }}
    ],
    "fact_operations": [
      {{
        "operation": "NEW | ENDORSE | CORRECT | DEDUPLICATE | DELETE",
        "target_fact_id": "existing_fact_id_if_applicable",
        "new_fact": "fact_object_if_creating_new",
        "endorsement_boost": 0.0-0.3,
        "correction_details": "what_was_corrected",
        "reason": "explanation_of_operation"
      }}
    ],
    "session_insights": {{
      "total_facts": "number_of_facts_after_processing",
      "new_facts_added": "count",
      "facts_endorsed": "count",
      "facts_corrected": "count",
      "primary_focus": "what_conversation_mainly_about"
    }}
  }},
  
  "script_verification": "VERIFIED - All native scripts correct | CORRECTED - Fixed issues | ERROR - Verification failed"
}}"""



# --- Database Initialization ---
init_conversation_db()

# ==============================================
# HELPER FUNCTIONS (NO DUPLICATION)
# ==============================================

def get_tts_gender(gender_str):
    """Map Gemini's gender string to Google TTS enum"""
    gender_map = {
        "SSML_VOICE_GENDER_UNSPECIFIED": texttospeech.SsmlVoiceGender.SSML_VOICE_GENDER_UNSPECIFIED,
        "MALE": texttospeech.SsmlVoiceGender.MALE,
        "FEMALE": texttospeech.SsmlVoiceGender.FEMALE,
        "NEUTRAL": texttospeech.SsmlVoiceGender.NEUTRAL,
    }
    return gender_map.get(str(gender_str).upper(), texttospeech.SsmlVoiceGender.SSML_VOICE_GENDER_UNSPECIFIED)

def create_frontend_response(full_response: dict) -> dict:
    """Create a cleaned response optimized for frontend consumption"""
    
    # Helper function to get language name from Azure service
    def get_language_name(language_code: str) -> str:
        """Get human-readable language name from Azure language dataset"""
        global azure_speech_service
        
        if azure_speech_service and hasattr(azure_speech_service, 'languages_dataset'):
            # Search in the loaded Azure language dataset
            for lang in azure_speech_service.languages_dataset:
                if lang.get('code', '').lower() == language_code.lower():
                    return lang.get('name', language_code)
            
            # If not found, try matching just the base language code (e.g., 'en' from 'en-US')
            base_code = language_code.split('-')[0].lower()
            for lang in azure_speech_service.languages_dataset:
                lang_base = lang.get('code', '').split('-')[0].lower()
                if lang_base == base_code:
                    return lang.get('name', language_code)
        
        # Fallback: extract readable name from code or return the code itself
        if '-' in language_code:
            return language_code.split('-')[0].capitalize()
        return language_code.capitalize() if language_code else "Unknown"
    
    # Extract speaker information and create formatted speaker display
    speaker_analysis = full_response.get("speaker_analysis", {})
    speaker_name = speaker_analysis.get("speaker_identity", "")
    audio_language = full_response.get("audio_language", "")
    
    # Get human-readable language name from Azure service
    language_name = get_language_name(audio_language)
    
    # Create speaker display format: "Name (Language)" or just "Language" if no name
    if speaker_name and speaker_name.strip():
        speaker_display = f"{speaker_name} ({language_name})"
    else:
        speaker_display = language_name
    
    # Base response with essential fields only
    frontend_response = {
        # Core processing results
        "timestamp": full_response.get("timestamp"),
        "audio_language": full_response.get("audio_language"),
        "transcription": full_response.get("transcription"),
        "translation_language": full_response.get("translation_language"),
        "translation": full_response.get("translation"),
        "tone": full_response.get("tone"),
        "Translation_with_gestures": full_response.get("Translation_with_gestures"),
        
        # Enhanced speaker information with fallback: "Name (Language)" or "Language"
        "speaker_name": speaker_display,
        
        # Direct query handling
        "is_direct_query": full_response.get("is_direct_query", False),
        
        # Session management
        "session_id": full_response.get("session_id"),
        
        # Audio data
        "translation_audio": full_response.get("translation_audio"),
        "translation_audio_mime_type": full_response.get("translation_audio_mime_type"),
        "audio_type": full_response.get("audio_type"),
        
        # Script verification status (useful for frontend)
        "script_verification": full_response.get("script_verification"),
    }
    
    # Include AI response if it's a direct query
    if full_response.get("is_direct_query", False):
        ai_response = full_response.get("ai_response", {})
        frontend_response["ai_response"] = {
            "answer_in_audio_language": ai_response.get("answer_in_audio_language"),
            "answer_translated": ai_response.get("answer_translated"),
            "answer_with_gestures": ai_response.get("answer_with_gestures"),
            "confidence": ai_response.get("confidence", 0.0),
            "expertise_area": ai_response.get("expertise_area", "general")
        }
        
        # Include AI translation audio if available
        if full_response.get("ai_translation_audio"):
            frontend_response["ai_translation_audio"] = full_response.get("ai_translation_audio")
            frontend_response["ai_translation_audio_mime_type"] = full_response.get("ai_translation_audio_mime_type")
    
    # Include error information if present
    if full_response.get("tts_error"):
        frontend_response["tts_error"] = full_response.get("tts_error")
    if full_response.get("ai_translation_tts_error"):
        frontend_response["ai_translation_tts_error"] = full_response.get("ai_translation_tts_error")
    
    # Remove any None values to keep response clean
    frontend_response = {k: v for k, v in frontend_response.items() if v is not None}
    
    return frontend_response

@lru_cache(maxsize=1)
def get_azure_voices():
    """Get the list of available Azure TTS voices from pre-loaded datasets."""
    global azure_speech_service
    
    if azure_speech_service is None:
        logger.error("Azure Speech Language Service not initialized")
        return []
    
    try:
        # Get voices from the pre-loaded dataset (synchronous access)
        if hasattr(azure_speech_service, 'voices_dataset') and azure_speech_service.voices_dataset:
            voices = azure_speech_service.voices_dataset.copy()
            logger.debug(f"Retrieved {len(voices)} voices from Azure datasets")
            return voices
        else:
            logger.warning("Azure voices dataset not loaded yet")
            return []
        
    except Exception as e:
        logger.error(f"Error retrieving Azure voices from datasets: {e}", exc_info=True)
        return []

async def generate_expert_response(query: str, context: List[ConversationItem], target_language: str) -> Dict:
    """Generate expert response using Gemini for assistant queries"""
    
    try:
        # Build context from conversation
        context_text = ""
        if context:
            recent_context = context[-5:]  # Last 5 messages for context
            context_text = "\n".join([f"{item.speaker}: {item.text}" for item in recent_context])
        
        # Use the modular Gemini service
        result = generate_expert_response_with_gemini(query, context_text, target_language)
        
        return result
        
    except Exception as e:
        logger.error(f"Error generating expert response: {e}")
        return {
            'success': False,
            'answer': "I'm sorry, I encountered an error while processing your request.",
            'response_language': target_language,
            'expertise_area': 'general',
            'confidence': 0.5,
            'error_message': str(e)
        }

def synthesize_text_to_audio_gemini(text: str, language_code: str, gender: texttospeech.SsmlVoiceGender, tone: str = "neutral") -> bytes:
    """Converts text to speech using Microsoft Azure's TTS API with SSML for premium users."""
    try:
        logger.info(f"Using premium Azure TTS for language: {language_code} with tone: {tone}")
        
        # Extract the base language code (e.g., 'en-US' becomes 'en')
        base_language = language_code.split('-')[0].lower()
        gender_str = 'Female' if gender == texttospeech.SsmlVoiceGender.FEMALE else (
            'Male' if gender == texttospeech.SsmlVoiceGender.MALE else 'Neutral')

        # Get cached voices list
        voices = get_azure_voices()
        selected_voice = None
        selected_voice_name = None
        
        # Smart voice selection with single loop and priority-based matching
        best_match_score = 0
        fallback_voice = None
        fallback_voice_name = None
        
        for voice in voices:
            # Normalize voice data keys (handle both old and new formats)
            voice_lang = voice.get('language_code', voice.get('Language', '')).lower()
            voice_gender = voice.get('gender', voice.get('Gender', '')).lower()
            voice_name = voice.get('shortname', voice.get('ShortName', ''))
            voice_styles = voice.get('styles', [])
            
            # Calculate match score
            match_score = 0
            
            # Language matching (highest priority)
            if voice_lang == language_code.lower():
                match_score += 100  # Exact language match
            elif voice_lang.startswith(base_language):
                match_score += 50   # Base language match
            elif voice_lang.startswith('en'):
                match_score += 10   # English fallback
            else:
                continue  # Skip non-matching languages
            
            # Gender matching (medium priority)
            if voice_gender == gender_str.lower():
                match_score += 30
            elif voice_gender == 'neutral':
                match_score += 15   # Neutral is acceptable fallback
            
            # Style/tone matching (lower priority)
            if tone.lower() in [s.lower() for s in voice_styles]:
                match_score += 20
            
            # Update best match if this voice scores higher
            if match_score > best_match_score:
                best_match_score = match_score
                selected_voice = voice_name
                selected_voice_name = voice.get('display_name', voice_name)
                
                # Perfect match found (exact language + gender + style)
                if match_score >= 150:  # 100 + 30 + 20
                    logger.info(f"Perfect voice match found with score {match_score}")
                    break
            
            # Keep track of any English voice as ultimate fallback
            if not fallback_voice and voice_lang.startswith('en'):
                fallback_voice = voice_name
                fallback_voice_name = voice.get('display_name', voice_name)
        
        # Use fallback if no suitable voice found
        if not selected_voice:
            if fallback_voice:
                selected_voice = fallback_voice
                selected_voice_name = fallback_voice_name
                logger.warning(f"No suitable voice found for {language_code}/{gender_str}/{tone}. Using English fallback: {selected_voice}")
            else:
                selected_voice = 'en-US-AriaNeural'  # Ultimate fallback
                selected_voice_name = 'Microsoft Server Speech Text to Speech Voice (en-US, AriaNeural)'
                logger.warning(f"No voices available in dataset. Using hardcoded fallback: {selected_voice}")

        logger.info(f"Selected Azure voice: {selected_voice} (score: {best_match_score}) for {gender_str} {language_code} tone {tone}")
        
        # Process and clean the text for SSML
        processed_text = process_text_to_ssml(text, tone)
        cleaned_text = fix_ssml_content(processed_text)
        
        # Build SSML with all recommended namespaces and proper nesting
        ssml_text = f"""
            <speak version="1.0"
                xmlns="http://www.w3.org/2001/10/synthesis"
                xmlns:mstts="http://www.w3.org/2001/mstts"
                xmlns:emo="http://www.w3.org/2009/10/emotionml"
                xml:lang="{language_code}">

            <voice name="{selected_voice}">
                {cleaned_text}
            </voice>
            </speak>"""
        
        # Initialize Azure speech config
        speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
        
        # Set speech synthesis output format to MP3
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )
        
        # Set voice name
        speech_config.speech_synthesis_voice_name = selected_voice
        
        # Create speech synthesizer with no audio output (we want the raw bytes)
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
        
        # Request synthesis
        logger.info(f"Sending request to Azure TTS API for {selected_voice}")
        result = synthesizer.speak_ssml_async(ssml_text).get()
        
        # Check if successfully synthesized
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            logger.info(f"Successfully synthesized premium speech using Azure TTS with voice: {selected_voice}")
            return result.audio_data  # Returns audio as bytes
        else:
            if result.reason == speechsdk.ResultReason.Canceled:
                cancellation_details = result.cancellation_details
                logger.error(f"Azure TTS API synthesis canceled: {cancellation_details.reason}")
                if cancellation_details.error_details:
                    logger.error(f"Azure TTS API error details: {cancellation_details.error_details}")
                raise Exception(f"Azure TTS API error: {cancellation_details.reason} - {cancellation_details.error_details}")
            else:
                logger.error(f"Azure TTS API synthesis failed: {result.reason}")
                raise Exception(f"Azure TTS API error: {result.reason}")
    
    except Exception as e:
        logger.error(f"Azure TTS API error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Text-to-Speech synthesis failed: {e}")

# ==============================================
# API ENDPOINTS (NO DUPLICATION)
# ==============================================

@app.post("/process-audio/")
async def process_audio(
    file: UploadFile,
    main_language: str = Form(...),
    other_language: str = Form(...),
    is_premium: str = Form("false"),
    session_id: str = Form(None)  # Optional session ID
):
    try:
        logger.info(f"Received file: name={file.filename}, content_type={file.content_type}")

        audio_content = await file.read()
        content_type = file.content_type

        # Attempt to infer content type if generic or incorrect
        if content_type == 'application/octet-stream' or not content_type.startswith('audio/'):
             logger.warning(f"Received potentially ambiguous or non-audio content type: {content_type}. Attempting as audio/ogg.")
             content_type = 'audio/ogg' # Defaulting to ogg, adjust if your frontend sends a different format
        
        # Convert is_premium string to boolean
        is_premium_bool = is_premium.lower() == "true"
        
        # Session management
        if not session_id:
            # Create new session
            session_id = in_memory_sessions.create_session(
                main_language=main_language,
                other_language=other_language,
                is_premium=is_premium_bool
            )
            logger.info(f"Created new session: {session_id}")
        
        # Build enhanced prompt with session context
        enhanced_system_prompt = in_memory_sessions.build_enhanced_prompt(
            session_id=session_id,
            base_prompt=ENHANCED_SYSTEM_PROMPT,
            current_text="",  # We'll add the transcription later
            prompt_type="translation"
        )

        # Use the modular Gemini service for audio processing
        gemini_result = process_audio_with_gemini(
            audio_content=audio_content,
            content_type=content_type,
            system_prompt=enhanced_system_prompt,  # Use enhanced prompt with context
            main_language=main_language,
            other_language=other_language,
            is_premium=is_premium_bool
        )
        
        # Handle Gemini service response
        if not gemini_result["success"]:
            if gemini_result["error"] == "content_blocked":
                raise HTTPException(
                    status_code=400,
                    detail=f"Content blocked by safety filters: {gemini_result['block_reason']}. Ratings: {gemini_result.get('safety_ratings', 'N/A')}"
                )
            elif gemini_result["error"] == "no_content":
                raise HTTPException(status_code=500, detail="No content returned from Gemini model.")
            elif gemini_result["error"] == "all_models_unavailable":
                # Import the fallback function
                from .services.gemini_service import get_fallback_response_for_audio
                
                logger.error("All Gemini models are unavailable, using fallback response")
                response_json = get_fallback_response_for_audio(
                    main_language=main_language,
                    other_language=other_language, 
                    error_message=gemini_result.get('error_message', 'All models unavailable')
                )
                
                # Add session ID and clean for frontend
                response_json["session_id"] = session_id
                frontend_fallback = create_frontend_response(response_json)
                
                # Return fallback response immediately (no TTS needed for error message)
                return JSONResponse(
                    status_code=503,  # Service Unavailable
                    content={
                        **frontend_fallback,
                        "service_status": "temporarily_unavailable",
                        "retry_after": MODEL_RETRY_DELAY  # Use configurable delay
                    }
                )
            else:
                raise HTTPException(status_code=500, detail=f"Gemini processing failed: {gemini_result.get('error_message', 'Unknown error')}")

        response_text = gemini_result["response_text"]
        logger.info(f"Gemini API response received.")
        if gemini_result.get("prompt_feedback"):
            logger.info(f"Finish reason: {gemini_result['prompt_feedback'].finish_reason}. Safety ratings: {gemini_result['prompt_feedback'].safety_ratings}")

        # --- Parse Gemini JSON Response with Robust Handling ---
        try:
            response_json = validate_and_fix_response(response_text, main_language, other_language)
            response_json["timestamp"] = datetime.utcnow().isoformat()
            logger.info("Successfully parsed and validated Gemini response")
        except Exception as e:
            logger.warning(f"Gemini response validation failed: {e}. Creating fallback response.")
            response_json = create_fallback_response(response_text, main_language, other_language)
            response_json["session_id"] = session_id  # Add session ID to fallback
            frontend_fallback = create_frontend_response(response_json)
            logger.error("Using fallback response, skipping Text-to-Speech synthesis.")
            return frontend_fallback  # Return the cleaned fallback JSON immediately

        # --- Perform Text-to-Speech for Translation ---
        translation_text = response_json.get("translation")
        tone = response_json.get("tone", "neutral")
        Translation_with_gestures = response_json.get("Translation_with_gestures")
        translation_language_code = response_json.get("translation_language", DEFAULT_TTS_LANGUAGE_CODE)

        # Extract gender from speaker_analysis (new structure)
        speaker_analysis = response_json.get("speaker_analysis", {})
        gender_str = speaker_analysis.get("gender", "NEUTRAL")
        tts_gender = get_tts_gender(gender_str)
        
        translation_audio_base64 = None
        direct_response_audio_base64 = None

        logger.info(f"Processing TTS request, premium status: {is_premium_bool}")

        # Synthesize translation audio if present and not a direct query
        if translation_text and translation_language_code != "unknown" and not response_json.get("is_direct_query", False):
            try:
                if is_premium_bool:
                    try:
                        logger.info(f"Using Azure TTS for premium user with tone: {tone}")
                        text_for_tts = Translation_with_gestures if Translation_with_gestures else translation_text
                        # Apply robust SSML fixing before passing to TTS
                        processed_text = fix_ssml_content(text_for_tts)
                        audio_content_bytes = synthesize_text_to_audio_gemini(
                            text=processed_text,
                            language_code=translation_language_code,
                            gender=tts_gender,
                            tone='Informative'
                        )
                    except Exception as premium_exc:
                        logger.error(f"Premium Azure TTS failed: {premium_exc}. Falling back to standard TTS.", exc_info=True)
                        logger.info("Falling back to standard TTS after premium TTS failure")
                        # Also apply SSML fixing for fallback
                        processed_text = fix_ssml_content(translation_text)
                        audio_content_bytes = synthesize_text_to_audio(
                            text=processed_text,
                            language_code=translation_language_code,
                            gender=tts_gender
                        )
                else:
                    logger.info("Using standard TTS for non-premium user")
                    # Apply SSML fixing for standard TTS too
                    processed_text = fix_ssml_content(translation_text)
                    audio_content_bytes = synthesize_text_to_audio(
                        text=processed_text,
                        language_code=translation_language_code,
                        gender=tts_gender
                    )
                translation_audio_base64 = base64.b64encode(audio_content_bytes).decode('utf-8')
                logger.info("Translation audio synthesized and base64 encoded.")
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                logger.error(f"Error during Text-to-Speech synthesis or encoding: {e}", exc_info=True)
                response_json["tts_error"] = f"Failed to generate translation audio: {str(e)}"

        # Synthesize AI response audio if present and is_direct_query is true
        ai_response = response_json.get("ai_response", {})
        if response_json.get("is_direct_query", False) and ai_response.get("answer_in_audio_language"):
            ai_response_text = ai_response["answer_in_audio_language"]
            ai_response_language = response_json.get("audio_language", DEFAULT_TTS_LANGUAGE_CODE)
            
            # Generate audio for AI response in original language
            try:
                if is_premium_bool:
                    try:
                        logger.info(f"Using Azure TTS for AI response (premium) with tone: {tone}")
                        # Apply robust SSML fixing for AI response
                        processed_ai_response = fix_ssml_content(ai_response_text)
                        audio_content_bytes = synthesize_text_to_audio_gemini(
                            text=processed_ai_response,
                            language_code=ai_response_language,
                            gender=tts_gender,
                            tone=tone
                        )
                    except Exception as premium_exc:
                        logger.error(f"Premium Azure TTS failed for AI response: {premium_exc}. Falling back to standard TTS.", exc_info=True)
                        logger.info("Falling back to standard TTS after premium TTS failure (AI response)")
                        # Also apply SSML fixing for fallback
                        processed_ai_response = fix_ssml_content(ai_response_text)
                        audio_content_bytes = synthesize_text_to_audio(
                            text=processed_ai_response,
                            language_code=ai_response_language,
                            gender=tts_gender
                        )
                else:
                    logger.info("Using standard TTS for AI response (non-premium)")
                    # Apply SSML fixing for standard TTS too
                    processed_ai_response = fix_ssml_content(ai_response_text)
                    audio_content_bytes = synthesize_text_to_audio(
                        text=processed_ai_response,
                        language_code=ai_response_language,
                        gender=tts_gender
                    )
                direct_response_audio_base64 = base64.b64encode(audio_content_bytes).decode('utf-8')
                logger.info("AI response audio synthesized and base64 encoded.")
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                logger.error(f"Error during TTS synthesis for AI response: {e}", exc_info=True)
                response_json["tts_error"] = f"Failed to generate AI response audio: {str(e)}"

            # NEW: Generate audio for AI response TRANSLATION if available
            ai_response_data = response_json.get("ai_response", {})
            ai_answer_translated = ai_response_data.get("answer_translated")
            ai_translation_audio_base64 = None
            
            if ai_answer_translated and translation_language_code != "unknown":
                try:
                    if is_premium_bool:
                        try:
                            logger.info(f"Using Azure TTS for AI response translation (premium)")
                            processed_translation = fix_ssml_content(ai_answer_translated)
                            audio_content_bytes = synthesize_text_to_audio_gemini(
                                text=processed_translation,
                                language_code=translation_language_code,
                                gender=tts_gender,
                                tone=tone
                            )
                        except Exception as premium_exc:
                            logger.error(f"Premium Azure TTS failed for AI translation: {premium_exc}")
                            logger.info("Falling back to standard TTS for AI translation")
                            processed_translation = fix_ssml_content(ai_answer_translated)
                            audio_content_bytes = synthesize_text_to_audio(
                                text=processed_translation,
                                language_code=translation_language_code,
                                gender=tts_gender
                            )
                    else:
                        logger.info("Using standard TTS for AI response translation")
                        processed_translation = fix_ssml_content(ai_answer_translated)
                        audio_content_bytes = synthesize_text_to_audio(
                            text=processed_translation,
                            language_code=translation_language_code,
                            gender=tts_gender
                        )
                    ai_translation_audio_base64 = base64.b64encode(audio_content_bytes).decode('utf-8')
                    logger.info("✅ AI response translation audio generated successfully")
                    
                except Exception as e:
                    logger.error(f"Error generating AI response translation audio: {e}")
                    response_json["ai_translation_tts_error"] = f"Failed to generate AI translation audio: {str(e)}"

        # Add audio to response with enhanced handling for AI assistant
        if translation_audio_base64:
            response_json["translation_audio"] = translation_audio_base64
            response_json["translation_audio_mime_type"] = DEFAULT_AUDIO_MIME_TYPE
            response_json["audio_type"] = "translation"
            logger.info("Added translation audio to response.")
        elif direct_response_audio_base64:
            # For direct queries, use direct_response audio as primary audio
            response_json["translation_audio"] = direct_response_audio_base64
            response_json["translation_audio_mime_type"] = DEFAULT_AUDIO_MIME_TYPE
            response_json["audio_type"] = "ai_response"
            logger.info("Added direct_response audio to response as translation_audio.")
            
            # NEW: Add AI translation audio if available
            if ai_translation_audio_base64:
                response_json["ai_translation_audio"] = ai_translation_audio_base64
                response_json["ai_translation_audio_mime_type"] = DEFAULT_AUDIO_MIME_TYPE
                logger.info("Added AI response translation audio to response.")
        else:
            logger.warning("No audio generated (neither translation nor direct_response).")
            response_json["translation_audio"] = None

        # --- Store conversation in session with ENHANCED fact integration ---
        def enhanced_message_storage():
            """Enhanced background task for message storage with asynchronous fact processing"""
            try:
                # Store the transcription with fact processing
                if response_json.get("transcription"):
                    in_memory_sessions.add_message_with_fact_processing(
                        session_id=session_id,
                        speaker="User",
                        text=response_json["transcription"],
                        language=response_json.get("audio_language", main_language),
                        message_type="transcription",
                        response_json=response_json  # Pass full response for fact processing
                    )
                
                # Store the translation or AI response (without duplicating fact processing)
                ai_response = response_json.get("ai_response", {})
                if response_json.get("is_direct_query", False):
                    # For AI direct queries, store both the original response and its translation
                    if ai_response.get("answer_in_audio_language"):
                        in_memory_sessions.add_message(
                            session_id=session_id,
                            speaker="AI Assistant",
                            text=ai_response["answer_in_audio_language"],
                            language=response_json.get("audio_language", main_language),
                            message_type="ai_response"
                        )
                    
                    # Also store the translated AI response if available
                    if ai_response.get("answer_translated"):
                        in_memory_sessions.add_message(
                            session_id=session_id,
                            speaker="AI Assistant (Translated)",
                            text=ai_response["answer_translated"],
                            language=response_json.get("translation_language", other_language),
                            message_type="ai_response_translated"
                        )
                elif response_json.get("translation"):
                    in_memory_sessions.add_message(
                        session_id=session_id,
                        speaker="Translator",
                        text=response_json["translation"],
                        language=response_json.get("translation_language", other_language),
                        message_type="translation"
                    )
                
                logger.info(f"✅ Enhanced message storage with fact processing completed for session {session_id}")
            except Exception as e:
                logger.error(f"❌ Enhanced message storage failed for session {session_id}: {e}")
        
        # Start enhanced message storage in background thread (non-blocking)
        storage_thread = threading.Thread(target=enhanced_message_storage, daemon=True)
        storage_thread.start()
        logger.info(f"🚀 Started enhanced message storage with async fact processing for session {session_id} - response will be sent immediately")
        
        # Add session ID to response
        response_json["session_id"] = session_id

        # Clean up response for frontend (remove unnecessary data)
        frontend_response = create_frontend_response(response_json)

        logger.info("Successfully processed audio file and prepared response.")
        return frontend_response # Return the cleaned JSON response

    except HTTPException as http_exc:
        # Catch and re-raise HTTPExceptions
        raise http_exc
    except Exception as e:
        # Catch any other unexpected errors
        logger.error(f"An unexpected error occurred in the main processing path: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")

@app.get("/available-languages/")
async def available_languages():
    """Return a list of distinct languages (with display names) available for TTS in this Azure region."""
    global azure_speech_service
    
    if azure_speech_service is None:
        logger.error("Azure Speech Language Service not initialized")
        return JSONResponse({"error": "Azure Speech service not available"}, status_code=503)
    
    try:
        # Try to get languages from pre-loaded dataset first (synchronous)
        if hasattr(azure_speech_service, 'languages_dataset') and azure_speech_service.languages_dataset:
            languages = azure_speech_service.languages_dataset.copy()
            logger.debug(f"Retrieved {len(languages)} languages from Azure datasets")
            return JSONResponse(languages)
        else:
            # Fall back to async method if dataset not loaded
            logger.info("Languages dataset not loaded, attempting async load")
            languages = await azure_speech_service.get_supported_languages()
            logger.debug(f"Retrieved {len(languages)} languages from Azure datasets (async)")
            return JSONResponse(languages)
        
    except Exception as e:
        logger.error(f"Error retrieving Azure languages from datasets: {e}", exc_info=True)
        return JSONResponse({"error": "Failed to retrieve languages"}, status_code=500)

@app.get("/available-voices/")
def available_voices():
    """Return the full list of voices for the region (for use in TTS synthesis)."""
    voices = get_azure_voices()
    return JSONResponse(voices)

@app.post("/translate-text/")
async def translate_text(
    text: str = Form(...),
    source_language: str = Form(...),
    target_language: str = Form(...),
    is_premium: str = Form("false")
):
    try:
        # Convert is_premium string to boolean
        is_premium_bool = is_premium.lower() == "true"
        
        # Normalize language codes
        source_language_normalized = source_language.lower().split('-')[0] if source_language else "en"
        target_language_normalized = target_language  # Keep full code for TTS
        
        # Skip actual translation if source and target are the same
        if source_language_normalized == target_language_normalized.lower().split('-')[0]:
            logger.info(f"Source and target languages are the same ({source_language_normalized}), skipping translation")
            translated_text = text
        else:
            # Use the modular Gemini service for translation
            translation_result = translate_text_with_gemini(
                text=text,
                source_language=source_language,
                target_language=target_language,
                is_premium=is_premium_bool
            )
            
            if not translation_result["success"]:
                error_type = translation_result.get("error", "unknown")
                error_message = translation_result.get('error_message', 'Unknown error')
                
                if error_type == "translation_models_unavailable":
                    logger.error(f"All translation models unavailable: {error_message}")
                    return JSONResponse(
                        status_code=503,
                        content={
                            "translation": f"Translation service is temporarily unavailable. Original text: {text}",
                            "translation_audio": None,
                            "translation_audio_mime_type": None,
                            "service_status": "translation_unavailable",
                            "error_message": error_message,
                            "retry_after": MODEL_RETRY_DELAY
                        }
                    )
                else:
                    logger.error(f"Translation failed: {error_message}")
                    raise HTTPException(status_code=500, detail=f"Translation failed: {error_message}")
                
            translated_text = translation_result["translation"]

        # Log the translated text
        logger.info(f"Translated welcome message from {source_language} to {target_language}")
        
        # Determine gender for TTS - default to neutral
        tts_gender = texttospeech.SsmlVoiceGender.NEUTRAL
        
        # Generate speech for the translated text
        audio_base64 = None
        try:
            logger.info(f"Generating TTS audio for language: {target_language_normalized}")
            
            if is_premium_bool:
                try:
                    # Use Azure TTS for premium users
                    logger.info("Using premium Azure TTS for welcome message")
                    audio_content_bytes = synthesize_text_to_audio_gemini(
                        text=translated_text,
                        language_code=target_language_normalized,
                        gender=tts_gender,
                        tone="friendly"  # Use a friendly tone for welcome message
                    )
                    audio_base64 = base64.b64encode(audio_content_bytes).decode('utf-8')
                    logger.info(f"Successfully generated premium audio, base64 length: {len(audio_base64)}")
                except Exception as e:
                    logger.error(f"Premium TTS failed for welcome message: {e}")
                    # Fall back to standard TTS if premium fails
                    logger.info("Falling back to standard TTS")
                    audio_content_bytes = synthesize_text_to_audio(
                        text=translated_text,
                        language_code=target_language_normalized,
                        gender=tts_gender
                    )
                    audio_base64 = base64.b64encode(audio_content_bytes).decode('utf-8')
                    logger.info(f"Successfully generated standard audio (fallback), base64 length: {len(audio_base64)}")
            else:
                # Standard TTS for non-premium users
                logger.info("Using standard TTS for welcome message")
                audio_content_bytes = synthesize_text_to_audio(
                    text=translated_text,
                    language_code=target_language_normalized,
                    gender=tts_gender
                )
                audio_base64 = base64.b64encode(audio_content_bytes).decode('utf-8')
                logger.info(f"Successfully generated standard audio, base64 length: {len(audio_base64)}")
        except Exception as e:
            logger.error(f"All TTS methods failed: {e}")
            audio_base64 = None  # Ensure it's set to None if all TTS attempts fail
        
        # Return the translated text and its audio
        response_data = {
            "translation": translated_text,
            "translation_audio": audio_base64,
            "translation_audio_mime_type": DEFAULT_AUDIO_MIME_TYPE
        }
        
        logger.info(f"Returning response with translation text length: {len(translated_text)}, " +
                   f"audio data present: {audio_base64 is not None}")
        
        return response_data
        
    except HTTPException as http_exc:
        # Re-raise HTTP exceptions
        raise http_exc
    except Exception as e:
        logger.error(f"Error in translate_text endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")

# ==============================================
# SESSION MANAGEMENT ENDPOINTS
# ==============================================

@app.post("/api/session/create")
async def create_session(
    main_language: str = Form(...),
    other_language: str = Form(...),
    is_premium: str = Form("false")
):
    """Create a new conversation session"""
    try:
        is_premium_bool = is_premium.lower() == "true"
        
        session_id = in_memory_sessions.create_session(
            main_language=main_language,
            other_language=other_language,
            is_premium=is_premium_bool
        )
        
        return {
            "success": True,
            "session_id": session_id,
            "main_language": main_language,
            "other_language": other_language,
            "is_premium": is_premium_bool,
            "created_at": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")

@app.get("/api/session/{session_id}/context")
async def get_session_context(session_id: str):
    """Get session context including facts and recent messages"""
    try:
        context = in_memory_sessions.get_session_context(session_id)
        
        if not context["context_analysis"]["exists"]:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return context
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session context: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get session context: {str(e)}")

@app.get("/api/session/{session_id}/comprehensive-context")
async def get_comprehensive_session_context(session_id: str, query: str = ""):
    """Get comprehensive session context including facts categorization and conversation analysis"""
    try:
        context = in_memory_sessions.get_comprehensive_session_context(session_id, query)
        
        if not context.get("context_analysis", {}).get("exists", False):
            raise HTTPException(status_code=404, detail="Session not found")
        
        return context
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting comprehensive session context: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get comprehensive context: {str(e)}")

@app.get("/api/session/{session_id}/facts")
async def get_session_facts(session_id: str):
    """Get extracted facts from session"""
    try:
        context = in_memory_sessions.get_session_context(session_id)
        
        if not context["context_analysis"]["exists"]:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return {
            "session_id": session_id,
            "facts": context["memory_facts"],
            "facts_count": len(context["memory_facts"]),
            "session_info": context["session_info"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session facts: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get session facts: {str(e)}")

@app.get("/api/session/{session_id}/fact-status")
async def get_fact_extraction_status(session_id: str):
    """Get real-time fact extraction status for a session"""
    try:
        context = in_memory_sessions.get_session_context(session_id)
        
        if not context["context_analysis"]["exists"]:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session_info = context["session_info"]
        facts_count = session_info.get("facts_count", 0)
        message_count = session_info.get("message_count", 0)
        
        # Calculate extraction progress (rough estimate)
        extraction_progress = min(100, (facts_count / max(1, message_count)) * 100)
        
        return {
            "session_id": session_id,
            "fact_extraction_status": {
                "facts_extracted": facts_count,
                "messages_processed": message_count,
                "extraction_progress_percent": round(extraction_progress, 1),
                "is_extracting": facts_count < message_count,  # Simple heuristic
                "last_activity": session_info.get("last_activity"),
                "duration_minutes": session_info.get("duration_minutes", 0)
            },
            "recent_facts": list(context["memory_facts"].values())[-3:] if context["memory_facts"] else []  # Last 3 facts
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fact extraction status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get fact extraction status: {str(e)}")

@app.delete("/api/session/{session_id}")
async def end_session(session_id: str):
    """End session and export conversation"""
    try:
        export_path = in_memory_sessions.export_session_to_file(session_id)
        
        if not export_path:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return {
            "success": True,
            "message": "Session ended and conversation exported",
            "export_path": export_path
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ending session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to end session: {str(e)}")

# ==============================================
# CONVERSATION AND AI ASSISTANT ENDPOINTS
# ==============================================

@app.post("/api/conversation/sync")
async def sync_conversation(request: SyncConversationRequest):
    """Sync conversation to backend storage"""
    try:
        logger.info(f"Syncing conversation for session: {request.sessionId}")
        
        # Generate summary for context compression
        summary = generate_conversation_summary(request.conversation)
        
        # Save to database
        save_conversation_to_db(request.sessionId, request.conversation, summary)
        
        return {
            "success": True,
            "message": "Conversation synced successfully",
            "lastSyncTime": datetime.now().isoformat(),
            "messageCount": len(request.conversation),
            "summary": summary.dict()
        }
        
    except Exception as e:
        logger.error(f"Error syncing conversation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to sync conversation: {str(e)}")

@app.get("/api/conversation/load/{session_id}")
async def load_conversation(session_id: str):
    """Load conversation from backend storage"""
    try:
        logger.info(f"Loading conversation for session: {session_id}")
        
        # Retrieve from database
        result = get_conversation_from_db(session_id)
        
        if not result:
            return {
                "conversation": [],
                "contextSummary": None
            }
        
        return {
            "conversation": result['conversation'],
            "contextSummary": result['summary']
        }
        
    except Exception as e:
        logger.error(f"Error loading conversation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load conversation: {str(e)}")

@app.get("/api/context/optimize/{session_id}")
async def get_optimized_context(session_id: str):
    """Get optimized conversation context for LLM processing"""
    try:
        logger.info(f"Getting optimized context for session: {session_id}")
        
        # Retrieve conversation from database
        result = get_conversation_from_db(session_id)
        
        if not result:
            return BackendContext(
                recentMessages=[],
                conversationSummary=None,
                sessionInfo={
                    "duration": 0,
                    "totalMessages": 0,
                    "lastActivity": datetime.now().isoformat()
                },
                tokenEstimate=0
            ).dict()
        
        conversation = [ConversationItem(**item) for item in result['conversation']]
        
        # Get recent messages (last 10 for context)
        recent_messages = conversation[-10:] if len(conversation) > 10 else conversation
        
        # Calculate session info
        session_info = {
            "duration": 0,  # Could calculate from timestamps
            "totalMessages": len(conversation),
            "lastActivity": conversation[-1].timestamp if conversation else datetime.now().isoformat()
        }
        
        # Generate or retrieve summary
        if result['summary']:
            summary = ConversationSummary(**result['summary'])
        else:
            summary = generate_conversation_summary(conversation)
        
        # Estimate tokens for context window optimization
        recent_text = ' '.join([item.text for item in recent_messages])
        token_estimate = len(recent_text.split()) * 1.3  # Rough estimate
        
        context = BackendContext(
            recentMessages=recent_messages,
            conversationSummary=summary,
            sessionInfo=session_info,
            tokenEstimate=int(token_estimate)
        )
        
        return context.dict()
        
    except Exception as e:
        logger.error(f"Error getting optimized context: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get context: {str(e)}")

@app.post("/api/audio/analyze-comprehensive")
async def analyze_audio_comprehensive(
    audio: UploadFile,
    sessionId: str = Form(...)
):
    """Comprehensive audio analysis with intent detection and context-aware processing"""
    try:
        logger.info(f"Starting comprehensive audio analysis for session: {sessionId}")
        
        # Get conversation context
        context_result = get_conversation_from_db(sessionId)
        conversation_context = []
        if context_result:
            conversation_context = [ConversationItem(**item) for item in context_result['conversation']]
        
        # Step 1: Read audio content
        audio_content = await audio.read()
        
        # For now, we'll use a simplified transcription approach
        # In a full implementation, you would:
        # 1. Save audio to a temporary file
        # 2. Use Azure Speech Recognition with proper audio config
        # 3. Or use the existing Gemini-based transcription from process_audio endpoint
        
        # Simplified implementation - use a mock transcription
        # Replace this with actual transcription logic
        transcription = "Sample transcription from audio"
        detected_language = "en-US"
        
        logger.info(f"Transcription completed: {transcription[:50]}...")
        
        # Step 2: Analyze intent using AI-powered multilingual detection
        session_context = in_memory_sessions.get_session_context(sessionId) if sessionId else None
        intent_analysis = analyze_conversation_intent_with_ai(
            text=transcription,
            detected_language=detected_language,
            session_context=session_context
        )
        
        # Step 3: Process based on intent
        result = ComprehensiveAudioResult(
            transcription=transcription,
            spoken_language=detected_language,
            intent=intent_analysis['intent'],
            intent_confidence=intent_analysis['confidence'],
            detected_domain=intent_analysis.get('detected_domain'),
            conversation_tone=intent_analysis.get('conversation_tone')
        )
        
        if intent_analysis['intent'] == 'translation':
            # Process as translation request
            result.translation = {
                "text": f"Translation of: {transcription}",
                "target_language": "es",  # Should be determined from user settings
                "context_adjusted": True
            }
            
        else:
            # Process as assistant query
            expert_response = await generate_expert_response(
                transcription, 
                conversation_context, 
                "en"  # Should be determined from user settings
            )
            result.expert_response = expert_response
        
        logger.info(f"Comprehensive analysis complete. Intent: {result.intent}")
        
        return result.dict()
        
    except Exception as e:
        logger.error(f"Error in comprehensive audio analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Audio analysis failed: {str(e)}")

@app.post("/api/context/summarize/{session_id}")
async def generate_session_summary(session_id: str):
    """Generate conversation summary for context compression"""
    try:
        logger.info(f"Generating summary for session: {session_id}")
        
        # Retrieve conversation from database
        result = get_conversation_from_db(session_id)
        
        if not result or not result['conversation']:
            raise HTTPException(status_code=404, detail="No conversation found for session")
        
        conversation = [ConversationItem(**item) for item in result['conversation']]
        summary = generate_conversation_summary(conversation)
        
        # Update the summary in the database
        save_conversation_to_db(session_id, result['conversation'], summary)
        
        return summary.dict()
        
    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")

@app.delete("/api/conversation/delete/{session_id}")
async def delete_conversation(session_id: str):
    """Delete conversation from backend storage"""
    try:
        logger.info(f"Deleting conversation for session: {session_id}")
        
        conn = sqlite3.connect('conversations.db')
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM conversations WHERE session_id = ?', (session_id,))
        deleted_count = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        if deleted_count == 0:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        return {"success": True, "message": "Conversation deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting conversation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete conversation: {str(e)}")

# ==============================================
# UTILITY AND TEST ENDPOINTS
# ==============================================

@app.get("/api/health")
async def health_check():
    """Health check endpoint for the backend service"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "features": [
            "conversation_storage",
            "ai_assistant",
            "context_optimization",
            "intent_detection",
            "robust_json_parsing",
            "enhanced_ssml_processing",
            "model_fallback_system"
        ]
    }

@app.get("/api/models/status")
async def check_models_status():
    """Check the availability status of all Gemini models"""
    from .services.gemini_service import check_model_availability
    
    try:
        logger.info("Checking model availability status")
        status_result = check_model_availability()
        
        if status_result["success"]:
            # Count available models
            available_count = sum(1 for model in status_result["models"].values() if model["available"])
            total_count = len(status_result["models"])
            
            overall_status = "healthy" if available_count > 0 else "unhealthy"
            
            return {
                "overall_status": overall_status,
                "available_models": available_count,
                "total_models": total_count,
                "models": status_result["models"],
                "checked_at": status_result["checked_at"],
                "service_operational": available_count > 0
            }
        else:
            return JSONResponse(
                status_code=503,
                content={
                    "overall_status": "error",
                    "error": status_result["error"],
                    "checked_at": status_result["checked_at"],
                    "service_operational": False
                }
            )
            
    except Exception as e:
        logger.error(f"Error checking model status: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "overall_status": "error",
                "error": str(e),
                "checked_at": datetime.now().isoformat(),
                "service_operational": False
            }
        )

@app.post("/api/test-json-parsing")
async def test_json_parsing(
    raw_response: str = Form(...),
    main_language: str = Form("en-US"),
    other_language: str = Form("ur-PK")
):
    """Test endpoint for validating robust JSON parsing functionality"""
    try:
        logger.info(f"Testing JSON parsing with response: {raw_response[:100]}...")
        
        # Test the robust parsing
        parsed_response = validate_and_fix_response(raw_response, main_language, other_language)
        
        return {
            "status": "success",
            "original_response": raw_response,
            "parsed_response": parsed_response,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in test JSON parsing: {e}")
        fallback_response = create_fallback_response(raw_response, main_language, other_language)
        
        return {
            "status": "fallback_used",
            "original_response": raw_response,
            "fallback_response": fallback_response,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.post("/api/test-ssml-processing")
async def test_ssml_processing(
    ssml_content: str = Form(...)
):
    """Test endpoint for validating SSML processing functionality"""
    try:
        logger.info(f"Testing SSML processing with content: {ssml_content[:100]}...")
        
        # Test the SSML fixing
        fixed_ssml = fix_ssml_content(ssml_content)
        
        return {
            "status": "success",
            "original_ssml": ssml_content,
            "fixed_ssml": fixed_ssml,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in test SSML processing: {e}")
        return {
            "status": "error",
            "original_ssml": ssml_content,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }