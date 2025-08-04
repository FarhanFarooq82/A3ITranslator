"""
Azure TTS service for premium users with advanced SSML support
"""
import logging
import os
from google.cloud import texttospeech_v1beta1 as texttospeech
from fastapi import HTTPException
import azure.cognitiveservices.speech as speechsdk
import requests
from ..utils.ssml_utils import fix_ssml_content

logger = logging.getLogger(__name__)

# Azure TTS configuration
AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY", "")
AZURE_SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION", "westeurope")


def get_azure_voices():
    """Fetch Azure TTS voices - moved here for better organization"""
    endpoint = f"https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list"
    headers = {"Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY}
    response = requests.get(endpoint, headers=headers)
    response.raise_for_status()
    return response.json()


def synthesize_text_to_audio_azure(text: str, language_code: str, gender: texttospeech.SsmlVoiceGender, tone: str = "neutral") -> bytes:
    """
    Converts text to speech using Microsoft Azure's TTS API with SSML for premium users.
    
    Args:
        text: Text content to synthesize
        language_code: Target language code (e.g., 'en-US')
        gender: Voice gender preference
        tone: Emotional tone for the speech
        
    Returns:
        Audio data as bytes
    """
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
        
        # Voice selection logic with fallbacks
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
        
        # Last resort: use English neutral
        if not selected_voice:
            logger.warning(f"No supported Azure voice for language '{base_language}', gender '{gender_str}', tone '{tone}'. Falling back to English neutral.")
            selected_voice = 'en-US-AriaNeural'
            selected_voice_name = 'Microsoft Server Speech Text to Speech Voice (en-US, AriaNeural)'

        logger.info(f"Selected Azure voice: {selected_voice} for {gender_str} {language_code} tone {tone}")
        
        # Fix and process SSML content
        processed_ssml_content = fix_ssml_content(text)
        
        # Build SSML with all recommended namespaces and proper nesting
        ssml_text = f"""<speak version="1.0"
       xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="http://www.w3.org/2001/mstts"
       xmlns:emo="http://www.w3.org/2009/10/emotionml"
       xml:lang="en-US">
  <voice name="{selected_voice_name}">
    {processed_ssml_content}
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
        for voice in voices:
            if (voice['Locale'].lower().startswith(base_language)
                and voice['Gender'].lower() == gender_str.lower()
                and (tone.lower() in [s.lower() for s in voice.get('StyleList', [])])):
                selected_voice = voice['ShortName']
                selected_voice_name = voice['Name']
                break
        if not selected_voice:
            for voice in voices:
                if (voice['Locale'].lower().startswith(base_language)
                    and voice['Gender'].lower() == gender_str.lower()):
                    selected_voice = voice['ShortName']
                    selected_voice_name = voice['Name']
                    break
        if not selected_voice:
            for voice in voices:
                if voice['Locale'].lower().startswith(base_language):
                    selected_voice = voice['ShortName']
                    selected_voice_name = voice['Name']
                    break
        if not selected_voice:
            logger.warning(f"No supported Azure voice for language '{base_language}', gender '{gender_str}', tone '{tone}'. Falling back to English neutral.")
            for voice in voices:
                if voice['Locale'].lower().startswith('en') and voice['Gender'].lower() == 'neutral':
                    selected_voice = voice['ShortName']
                    selected_voice_name = voice['Name']
                    break
        if not selected_voice:
            selected_voice = 'en-US-AriaNeural'
            selected_voice_name = 'Microsoft Server Speech Text to Speech Voice (en-US, AriaNeural)'
        logger.info(f"Selected Azure voice: {selected_voice} for {gender_str} {language_code} tone {tone}")
        ssml_text = f"""
<speak version=\"1.0\"
       xmlns=\"http://www.w3.org/2001/10/synthesis\"
       xmlns:mstts=\"http://www.w3.org/2001/mstts\"
       xmlns:emo=\"http://www.w3.org/2009/10/emotionml\"
       xml:lang=\"en-US\">
  <voice name=\"{selected_voice_name}\">
    {process_text_to_ssml(text, tone)}
  </voice>
</speak>
"""
        speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )
        speech_config.speech_synthesis_voice_name = selected_voice
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
        result = synthesizer.speak_ssml_async(ssml_text).get()
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            logger.info(f"Successfully synthesized premium speech using Azure TTS with voice: {selected_voice}")
            return result.audio_data
        else:
            if result.reason == speechsdk.ResultReason.Canceled:
                cancellation_details =  result.cancellation_details
                logger.error(f"Azure TTS API synthesis canceled: {cancellation_details.reason}")
                if cancellation_details.error_details:
                    logger.error(f"Azure TTS API error details: {cancellation_details.error_details}")
                raise Exception(f"Azure TTS API error: {cancellation_details.reason} - {cancellation_details.error_details}")
            else:
                logger.error(f"Azure TTS API synthesis failed: {result.reason}")
                raise Exception(f"Azure TTS API error: {result.reason}")
    except Exception as e:
        logger.error(f"Azure TTS API error: {e}", exc_info=True)
        raise
