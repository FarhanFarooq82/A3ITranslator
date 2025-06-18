import json
import logging
import base64  # Import base64 for encoding
import os  # Import os for environment variables
from datetime import datetime
from fastapi import FastAPI, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from google.genai.types import HarmCategory, HarmBlockThreshold, GenerateContentConfig
from google.cloud import texttospeech_v1beta1 as texttospeech  # Use v1beta1 for potentially more features
from google.api_core.exceptions import GoogleAPIError
import requests  # Import requests for API calls
from dotenv import load_dotenv  # Import dotenv for loading environment variables from .env file
from pathlib import Path
import azure.cognitiveservices.speech as speechsdk  # For Azure TTS
import re  # For regex pattern matching in SSML processing
from fastapi.responses import JSONResponse
from functools import lru_cache

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file with absolute path
env_path = Path(__file__).resolve().parent / '.env'
logger.info(f"Loading .env file from: {env_path}")
load_dotenv(dotenv_path=env_path)

# Verify if env variables are loaded correctly
logger.info(f"Environment variable GOOGLE_API_KEY exists: {'GOOGLE_API_KEY' in os.environ}")
logger.info(f"Environment variable PLAYAI_KEY exists: {'PLAYAI_KEY' in os.environ}")
logger.info(f"Environment variable PLAYAI_USER_ID exists: {'PLAYAI_USER_ID' in os.environ}")

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Common safety settings for Gemini
common_safety_settings = [
    {"category": HarmCategory.HARM_CATEGORY_HARASSMENT, "threshold": HarmBlockThreshold.BLOCK_NONE},
    {"category": HarmCategory.HARM_CATEGORY_HATE_SPEECH, "threshold": HarmBlockThreshold.BLOCK_NONE},
    {"category": HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, "threshold": HarmBlockThreshold.BLOCK_NONE},
    {"category": HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, "threshold": HarmBlockThreshold.BLOCK_NONE},
]

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

# # Initialize Google Gemini model with the system instruction
# gemini_model = genai.Client(
#     gemini_model="gemini-1.5-flash-latest",  # Or your preferred model
#     system_instruction=SYSTEM_PROMPT,
#     safety_settings=common_safety_settings
# )

# Initialize Gemini TTS model for premium users
google_api_key = os.environ.get("GOOGLE_API_KEY")
if not google_api_key:
    logger.warning("GOOGLE_API_KEY environment variable not set or empty in .env file")
    google_api_key = 'AIzaSyBnjnHSEhVm6QY7tgfBd7sgGBFQqbuKOnc'  # Fallback to the hardcoded key
    
gemini_tts_model = genai.Client(api_key=google_api_key)

# Initialize Google Cloud Text-to-Speech client
try:
    tts_client = texttospeech.TextToSpeechClient()
    logger.info("Google Cloud Text-to-Speech client initialized.")
except Exception as e:
    logger.error(f"Failed to initialize Google Cloud Text-to-Speech client: {e}", exc_info=True)
    # Depending on your needs, you might want to raise an exception or handle this gracefully

USER_PROMPT_LANGUAGES_TEMPLATE = "User language preferences: {}"

# --- TTS Configuration ---
# Define the voice and audio format for the translation audio
# You should dynamically determine the language_code based on the translation_language
# returned by Gemini. For this example, we'll use a default based on your prompt languages.
# Refer to Google Cloud Text-to-Speech documentation for available voices:
# https://cloud.google.com/text-to-speech/docs/voices
DEFAULT_TTS_LANGUAGE_CODE = 'da-DK'  # Assuming Urdu is a target language from your prompt
DEFAULT_TTS_VOICE_GENDER = texttospeech.SsmlVoiceGender.SSML_VOICE_GENDER_UNSPECIFIED  # Or MALE, FEMALE
DEFAULT_AUDIO_ENCODING = texttospeech.AudioEncoding.MP3
DEFAULT_AUDIO_MIME_TYPE = "audio/mp3"

# Azure TTS API configuration
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

# Map language codes to Azure voice names
# These are some high-quality Neural voices for various languages
AZURE_VOICES = {
    'en': {
        'MALE': 'en-US-GuyNeural',
        'FEMALE': 'en-US-JennyNeural',
        'NEUTRAL': 'en-US-AriaNeural'
    },
    'es': {
        'MALE': 'es-ES-AlvaroNeural',
        'FEMALE': 'es-ES-ElviraNeural',
        'NEUTRAL': 'es-ES-AlvaroNeural'
    },
    'fr': {
        'MALE': 'fr-FR-HenriNeural',
        'FEMALE': 'fr-FR-DeniseNeural',
        'NEUTRAL': 'fr-FR-HenriNeural'
    },
    'de': {
        'MALE': 'de-DE-ConradNeural',
        'FEMALE': 'de-DE-KatjaNeural',
        'NEUTRAL': 'de-DE-ConradNeural'
    },
    'it': {
        'MALE': 'it-IT-DiegoNeural',
        'FEMALE': 'it-IT-ElsaNeural',
        'NEUTRAL': 'it-IT-DiegoNeural'
    },
    'da': {
        'MALE': 'da-DK-JeppeNeural',
        'FEMALE': 'da-DK-ChristelNeural', 
        'NEUTRAL': 'da-DK-JeppeNeural'
    },
    'ar': {
        'MALE': 'ar-EG-ShakirNeural',
        'FEMALE': 'ar-EG-SalmaNeural',
        'NEUTRAL': 'ar-EG-ShakirNeural'
    },
    'hi': {
        'MALE': 'hi-IN-MadhurNeural',
        'FEMALE': 'hi-IN-SwaraNeural',
        'NEUTRAL': 'hi-IN-MadhurNeural'
    }
}

def process_text_to_ssml(text: str, tone: str = "neutral") -> str:
    """Convert text with non-verbal expressions to SSML format for Azure TTS."""
    # Base SSML document with speaking style based on tone
    style_tag = ""
    
    # Map tone to Azure speaking styles
    tone_to_style = {
        "cheerful": "cheerful",
        "excited": "excited", 
        "friendly": "friendly",
        "hopeful": "hopeful",
        "sad": "sad",
        "angry": "angry",
        "terrified": "terrified",
        "unfriendly": "unfriendly",
        "whispering": "whispering",
        "shouting": "shouting",
        "chat": "chat",
        "newscast": "newscast",
        "customerservice": "customerservice",
        "narration": "narration-professional",
        "empathetic": "empathetic"
    }
    
    # If tone matches a known Azure style, add the style attribute
    if tone.lower() in tone_to_style:
        azure_style = tone_to_style[tone.lower()]
        style_tag = f' style="{azure_style}"'
    
    # Start building the SSML document
    ssml = f"""<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
           xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
    <voice{style_tag}>"""
    
    # Process non-verbal expressions using regex
    # Look for patterns like [laughter], [sigh], [cough], etc.
    processed_text = text
    
    # Replace [laughter] with SSML audio effect
    processed_text = re.sub(r'\[laughter\]', '<mstts:express-as style="laughter">', processed_text)
    processed_text = processed_text.replace('[/laughter]', '</mstts:express-as>')
    
    # Handle other common expressions
    expressions = {
        r'\[sigh\]': '<break time="500ms"/><prosody rate="slow" pitch="-2st">*sigh*</prosody><break time="300ms"/>',
        r'\[cough\]': '<break time="300ms"/>*cough*<break time="300ms"/>',
        r'\[crying\]': '<prosody rate="slow" pitch="-2st">*crying*</prosody>',
        r'\[gasp\]': '<prosody rate="fast" pitch="+3st">*gasp*</prosody>',
        r'\[clearing throat\]': '<break time="300ms"/>*ahem*<break time="300ms"/>',
        r'\[whisper\](.+?)\[/whisper\]': r'<prosody volume="x-soft">\1</prosody>',
        r'\[shouting\](.+?)\[/shouting\]': r'<prosody volume="x-loud" pitch="high">\1</prosody>',
        r'\[pause\]': '<break time="1s"/>'
    }
    
    for pattern, replacement in expressions.items():
        processed_text = re.sub(pattern, replacement, processed_text)
    
    # Add text to SSML document
    ssml += processed_text
    ssml += """</voice>
</speak>"""
    
    return ssml

def synthesize_text_to_audio_gemini(text: str, language_code: str, gender: texttospeech.SsmlVoiceGender, tone: str = "neutral") -> bytes:
    """Converts text to speech using Microsoft Azure's TTS API with SSML for premium users."""
    try:
        logger.info(f"Using premium Azure TTS for language: {language_code} with tone: {tone}")
        
        # Extract the base language code (e.g., 'en-US' becomes 'en')
        base_language = language_code.split('-')[0].lower()
        
        # Get gender string for Azure voice selection
        gender_str = 'NEUTRAL'
        if gender == texttospeech.SsmlVoiceGender.MALE:
            gender_str = 'MALE'
        elif gender == texttospeech.SsmlVoiceGender.FEMALE:
            gender_str = 'FEMALE'
        
        # Select voice based on language and gender
        voice_name = AZURE_VOICES.get(base_language, AZURE_VOICES['en']).get(gender_str, AZURE_VOICES[base_language]['NEUTRAL'])
        logger.info(f"Selected Azure voice: {voice_name} for {gender_str} {language_code} speech")
        
        # Convert non-verbal expressions to SSML
        ssml_text = process_text_to_ssml(text, tone)
        
        # Initialize Azure speech config
        speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
        
        # Set speech synthesis output format to MP3
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )
        
        # Set voice name
        speech_config.speech_synthesis_voice_name = voice_name
        
        # Create speech synthesizer
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
        
        # Request synthesis
        logger.info(f"Sending request to Azure TTS API for {voice_name}")
        result = synthesizer.speak_ssml_async(ssml_text).get()
        
        # Check if successfully synthesized
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            logger.info(f"Successfully synthesized premium speech using Azure TTS with voice: {voice_name}")
            return result.audio_data  # Returns audio as bytes
        else:
            if result.reason == speechsdk.ResultReason.Canceled:
                cancellation_details = speechsdk.CancellationDetails(result)
                logger.error(f"Azure TTS API synthesis canceled: {cancellation_details.reason}")
                logger.error(f"Azure TTS API error details: {cancellation_details.error_details}")
                raise Exception(f"Azure TTS API error: {cancellation_details.reason} - {cancellation_details.error_details}")
            else:
                logger.error(f"Azure TTS API synthesis failed: {result.reason}")
                raise Exception(f"Azure TTS API error: {result.reason}")
    
    except Exception as e:
        logger.error(f"Azure TTS API error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Text-to-Speech synthesis failed: {e}")

def synthesize_text_to_audio(text: str, language_code: str, gender: texttospeech.SsmlVoiceGender) -> bytes:
    """Converts text to speech using Google Cloud Text-to-Speech.
    Uses higher quality settings for premium users."""
    try:
        synthesis_input = texttospeech.SynthesisInput(text=text)

        voice = texttospeech.VoiceSelectionParams(
            language_code=language_code,
            ssml_gender=gender
        )

        # Use higher quality audio settings for premium users
        audio_config = texttospeech.AudioConfig(
            audio_encoding=DEFAULT_AUDIO_ENCODING,
            speaking_rate=0.9,
            pitch=0.0,
            sample_rate_hertz=24000 
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
        
        # Create content with only user role and include system instructions in the user message
        # For Gemini 2.0 Flash, we can't use "system" role directly
        enhanced_user_message = f"""System Instructions:{SYSTEM_PROMPT} User request: {current_user_languages}"""

        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part(text=enhanced_user_message),
                    types.Part(
                        inline_data=types.Blob(
                            mime_type=content_type,
                            data=audio_content
                        )
                    )
                ]
            )
        ]
        
        # First try with Gemini 2.0 Flash model
        try:
            response = gemini_tts_model.models.generate_content(
                model="gemini-2.0-flash",  # Using Gemini 2.0 Flash model
                contents=contents,
                config=GenerateContentConfig(
                    temperature=0.3 if is_premium_bool else 0.4,
                    top_p=0.9 if is_premium_bool else 0.8,
                    top_k=50 if is_premium_bool else 40,
                    max_output_tokens=4096 if is_premium_bool else 2048,
                    response_mime_type="application/json"
                )
            )
        except Exception as e:
            # If we encounter an error (like quota exceeded), fall back to Gemini 1.5 Flash
            if "429" in str(e) or "quota" in str(e).lower():
                logger.warning(f"Quota exceeded for Gemini 2.0 Flash, falling back to Gemini 1.5 Flash: {e}")
                response = gemini_tts_model.models.generate_content(
                    model="gemini-1.5-flash-latest",  # Fallback to Gemini 1.5 Flash model
                    contents=contents,
                    config=GenerateContentConfig(
                        temperature=0.3 if is_premium_bool else 0.4,
                        top_p=0.9 if is_premium_bool else 0.8,
                        top_k=50 if is_premium_bool else 40,
                        max_output_tokens=4096 if is_premium_bool else 2048,
                        response_mime_type="application/json"
                    )
                )
            else:
                # For other errors, re-raise
                raise e

        logger.info(f"Gemini API response received.")
        if response.prompt_feedback:
             logger.info(f"Finish reason: {response.prompt_feedback.finish_reason}. Safety ratings: {response.prompt_feedback.safety_ratings}")

        # --- Handle Gemini Response ---
        if response.prompt_feedback and response.prompt_feedback.block_reason:
            logger.error(f"Response blocked due to: {response.prompt_feedback.block_reason}")
            logger.error(f"Safety ratings: {response.prompt_feedback.safety_ratings}")
            raise HTTPException(
                status_code=400,
                detail=f"Content blocked by safety filters: {response.prompt_feedback.block_reason}. Ratings: {response.prompt_feedback.safety_ratings}"
            )

        if not response.candidates or not response.candidates[0].content.parts:
            logger.error(f"No content returned from Gemini. Full response: {response}")
            if response.prompt_feedback:
                logger.error(f"Prompt Feedback: {response.prompt_feedback}")
            raise HTTPException(status_code=500, detail="No content returned from Gemini model.")

        response_text = response.candidates[0].content.parts[0].text

        # --- Parse Gemini JSON Response ---
        try:
            response_json = json.loads(response_text)
            # Add timestamp here as per your JSON format
            response_json["timestamp"] = datetime.utcnow().isoformat()

        except json.JSONDecodeError:
            logger.warning(f"Gemini response text is not valid JSON: '{response_text}'")
            # Create a partial JSON response with the raw text and an error indicator
            response_json = {
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
            return response_json # Return the error JSON immediately

        # --- Perform Text-to-Speech for Translation ---
        translation_text = response_json.get("translation")
        tone = response_json.get("tone", "neutral")
        Translation_with_gestures = response_json.get("Translation_with_gestures")
        translation_language_code = response_json.get("translation_language", DEFAULT_TTS_LANGUAGE_CODE) # Use detected language or default

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
        tts_gender = get_tts_gender(response_json.get("gender"))
        
        translation_audio_base64 = None
        # Log premium status for debugging
        logger.info(f"Processing TTS request, premium status: {is_premium_bool}")        
        if translation_text and translation_language_code != "unknown":
            try:
                # Choose TTS method based on premium status
                if is_premium_bool:
                    try:
                        # Use Azure TTS for premium users
                        logger.info(f"Using Azure TTS for premium user with tone: {tone}")
                        
                        # Use Translation_with_gestures if available, otherwise use regular translation
                        text_for_tts = Translation_with_gestures if Translation_with_gestures else translation_text
                        
                        audio_content_bytes = synthesize_text_to_audio_gemini(
                            text=text_for_tts,
                            language_code=translation_language_code,
                            gender=tts_gender,
                            tone=tone
                        )
                    except Exception as premium_exc:
                        # If Azure TTS fails, log the error and fall back to standard TTS
                        logger.error(f"Premium Azure TTS failed: {premium_exc}. Falling back to standard TTS.", exc_info=True)
                        # Use standard TTS as fallback
                        logger.info("Falling back to standard TTS after premium TTS failure")
                        audio_content_bytes = synthesize_text_to_audio(
                            text=translation_text,
                            language_code=translation_language_code,
                            gender=tts_gender
                        )
                else:
                    # Use standard TTS for non-premium users
                    logger.info("Using standard TTS for non-premium user")
                    audio_content_bytes = synthesize_text_to_audio(
                        text=translation_text,
                        language_code=translation_language_code,
                        gender=tts_gender
                    )
                # Encode the audio content to Base64
                translation_audio_base64 = base64.b64encode(audio_content_bytes).decode('utf-8')
                logger.info("Translation audio synthesized and base64 encoded.")

            except HTTPException as http_exc:
                # Re-raise HTTPExceptions from synthesize_text_to_audio
                raise http_exc
            except Exception as e:
                logger.error(f"Error during Text-to-Speech synthesis or encoding: {e}", exc_info=True)
                response_json["tts_error"] = f"Failed to generate translation audio: {str(e)}"

        # --- Add Audio Data to JSON Response ---
        if translation_audio_base64:
            response_json["translation_audio"] = translation_audio_base64
            response_json["translation_audio_mime_type"] = DEFAULT_AUDIO_MIME_TYPE
            logger.info("Added translation audio to response.")
        else:
            logger.warning("Translation audio not generated (either no translation text, unknown language, or TTS failed).")
            response_json["translation_audio"] = None # Explicitly set to None if not generated

        logger.info("Successfully processed audio file and prepared response.")
        return response_json # Return the final JSON response

    except HTTPException as http_exc:
        # Catch and re-raise HTTPExceptions
        raise http_exc
    except Exception as e:
        # Catch any other unexpected errors
        logger.error(f"An unexpected error occurred in the main processing path: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")

@lru_cache(maxsize=1)
def get_azure_voices():
    """Fetch and cache the list of available Azure TTS voices for the configured region."""
    endpoint = f"https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list"
    headers = {"Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY}
    response = requests.get(endpoint, headers=headers)
    response.raise_for_status()
    return response.json()

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
