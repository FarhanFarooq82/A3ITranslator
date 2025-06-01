import json
import logging
import base64  # Import base64 for encoding
import os
from datetime import datetime
import requests
from fastapi import FastAPI, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import texttospeech_v1beta1 as texttospeech  # Use v1beta1 for potentially more features
from google.api_core.exceptions import GoogleAPIError

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# No retry configuration as we're handling quota limits through fallback models

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get API key from environment variable
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
if not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY environment variable not set")

# Common safety settings for Gemini (using direct API values)
common_safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]

# Base URL for Gemini API
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1"

# Your System Prompt for Gemini
SYSTEM_PROMPT = """Task: Process audio input.
Languages: 1 Main Language and 1 other language is provided by the user.
Steps:
1. Identify audio language (must be one of the 2, provided by user). it will be called language 1.
2. Transcribe audio in that language 1 using language 1 native script. Include foreign words in transcription.
3. Contextually translate into language 2 with its native script (other than language 1 from the user provided langugaes) with simple vocabulary and according to the tone of  the speaker. Translate with pronouns according to the gender of the speaker.
4. If any other language is spoken consider the main Language as a langugae 2.
Output JSON format:
{
    "timestamp": "current_time",
    "gender": "assume a gender from the speaker voice and return it in texttospeech.SsmlVoiceGender fromat",
    "audio_language": "detected_audio_language_code (must be one of the 2, provided by user)",
    "transcription": "audio_transcription_with_foreign_words in original script",
    "translation_language": "target_translation_language_code (must be one of the 2, provided by user)",
    "translation": "simple_translated_text",
    "tone": "overall tone in the audio  for example angry, happy, sad  etc",
    "Translation_with_gestures": "translation text with label of vocalization for example  [laughter],[cough],[sigh] etc. If and only if that vocalization exists in the audio and make sense in the translation"
   
}
Ensure the entire response is ONLY the single, valid JSON object described above, with no additional text or markdown formatting."""

def call_gemini_api(model_name, contents, generation_config=None, system_instruction=None):
    """Generic function to call the Gemini API directly using requests."""
    
    url = f"{GEMINI_API_BASE_URL}/models/{model_name}:generateContent?key={GOOGLE_API_KEY}"
    
    request_body = {
        "contents": contents
    }
    
    if generation_config:
        request_body["generationConfig"] = generation_config
    
    # For Gemini 2.0 models, we need to incorporate system instructions into the user prompt
    # instead of using the systemInstruction parameter
    if system_instruction and not model_name.startswith("gemini-2"):
        request_body["systemInstruction"] = {
            "text": system_instruction
        }
    
    if common_safety_settings:
        request_body["safetySettings"] = common_safety_settings
    
    logger.info(f"Calling Gemini API model: {model_name}")
    
    response = requests.post(url, json=request_body)
    
    # Handle quota exceeded errors by trying Gemini 1.5 Flash as fallback
    if response.status_code == 429 and model_name == "gemini-2.0-flash":
        logger.warning(f"Quota exceeded for {model_name}, falling back to gemini-1.5-flash-latest")
        # Update URL for the fallback model
        fallback_url = f"{GEMINI_API_BASE_URL}/models/gemini-1.5-flash-latest:generateContent?key={GOOGLE_API_KEY}"
        
        # Make the fallback request
        response = requests.post(fallback_url, json=request_body)
    
    if response.status_code != 200:
        logger.error(f"Gemini API error: {response.status_code} - {response.text}")
        raise HTTPException(
            status_code=response.status_code, 
            detail=f"Gemini API error: {response.text}"
        )
    
    return response.json()

# --- TTS Configuration ---
# Define the voice and audio format for the translation audio
DEFAULT_TTS_LANGUAGE_CODE = 'da-DK'  
DEFAULT_TTS_VOICE_GENDER = texttospeech.SsmlVoiceGender.SSML_VOICE_GENDER_UNSPECIFIED  
DEFAULT_AUDIO_ENCODING = texttospeech.AudioEncoding.MP3
DEFAULT_AUDIO_MIME_TYPE = "audio/mp3"

def synthesize_text_to_audio_gemini(text: str, language_code: str, gender: texttospeech.SsmlVoiceGender, tone: str = "neutral") -> bytes:
    """Converts text to speech using Gemini's TTS API for premium users."""
    try:
        logger.info(f"Using premium Gemini TTS for language: {language_code} with tone: {tone}")
        
        # Add tone instruction to the text for Gemini TTS
        text = f"Read aloud with {tone} tone in {language_code} text: {text}"
        
        # Map voice name based on gender - using predefined voice names
        voice_name = "Tenor" # Default voice
        if gender == texttospeech.SsmlVoiceGender.MALE:
            voice_name = "Tenor"  # Male voice
        elif gender == texttospeech.SsmlVoiceGender.FEMALE:
            voice_name = "Nova"   # Female voice
        elif gender == texttospeech.SsmlVoiceGender.NEUTRAL:
            voice_name = "Charon" # More neutral voice
            
        # Call the Gemini TTS model using standard dictionary-based configuration
        contents = [
            {
                "role": "user",
                "parts": [
                    {"text": text}
                ]
            }
        ]
        
        generation_config = {
            "temperature": 0.2,
            "responseModalities": ["audio"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice_name
                    }
                }
            }
        }
        
        # Call the Gemini TTS API directly
        tts_model_name = "gemini-2.5-pro-preview-tts"
        response_json = call_gemini_api(tts_model_name, contents, generation_config)
        
        # Extract audio data from the response
        if 'candidates' in response_json and response_json['candidates']:
            candidate = response_json['candidates'][0]
            if 'content' in candidate and 'parts' in candidate['content']:
                for part in candidate['content']['parts']:
                    if 'inlineData' in part:
                        audio_data = base64.b64decode(part['inlineData']['data'])
                        logger.info(f"Successfully synthesized premium speech using Gemini TTS with voice: {voice_name}")
                        return audio_data
        
        raise Exception("Could not extract audio content from Gemini TTS API response")
        
    except Exception as e:
        logger.error(f"Gemini TTS API error: {e}", exc_info=True)
        # Fall back to regular TTS if Gemini TTS fails
        logger.warning("Falling back to standard TTS due to Gemini TTS error")
        return synthesize_text_to_audio(text, language_code, gender)

def synthesize_text_to_audio(text: str, language_code: str, gender: texttospeech.SsmlVoiceGender, is_premium: bool = False) -> bytes:
    """Converts text to speech using Google Cloud Text-to-Speech."""
    try:
        # Initialize Google Cloud Text-to-Speech client
        tts_client = texttospeech.TextToSpeechClient()
        
        synthesis_input = texttospeech.SynthesisInput(text=text)

        voice = texttospeech.VoiceSelectionParams(
            language_code=language_code,
            ssml_gender=gender
        )

        # Use higher quality audio settings for premium users
        audio_config = texttospeech.AudioConfig(
            audio_encoding=DEFAULT_AUDIO_ENCODING,
            speaking_rate=0.9 if is_premium else 1.0,  # Slightly slower for premium users (clearer speech)
            pitch=0.0 if is_premium else 0.0,          # Could adjust pitch for premium users if desired
            sample_rate_hertz=24000 if is_premium else 16000  # Higher sample rate for premium users
        )

        response = tts_client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config
        )

        logger.info(f"Successfully synthesized speech for language code: {language_code}")
        return response.audio_content

    except GoogleAPIError as e:
        logger.error(f"Google Cloud TTS API error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Text-to-Speech synthesis failed: {e}")
    except Exception as e:
        logger.error(f"Unexpected error during TTS synthesis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to synthesize speech: {str(e)}")


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
        user_prompt_text = f"User language preferences: {current_user_languages}. {premium_text}"
        
        # For Gemini 2.0 Flash, combine system prompt with user prompt as it doesn't support system role
        combined_prompt = f"{SYSTEM_PROMPT}\n\n{user_prompt_text}"
        
        # Prepare content for Gemini API with only user role
        contents = [
            {
                "role": "user",
                "parts": [
                    {"text": combined_prompt},
                    {
                        "inlineData": {
                            "mimeType": content_type,
                            "data": base64.b64encode(audio_content).decode('utf-8')
                        }
                    }
                ]
            }
        ]
        
        # Gemini generation configuration - adjust based on premium status
        generation_config = {
            "temperature": 0.3 if is_premium_bool else 0.4,  # Lower temperature for premium users
            "topP": 0.9 if is_premium_bool else 0.8,        # Higher top_p for premium users
            "topK": 50 if is_premium_bool else 40,          # Higher top_k for premium users
            "maxOutputTokens": 4096 if is_premium_bool else 2048,  # More tokens for premium users
            "responseMimeType": "application/json", # Requesting JSON output
        }
          # Call the Gemini model for transcription and translation
        model_name = "gemini-2.0-flash" # Using Gemini 2.0 Flash model
        response_json = call_gemini_api(
            model_name=model_name,
            contents=contents,
            generation_config=generation_config,
            system_instruction=None  # Explicitly set to None since we've included it in the combined_prompt
        )
        
        logger.info("Gemini API response received.")
        
        # --- Handle Gemini Response ---
        if 'promptFeedback' in response_json:
            prompt_feedback = response_json['promptFeedback']
            if 'blockReason' in prompt_feedback:
                logger.error(f"Response blocked due to: {prompt_feedback['blockReason']}")
                if 'safetyRatings' in prompt_feedback:
                    logger.error(f"Safety ratings: {prompt_feedback['safetyRatings']}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Content blocked by safety filters: {prompt_feedback['blockReason']}"
                )
            
            if 'safetyRatings' in prompt_feedback:
                logger.info(f"Safety ratings: {prompt_feedback['safetyRatings']}")
        
        # Check for candidates in response
        if not response_json.get('candidates') or not response_json['candidates'][0].get('content', {}).get('parts'):
            logger.error(f"No content returned from Gemini. Full response: {response_json}")
            raise HTTPException(status_code=500, detail="No content returned from Gemini model.")

        # Extract response text
        response_text = response_json['candidates'][0]['content']['parts'][0]['text']

        # --- Parse Gemini JSON Response ---
        try:
            parsed_response = json.loads(response_text)
            # Add timestamp here as per your JSON format
            parsed_response["timestamp"] = datetime.utcnow().isoformat()

        except json.JSONDecodeError:
            logger.warning(f"Gemini response text is not valid JSON: '{response_text}'")
            # Create a partial JSON response with the raw text and an error indicator
            parsed_response = {
                "timestamp": datetime.utcnow().isoformat(),
                "transcription": response_text, # Store the raw text here
                "audio_language": "unknown",
                "translation": "Error: Could not parse translation from model response.", # Indicate parsing failure
                "translation_language": "unknown",
                "romanized_transcription": "",
                "error_detail": "Model response was not in the expected JSON format. Raw text included in transcription."
            }
            # If JSON parsing failed, we cannot reliably get the translation for TTS,
            # so we proceed without generating audio for the translation.
            logger.error("JSON decoding failed, skipping Text-to-Speech synthesis.")
            return parsed_response # Return the error JSON immediately

        # --- Perform Text-to-Speech for Translation ---
        translation_text = parsed_response.get("translation")
        tone = parsed_response.get("tone", "neutral")
        Translation_with_gestures = parsed_response.get("Translation_with_gestures")
        translation_language_code = parsed_response.get("translation_language", DEFAULT_TTS_LANGUAGE_CODE) # Use detected language or default

        # Map Gemini's gender string to Google TTS enum
        def get_tts_gender(gender_str):
            gender_map = {
                "SSML_VOICE_GENDER_UNSPECIFIED": texttospeech.SsmlVoiceGender.SSML_VOICE_GENDER_UNSPECIFIED,
                "MALE": texttospeech.SsmlVoiceGender.MALE,
                "FEMALE": texttospeech.SsmlVoiceGender.FEMALE,
                "NEUTRAL": texttospeech.SsmlVoiceGender.NEUTRAL,
            }
            return gender_map.get(str(gender_str).upper(), texttospeech.SsmlVoiceGender.SSML_VOICE_GENDER_UNSPECIFIED)
            
        # Extract gender from response, fallback to unspecified
        tts_gender = get_tts_gender(parsed_response.get("gender"))
        
        translation_audio_base64 = None
        # Log premium status for debugging
        logger.info(f"Processing TTS request, premium status: {is_premium_bool}")
        
        if translation_text and translation_language_code != "unknown":
            try:
                # Choose TTS method based on premium status
                if is_premium_bool:
                    try:
                        # Use Gemini TTS for premium users
                        logger.info(f"Using Gemini TTS for premium user with tone: {tone}")
                        
                        # Use Translation_with_gestures if available, otherwise use regular translation
                        text_for_tts = Translation_with_gestures if Translation_with_gestures else translation_text
                        
                        audio_content_bytes = synthesize_text_to_audio_gemini(
                            text=text_for_tts,
                            language_code=translation_language_code,
                            gender=tts_gender,
                            tone=tone
                        )
                    except Exception as premium_exc:
                        # If Gemini TTS fails, log the error and fall back to standard TTS
                        logger.error(f"Premium Gemini TTS failed: {premium_exc}. Falling back to standard TTS.", exc_info=True)
                        # Use standard TTS as fallback
                        logger.info("Falling back to standard TTS after premium TTS failure")
                        audio_content_bytes = synthesize_text_to_audio(
                            text=translation_text,
                            language_code=translation_language_code,
                            gender=tts_gender,
                            is_premium=True
                        )
                else:
                    # Use standard TTS for non-premium users
                    logger.info("Using standard TTS for non-premium user")
                    audio_content_bytes = synthesize_text_to_audio(
                        text=translation_text,
                        language_code=translation_language_code,
                        gender=tts_gender,
                        is_premium=False
                    )
                # Encode the audio content to Base64
                translation_audio_base64 = base64.b64encode(audio_content_bytes).decode('utf-8')
                logger.info("Translation audio synthesized and base64 encoded.")

            except HTTPException as http_exc:
                # Re-raise HTTPExceptions from synthesize_text_to_audio
                raise http_exc
            except Exception as e:
                logger.error(f"Error during Text-to-Speech synthesis or encoding: {e}", exc_info=True)
                parsed_response["tts_error"] = f"Failed to generate translation audio: {str(e)}"

        # --- Add Audio Data to JSON Response ---
        if translation_audio_base64:
            parsed_response["translation_audio"] = translation_audio_base64
            parsed_response["translation_audio_mime_type"] = DEFAULT_AUDIO_MIME_TYPE
            logger.info("Added translation audio to response.")
        else:
            logger.warning("Translation audio not generated (either no translation text, unknown language, or TTS failed).")
            parsed_response["translation_audio"] = None # Explicitly set to None if not generated

        logger.info("Successfully processed audio file and prepared response.")
        return parsed_response # Return the final JSON response

    except HTTPException as http_exc:
        # Catch and re-raise HTTPExceptions
        raise http_exc
    except Exception as e:
        # Catch any other unexpected errors
        logger.error(f"An unexpected error occurred in the main processing path: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")

# No retry function as we're handling quota limits directly with model fallbacks
