import json
import logging
import base64  # Import base64 for encoding
from datetime import datetime
from fastapi import FastAPI, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from google.genai.types import HarmCategory, HarmBlockThreshold, GenerateContentConfig
from google.cloud import texttospeech_v1beta1 as texttospeech  # Use v1beta1 for potentially more features
from google.api_core.exceptions import GoogleAPIError

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
gemini_tts_model = genai.Client(api_key='AIzaSyBnjnHSEhVm6QY7tgfBd7sgGBFQqbuKOnc')

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

def synthesize_text_to_audio_gemini(text: str, language_code: str, gender: texttospeech.SsmlVoiceGender, tone: str = "neutral") -> bytes:
    """Converts text to speech using Gemini's TTS API for premium users."""
    try:
        logger.info(f"Using premium Gemini TTS for language: {language_code} with tone: {tone}")
          # Add tone instruction to the text for Gemini TTS
        text = f"Read aloud with {tone} tone in {language_code}: {text}"
        
        # Map voice name based on gender - using predefined voice names
        voice_name = "lapetus" # Default voice
        if gender == texttospeech.SsmlVoiceGender.MALE:
            voice_name = "lapetus"  # Male voice
        elif gender == texttospeech.SsmlVoiceGender.FEMALE:
            voice_name = "Erinome"   # Female voice
        elif gender == texttospeech.SsmlVoiceGender.NEUTRAL:
            voice_name = "Charon" # More neutral voice
              # Call the Gemini TTS model using standard dictionary-based configuration
        # We're not importing GenerateContentConfig because it's not available in your version
        
        generate_config =types.GenerateContentConfig(
            temperature=1, 
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=voice_name,
                    )
                )
            ),
        )
        
        contents = [
            types.Content(
                role="user",            
                parts=[
                    types.Part.from_text(text = text),
                ],
            ),
        ]        # Call the Gemini TTS model with proper configuration
        tts_response = gemini_tts_model.models.generate_content(
            model="gemini-2.5-pro-preview-tts",  # Use the latest TTS model
            contents=contents,
            config=generate_config
        )
        
        # Extract the audio content from the response
        audio_data = tts_response.candidates[0].content.parts[0].inline_data.data
        
        logger.info(f"Successfully synthesized premium speech using Gemini TTS with voice: {voice_name}")
        return audio_data
        
    except Exception as e:
        logger.error(f"Gemini TTS API error: {e}", exc_info=True)
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
        enhanced_user_message = f"""System Instructions:
{SYSTEM_PROMPT}

User request: {current_user_languages}"""

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
