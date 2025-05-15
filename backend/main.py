import json
import logging
import base64 # Import base64 for encoding
from datetime import datetime
from fastapi import FastAPI, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.generativeai import GenerativeModel
from google.generativeai.types import HarmCategory, HarmBlockThreshold, GenerationConfig
from google.cloud import texttospeech_v1beta1 as texttospeech # Use v1beta1 for potentially more features
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

main_language: str = "da-DK"
other_language: str = "ur-PK"

# Your System Prompt for Gemini
SYSTEM_PROMPT = """Task: Process audio input.
Languages: 1 Main Language and 1 other language is provided by the user.
Steps:
1. Identify audio language (must be one of the both provided by user).
2. Transcribe audio in that language. Include foreign words in transcription.
3. Contextually translate transcription into the non spoken language from the list (user provided) with simple vocabulary. Translate with respect to gender of the speaker.
4. If any other language is spoken consider the main Language as a translation language
Output JSON format:
{
    "timestamp": "current_time",
    "gender": "assume a gender from the speaker voice and return it in texttospeech.SsmlVoiceGender fromat",
    "audio_language": "detected_audio_language_code",
    "transcription": "audio_transcription_with_foreign_words in original script",
    "translation_language": "target_translation_language_code (the other one)",
    "translation": "simple_translated_text"
}
Ensure the entire response is ONLY the single, valid JSON object described above, with no additional text or markdown formatting."""

# Initialize Google Gemini model with the system instruction
gemini_model = GenerativeModel(
    model_name="gemini-1.5-flash-latest", # Or your preferred model
    system_instruction=SYSTEM_PROMPT,
    safety_settings=common_safety_settings
)

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
DEFAULT_TTS_LANGUAGE_CODE = main_language# Assuming Urdu is a target language from your prompt
DEFAULT_TTS_VOICE_GENDER = texttospeech.SsmlVoiceGender.SSML_VOICE_GENDER_UNSPECIFIED # Or MALE, FEMALE
DEFAULT_AUDIO_ENCODING = texttospeech.AudioEncoding.MP3
DEFAULT_AUDIO_MIME_TYPE = "audio/mp3"

def synthesize_text_to_audio(text: str, language_code: str, gender: texttospeech.SsmlVoiceGender) -> bytes:
    """Converts text to speech using Google Cloud Text-to-Speech."""
    try:
        synthesis_input = texttospeech.SynthesisInput(text=text)

        voice = texttospeech.VoiceSelectionParams(
            language_code=language_code,
            ssml_gender=gender
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=DEFAULT_AUDIO_ENCODING
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
    other_language: str = Form(...)
):
    try:
        logger.info(f"Received file: name={file.filename}, content_type={file.content_type}")

        audio_content = await file.read()
        content_type = file.content_type

        # Attempt to infer content type if generic or incorrect
        if content_type == 'application/octet-stream' or not content_type.startswith('audio/'):
             logger.warning(f"Received potentially ambiguous or non-audio content type: {content_type}. Attempting as audio/ogg.")
             content_type = 'audio/ogg' # Defaulting to ogg, adjust if your frontend sends a different format

        # User-specific part of the prompt for this request (language pair)
        # You might want to pass these languages from the frontend request
        current_user_languages = f"Main Language {main_language}, {other_language}"
        user_prompt_text = USER_PROMPT_LANGUAGES_TEMPLATE.format(current_user_languages)

        # Prepare prompt parts for Gemini
        prompt_parts = [
            {"text": user_prompt_text},
            {
                "inline_data": {
                    "mime_type": content_type,
                    "data": audio_content
                }
            }
        ]

        # Gemini generation configuration
        generation_config_dict = {
            "temperature": 0.4,
            "top_p": 0.8,
            "top_k": 40,
            "max_output_tokens": 2048,
            "response_mime_type": "application/json", # Requesting JSON output
        }

        # Call the Gemini model for transcription and translation
        response = gemini_model.generate_content(
            contents=prompt_parts,
            generation_config=GenerationConfig(**generation_config_dict)
        )

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
        if translation_text and translation_language_code != "unknown":
            try:
                # Call the TTS synthesis function
                # Note: You might need more sophisticated logic to select gender
                # based on the original audio speaker if Gemini provides that info
                # and Google Cloud TTS supports gender-specific voices for the language.
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

# Example of how to potentially get language pair from request (optional)
# @app.post("/process-audio/{source_lang}/{target_lang}")
# async def process_audio_with_langs(source_lang: str, target_lang: str, file: UploadFile):
#    current_user_languages = f"{source_lang}, {target_lang}"
#    # ... rest of the logic ...
#    # Use target_lang for TTS language_code