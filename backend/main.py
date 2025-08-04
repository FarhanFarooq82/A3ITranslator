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

# --- Project Imports ---
from .models.conversation import ConversationItem, ConversationSummary, BackendContext, ComprehensiveAudioResult, SyncConversationRequest
from .db.conversation_db import init_conversation_db, get_conversation_from_db, save_conversation_to_db
from .services.ai_assistant import analyze_conversation_intent, generate_conversation_summary
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

# --- FastAPI App Setup ---
app = FastAPI()
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
    raise ValueError("Google API key missing - please set GOOGLE_API_KEY in .env file")

AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY", "")
if not AZURE_SPEECH_KEY:
    logger.error("AZURE_SPEECH_KEY environment variable not set or empty in .env file")
    raise ValueError("Azure Speech API key missing - TTS functionality will not work correctly")
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

# Your System Prompt for Gemini (preserving the original from old main.py)
SYSTEM_PROMPT = """ask: Process audio input.

Languages:
- Accept an array of two BCP-47 language codes from the user (e.g. ["ur-PK", "en-US"]).
- One is the main language (preferred translation target), the other is the secondary source or alternative language.

Instructions:
1. Detect the spoken language from audio. Must match one of the user-provided codes.
   - If ambiguity arises between similar languages (e.g., Hindi and Urdu), prioritize based on native script characteristics (e.g., Nastaliq for Urdu, Devanagari for Hindi).
   - If no clear match is found, treat user's main language as target and detected language as source.

2. Transcribe the audio using the **native script** of the detected language.  
   - Do not use romanized transcription.
   - Retain foreign or borrowed words that are contextually appropriate.

3. Detect if the speaker directly addresses the LLM in the audio using trigger phrases, in english or any of the user provided languages, such as:
   - "hey translator"
   - "ok translator"
   - "dear translator"
   - "translator, can you..."

   If present:
   - Interpret as a direct query to the LLM.
   - Respond naturally to the query using the **same language** as spoken.
   - Skip translation and SSML enhancement steps.

4. If it is not a direct query:
   - Translate the audio transcription into the other user-provided language using simple vocabulary.
   - Match the speaker's gender and tone with correct pronoun usage.
   - Detect emotional tone (e.g., happy, sad, angry, playful).
   - Enhance the translated output with SSML elements **only within the sentence content**, without wrapping it in `<voice>` or `<speak>` tags.
   - Include SSML features like `<prosody>` and `<break>` for pacing, pitch, rate, and volume.
   - Add nonverbal vocal expressions (e.g., `[laughter]`, `[sigh]`, `[cough]`) only if they are present and contextually meaningful.

Output format (JSON):

{
  "timestamp": "current_time",
  "gender": "MALE | FEMALE | NEUTRAL",
  "audio_language": "detected_language_BCP_47_code",
  "transcription": "native_script_text",
  "translation_language": "target_language_BCP_47_code",
  "translation": "translated_text (omit if direct query)",
  "tone": "dominant_emotion",
  "Translation_with_gestures": "SSML-enhanced sentence only (without <voice> or <speak> tags)",
  "is_direct_query": true | false,
  "direct_response": "response_in_same_language (only if is_direct_query is true)"
}"""

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

@lru_cache(maxsize=1)
def get_azure_voices():
    """Fetch and cache the list of available Azure TTS voices for the configured region."""
    endpoint = f"https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list"
    headers = {"Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY}
    response = requests.get(endpoint, headers=headers)
    response.raise_for_status()
    return response.json()

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
        
        # Try to find exact match for language, gender, and style/tone
        for voice in voices:
            if (voice['Locale'].lower().startswith(base_language)
                and voice['Gender'].lower() == gender_str.lower()
                and (tone.lower() in [s.lower() for s in voice.get('StyleList', [])])):
                selected_voice = voice['ShortName']
                selected_voice_name = voice['Name']
                break
                
        # Fallback: match language and gender only
        if not selected_voice:
            for voice in voices:
                if (voice['Locale'].lower().startswith(base_language)
                    and voice['Gender'].lower() == gender_str.lower()):
                    selected_voice = voice['ShortName']
                    selected_voice_name = voice['Name']
                    break
                    
        # Fallback: match language only
        if not selected_voice:
            for voice in voices:
                if voice['Locale'].lower().startswith(base_language):
                    selected_voice = voice['ShortName']
                    selected_voice_name = voice['Name']
                    break
                    
        # Fallback: use English neutral
        if not selected_voice:
            logger.warning(f"No supported Azure voice for language '{base_language}', gender '{gender_str}', tone '{tone}'. Falling back to English neutral.")
            for voice in voices:
                if voice['Locale'].lower().startswith('en') and voice['Gender'].lower() == 'neutral':
                    selected_voice = voice['ShortName']
                    selected_voice_name = voice['Name']
                    break
                    
        if not selected_voice:
            selected_voice = 'en-US-AriaNeural'  # Last resort
            selected_voice_name = 'Microsoft Server Speech Text to Speech Voice (en-US, AriaNeural)'

        logger.info(f"Selected Azure voice: {selected_voice} for {gender_str} {language_code} tone {tone}")
        
        # Build SSML with all recommended namespaces and proper nesting
        ssml_text = f"""
            <speak version="1.0"
                xmlns="http://www.w3.org/2001/10/synthesis"
                xmlns:mstts="http://www.w3.org/2001/mstts"
                xmlns:emo="http://www.w3.org/2009/10/emotionml"
                xml:lang="en-US">

            <voice name="{selected_voice_name}">
                {process_text_to_ssml(text, tone)}
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
    is_premium: str = Form("false")
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
          # User-specific part of the prompt for this request (language pair and premium status)
        current_user_languages = f"Main Language {main_language}, {other_language}"
        premium_text = "Premium user" if is_premium_bool else "Standard user"
        
        # Create content with only user role and include system instructions in the user message
        # For Gemini 2.0 Flash, we can't use "system" role directly
        enhanced_user_message = f"""System Instructions:{SYSTEM_PROMPT} User request: {current_user_languages}"""

        # Use the modular Gemini service for audio processing
        gemini_result = process_audio_with_gemini(
            audio_content=audio_content,
            content_type=content_type,
            system_prompt=SYSTEM_PROMPT,
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
                
                # Return fallback response immediately (no TTS needed for error message)
                return JSONResponse(
                    status_code=503,  # Service Unavailable
                    content={
                        **response_json,
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
            logger.error("Using fallback response, skipping Text-to-Speech synthesis.")
            return response_json  # Return the fallback JSON immediately

        # --- Perform Text-to-Speech for Translation ---
        translation_text = response_json.get("translation")
        tone = response_json.get("tone", "neutral")
        Translation_with_gestures = response_json.get("Translation_with_gestures")
        translation_language_code = response_json.get("translation_language", DEFAULT_TTS_LANGUAGE_CODE)

        tts_gender = get_tts_gender(response_json.get("gender"))
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
                            tone=tone
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

        # Synthesize direct_response audio if present and is_direct_query is true
        if response_json.get("is_direct_query", False) and response_json.get("direct_response"):
            direct_response_text = response_json["direct_response"]
            direct_response_language = response_json.get("audio_language", DEFAULT_TTS_LANGUAGE_CODE)
            try:
                if is_premium_bool:
                    try:
                        logger.info(f"Using Azure TTS for direct_response (premium) with tone: {tone}")
                        # Apply robust SSML fixing for direct response
                        processed_direct_response = fix_ssml_content(direct_response_text)
                        audio_content_bytes = synthesize_text_to_audio_gemini(
                            text=processed_direct_response,
                            language_code=direct_response_language,
                            gender=tts_gender,
                            tone=tone
                        )
                    except Exception as premium_exc:
                        logger.error(f"Premium Azure TTS failed for direct_response: {premium_exc}. Falling back to standard TTS.", exc_info=True)
                        logger.info("Falling back to standard TTS after premium TTS failure (direct_response)")
                        # Also apply SSML fixing for fallback
                        processed_direct_response = fix_ssml_content(direct_response_text)
                        audio_content_bytes = synthesize_text_to_audio(
                            text=processed_direct_response,
                            language_code=direct_response_language,
                            gender=tts_gender
                        )
                else:
                    logger.info("Using standard TTS for direct_response (non-premium)")
                    # Apply SSML fixing for standard TTS too
                    processed_direct_response = fix_ssml_content(direct_response_text)
                    audio_content_bytes = synthesize_text_to_audio(
                        text=processed_direct_response,
                        language_code=direct_response_language,
                        gender=tts_gender
                    )
                direct_response_audio_base64 = base64.b64encode(audio_content_bytes).decode('utf-8')
                logger.info("Direct response audio synthesized and base64 encoded.")
            except HTTPException as http_exc:
                raise http_exc
            except Exception as e:
                logger.error(f"Error during TTS synthesis for direct_response: {e}", exc_info=True)
                response_json["tts_error"] = f"Failed to generate direct_response audio: {str(e)}"

        # Add audio to response
        if translation_audio_base64:
            response_json["translation_audio"] = translation_audio_base64
            response_json["translation_audio_mime_type"] = DEFAULT_AUDIO_MIME_TYPE
            logger.info("Added translation audio to response.")
        elif direct_response_audio_base64:
            # For direct queries, use direct_response audio as translation_audio for frontend compatibility
            response_json["translation_audio"] = direct_response_audio_base64
            response_json["translation_audio_mime_type"] = DEFAULT_AUDIO_MIME_TYPE
            logger.info("Added direct_response audio to response as translation_audio.")
        else:
            logger.warning("No audio generated (neither translation nor direct_response).")
            response_json["translation_audio"] = None

        logger.info("Successfully processed audio file and prepared response.")
        return response_json # Return the final JSON response

    except HTTPException as http_exc:
        # Catch and re-raise HTTPExceptions
        raise http_exc
    except Exception as e:
        # Catch any other unexpected errors
        logger.error(f"An unexpected error occurred in the main processing path: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")

@app.get("/available-languages/")
def available_languages():
    """Return a list of distinct languages (with display names) available for TTS in this Azure region."""
    voices = get_azure_voices()
    # Map locale to display name, e.g. 'da-DK': 'Danish (Denmark)'
    lang_map = {}
    for v in voices:
        lang_code = v['Locale']
        lang_name = v['LocaleName'] if 'LocaleName' in v else v['Locale']
        lang_map[lang_code] = lang_name
    # Return as a sorted list of dicts
    return JSONResponse([{"code": code, "name": name} for code, name in sorted(lang_map.items(), key=lambda x: x[1])])

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
        
        # Step 2: Analyze intent
        intent_analysis = analyze_conversation_intent(transcription, conversation_context)
        
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