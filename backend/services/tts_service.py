import logging
import base64
from google.cloud import texttospeech_v1beta1 as texttospeech
from fastapi import HTTPException
from ..utils.ssml_utils import process_text_to_ssml

logger = logging.getLogger(__name__)

DEFAULT_AUDIO_ENCODING = texttospeech.AudioEncoding.MP3
DEFAULT_AUDIO_MIME_TYPE = "audio/mp3"

# Placeholder for Azure TTS integration
# from azure.cognitiveservices.speech import SpeechConfig, SpeechSynthesizer
# ...

def synthesize_text_to_audio(text: str, language_code: str, gender: texttospeech.SsmlVoiceGender) -> bytes:
    try:
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(
            language_code=language_code,
            ssml_gender=gender
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=DEFAULT_AUDIO_ENCODING,
            speaking_rate=0.9,
            pitch=0.0,
            sample_rate_hertz=24000
        )
        tts_client = texttospeech.TextToSpeechClient()
        response = tts_client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config
        )
        logger.info(f"Successfully synthesized speech for language code: {language_code}")
        return response.audio_content
    except Exception as e:
        logger.error(f"TTS synthesis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Text-to-Speech synthesis failed: {e}")
