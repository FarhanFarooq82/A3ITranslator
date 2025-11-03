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
        "audio_language": main_language if main_language != "unknown" else "unknown",
        "transcription": raw_text[:200] + "..." if len(raw_text) > 200 else raw_text,
        "translation_language": other_language if other_language != "unknown" else "unknown", 
        "translation": "Error: Could not parse model response",
        "tone": "neutral",
        "Translation_with_gestures": "Error: Could not parse model response",
        
        "speaker_analysis": {
            "gender": "NEUTRAL",
            "language": main_language if main_language != "unknown" else "unknown",
            "estimated_age_range": "adult",
            "is_known_speaker": False,
            "speaker_identity": None,
            "confidence": 0.0
        },
        
        "is_direct_query": False,
        
        "ai_response": {
            "answer_in_audio_language": "",
            "answer_translated": "",
            "answer_with_gestures": "",
            "confidence": 0.0,
            "expertise_area": "general"
        },
        
        "fact_management": {
            "extracted_facts": [],
            "fact_operations": [],
            "session_insights": {
                "total_facts": 0,
                "new_facts_added": 0,
                "facts_endorsed": 0,
                "facts_corrected": 0,
                "primary_focus": "parsing_error"
            }
        },
        
        "script_verification": "ERROR - JSON parsing failed",
        "error_detail": "JSON parsing failed completely. Raw response included in transcription."
    }


def validate_and_fix_response(response_text: str, main_language: str = "unknown", other_language: str = "unknown") -> Dict[str, Any]:
    """
    Parse, validate, and fix comprehensive JSON response from Gemini
    
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
    
    # Ensure core required fields exist with defaults
    core_defaults = {
        "audio_language": main_language if main_language != "unknown" else "unknown",
        "transcription": "",
        "translation_language": other_language if other_language != "unknown" else "unknown",
        "translation": "",
        "tone": "neutral", 
        "Translation_with_gestures": "",
        "is_direct_query": False,
        "script_verification": "PENDING"
    }
    
    for key, default_value in core_defaults.items():
        if key not in response_json or response_json[key] is None:
            response_json[key] = default_value
            logger.warning(f"Missing core field '{key}' set to default: {default_value}")
    
    # Ensure speaker_analysis structure
    if "speaker_analysis" not in response_json:
        response_json["speaker_analysis"] = {}
    
    speaker_defaults = {
        "gender": "NEUTRAL",
        "language": response_json.get("audio_language", main_language),
        "estimated_age_range": "adult",
        "is_known_speaker": False,
        "speaker_identity": None,
        "confidence": 0.0
    }
    
    for key, default_value in speaker_defaults.items():
        if key not in response_json["speaker_analysis"]:
            response_json["speaker_analysis"][key] = default_value
    
    # Ensure ai_response structure
    if "ai_response" not in response_json:
        response_json["ai_response"] = {}
    
    ai_response_defaults = {
        "answer_in_audio_language": "",
        "answer_translated": "",
        "answer_with_gestures": "",
        "confidence": 0.0,
        "expertise_area": "general"
    }
    
    for key, default_value in ai_response_defaults.items():
        if key not in response_json["ai_response"]:
            response_json["ai_response"][key] = default_value
    
    # Ensure fact_management structure
    if "fact_management" not in response_json:
        response_json["fact_management"] = {}
    
    if "extracted_facts" not in response_json["fact_management"]:
        response_json["fact_management"]["extracted_facts"] = []
    
    if "fact_operations" not in response_json["fact_management"]:
        response_json["fact_management"]["fact_operations"] = []
    
    if "session_insights" not in response_json["fact_management"]:
        response_json["fact_management"]["session_insights"] = {
            "total_facts": 0,
            "new_facts_added": 0,
            "facts_endorsed": 0,
            "facts_corrected": 0,
            "primary_focus": "general"
        }
    
    # Validate gender values
    valid_genders = ["MALE", "FEMALE", "NEUTRAL"]
    if response_json["speaker_analysis"]["gender"].upper() not in valid_genders:
        logger.warning(f"Invalid gender '{response_json['speaker_analysis']['gender']}', defaulting to NEUTRAL")
        response_json["speaker_analysis"]["gender"] = "NEUTRAL"
    else:
        response_json["speaker_analysis"]["gender"] = response_json["speaker_analysis"]["gender"].upper()
    
    # Validate boolean fields
    if not isinstance(response_json["is_direct_query"], bool):
        # Try to convert string to boolean
        if str(response_json["is_direct_query"]).lower() in ['true', '1', 'yes']:
            response_json["is_direct_query"] = True
        else:
            response_json["is_direct_query"] = False
    
    if not isinstance(response_json["speaker_analysis"]["is_known_speaker"], bool):
        if str(response_json["speaker_analysis"]["is_known_speaker"]).lower() in ['true', '1', 'yes']:
            response_json["speaker_analysis"]["is_known_speaker"] = True
        else:
            response_json["speaker_analysis"]["is_known_speaker"] = False
    
    # Validate confidence values (0.0 to 1.0)
    confidence_fields = [
        ("speaker_analysis", "confidence"),
        ("ai_response", "confidence")
    ]
    
    for parent, field in confidence_fields:
        if parent in response_json and field in response_json[parent]:
            try:
                conf_val = response_json[parent][field]
                
                # Handle None or null values
                if conf_val is None:
                    response_json[parent][field] = 0.0
                    continue
                
                # Handle string values (convert to float)
                if isinstance(conf_val, str):
                    # Handle empty strings
                    if not conf_val.strip():
                        response_json[parent][field] = 0.0
                        continue
                    # Try to convert string to float
                    conf_val = float(conf_val)
                
                # Handle numeric values (int or float)
                conf_val = float(conf_val)
                
                # Clamp to valid range (0.0 to 1.0)
                response_json[parent][field] = max(0.0, min(1.0, conf_val))
                
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid confidence value for {parent}.{field}: {response_json[parent][field]}. Setting to 0.0")
                response_json[parent][field] = 0.0
    
    # Clean up text fields
    text_fields = ["transcription", "translation", "direct_response", "tone"]
    for field in text_fields:
        if field in response_json and isinstance(response_json[field], str):
            response_json[field] = response_json[field].strip()
    
    return response_json
