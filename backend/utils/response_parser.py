"""
Response parsing utilities for handling malformed Gemini JSON responses
"""
import json
import re
from datetime import datetime
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


def fix_json_response(response_text: str, main_language: str = "unknown", other_language: str = "unknown") -> Dict[str, Any]:
    """
    Parse and fix common issues in Gemini's JSON response
    
    Args:
        response_text: Raw response text from Gemini
        main_language: Main language code for fallback
        other_language: Other language code for fallback
        
    Returns:
        Parsed and fixed JSON dictionary
    """
    try:
        # First, try to parse as-is
        response_json = json.loads(response_text)
        if isinstance(response_json, list) and len(response_json) > 0:
            response_json = response_json[0]
        return response_json
    except json.JSONDecodeError:
        logger.warning("Initial JSON parsing failed. Attempting to fix common issues...")
        
        # Common fixes for malformed JSON
        fixed_text = response_text.strip()
        
        # Fix unclosed quotes at end of values
        fixed_text = re.sub(r':\s*"([^"]*)"?\s*([,}])', r': "\1"\2', fixed_text)
        
        # Fix missing quotes around keys
        fixed_text = re.sub(r'(\w+):\s*', r'"\1": ', fixed_text)
        
        # Fix trailing commas
        fixed_text = re.sub(r',\s*}', '}', fixed_text)
        fixed_text = re.sub(r',\s*]', ']', fixed_text)
        
        # Fix unclosed objects/arrays at end
        open_braces = fixed_text.count('{') - fixed_text.count('}')
        open_brackets = fixed_text.count('[') - fixed_text.count(']')
        
        fixed_text += '}' * open_braces
        fixed_text += ']' * open_brackets
        
        try:
            response_json = json.loads(fixed_text)
            if isinstance(response_json, list) and len(response_json) > 0:
                response_json = response_json[0]
            logger.info("Successfully fixed and parsed JSON response")
            return response_json
        except json.JSONDecodeError:
            logger.error("Unable to fix JSON. Creating fallback response.")
            return create_fallback_response(response_text, main_language, other_language)


def create_fallback_response(raw_text: str, main_language: str = "unknown", other_language: str = "unknown") -> Dict[str, Any]:
    """Create a valid response when JSON parsing completely fails"""
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "gender": "NEUTRAL",
        "audio_language": main_language if main_language != "unknown" else "unknown",
        "transcription": raw_text[:200] + "..." if len(raw_text) > 200 else raw_text,
        "translation_language": other_language if other_language != "unknown" else "unknown", 
        "translation": "Error: Could not parse model response",
        "tone": "neutral",
        "Translation_with_gestures": "Error: Could not parse model response",
        "is_direct_query": False,
        "error_detail": "JSON parsing failed completely. Raw response included in transcription."
    }


def validate_and_fix_response(response_text: str, main_language: str = "unknown", other_language: str = "unknown") -> Dict[str, Any]:
    """
    Parse, validate, and fix JSON response from Gemini
    
    Args:
        response_text: Raw response text from Gemini
        main_language: Main language code for fallback
        other_language: Other language code for fallback
        
    Returns:
        Validated and fixed response dictionary
    """
    # First try to parse the JSON
    try:
        response_json = fix_json_response(response_text, main_language, other_language)
    except Exception as e:
        logger.error(f"JSON parsing failed completely: {e}")
        return create_fallback_response(response_text, main_language, other_language)
    
    # Always set timestamp locally (more reliable than depending on model)
    response_json["timestamp"] = datetime.utcnow().isoformat()
    
    # Ensure required fields exist with defaults
    defaults = {
        "gender": "NEUTRAL",
        "audio_language": main_language if main_language != "unknown" else "unknown",
        "transcription": "",
        "translation_language": other_language if other_language != "unknown" else "unknown",
        "translation": "",
        "tone": "neutral", 
        "Translation_with_gestures": "",
        "is_direct_query": False
    }
    
    for key, default_value in defaults.items():
        if key not in response_json or response_json[key] is None:
            response_json[key] = default_value
            logger.warning(f"Missing field '{key}' set to default: {default_value}")
    
    # Validate gender values
    valid_genders = ["MALE", "FEMALE", "NEUTRAL"]
    if response_json["gender"].upper() not in valid_genders:
        logger.warning(f"Invalid gender '{response_json['gender']}', defaulting to NEUTRAL")
        response_json["gender"] = "NEUTRAL"
    else:
        response_json["gender"] = response_json["gender"].upper()
    
    # Validate boolean fields
    if not isinstance(response_json["is_direct_query"], bool):
        # Try to convert string to boolean
        if str(response_json["is_direct_query"]).lower() in ['true', '1', 'yes']:
            response_json["is_direct_query"] = True
        else:
            response_json["is_direct_query"] = False
    
    # Ensure direct_response field exists when is_direct_query is True
    if response_json["is_direct_query"] and "direct_response" not in response_json:
        response_json["direct_response"] = "I'm here to help with your translation needs."
        logger.warning("is_direct_query was True but direct_response was missing. Added default.")
    
    # Clean up text fields
    text_fields = ["transcription", "translation", "direct_response", "tone"]
    for field in text_fields:
        if field in response_json and isinstance(response_json[field], str):
            response_json[field] = response_json[field].strip()
    
    return response_json
