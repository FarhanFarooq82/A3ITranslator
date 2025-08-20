from google import genai
from google.genai import types
from google.genai.types import HarmCategory, HarmBlockThreshold, GenerateContentConfig
import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Gemini Safety Settings
COMMON_SAFETY_SETTINGS = [
    {"category": HarmCategory.HARM_CATEGORY_HARASSMENT, "threshold": HarmBlockThreshold.BLOCK_NONE},
    {"category": HarmCategory.HARM_CATEGORY_HATE_SPEECH, "threshold": HarmBlockThreshold.BLOCK_NONE},
    {"category": HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, "threshold": HarmBlockThreshold.BLOCK_NONE},
    {"category": HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, "threshold": HarmBlockThreshold.BLOCK_NONE},
]

def get_gemini_client():
    """Get configured Gemini client"""
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        logger.error("GOOGLE_API_KEY environment variable not set - please configure in .env file")
        raise ValueError("Google API key missing - Gemini functionality unavailable")
    return genai.Client(api_key=api_key)

def generate_gemini_content(client, model: str, contents: List[types.Content], config: GenerateContentConfig):
    """Basic Gemini content generation"""
    try:
        return client.models.generate_content(
            model=model,
            contents=contents,
            config=config
        )
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        raise

def process_audio_with_gemini(
    audio_content: bytes, 
    content_type: str, 
    system_prompt: str,
    main_language: str,
    other_language: str,
    is_premium: bool = False
) -> Dict[str, Any]:
    """
    Process audio using Gemini with comprehensive error handling and fallback
    
    Args:
        audio_content: Audio data as bytes
        content_type: MIME type of audio
        system_prompt: System instructions for Gemini
        main_language: Primary language code
        other_language: Secondary language code  
        is_premium: Whether user has premium features
        
    Returns:
        Dict containing Gemini response or error info
    """
    try:
        client = get_gemini_client()
        
        # Prepare user message with system instructions
        current_user_languages = f"Main Language {main_language}, {other_language}"
        enhanced_user_message = f"""System Instructions:{system_prompt} User request: {current_user_languages}"""

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
        
        # Configure based on premium status
        config = GenerateContentConfig(
            temperature=0.3 if is_premium else 0.4,
            top_p=0.9 if is_premium else 0.8,
            top_k=50 if is_premium else 40,
            max_output_tokens=4096 if is_premium else 2048,
            response_mime_type="application/json",
            safety_settings=COMMON_SAFETY_SETTINGS
        )
        
        # Model fallback chain with comprehensive error handling
        models_to_try = [
            "gemini-2.0-flash",
            "gemini-1.5-flash-latest", 
            "gemini-1.5-flash",
            "gemini-1.5-pro-latest",
            "gemini-1.5-pro"
        ]
        
        response = None
        last_error = None
        
        for model_name in models_to_try:
            try:
                logger.info(f"Attempting {model_name} for audio processing")
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=config
                )
                logger.info(f"Successfully used {model_name}")
                break
                
            except Exception as e:
                last_error = e
                error_msg = str(e).lower()
                
                # Log specific error types
                if "429" in str(e) or "quota" in error_msg:
                    logger.warning(f"Quota exceeded for {model_name}: {e}")
                elif "unavailable" in error_msg or "not found" in error_msg:
                    logger.warning(f"Model {model_name} unavailable: {e}")
                elif "permission" in error_msg or "forbidden" in error_msg:
                    logger.warning(f"Permission denied for {model_name}: {e}")
                else:
                    logger.warning(f"Error with {model_name}: {e}")
                
                # Continue to next model
                continue
        
        # If all models failed
        if response is None:
            logger.error(f"All Gemini models failed. Last error: {last_error}")
            return {
                "success": False,
                "error": "all_models_unavailable",
                "error_message": f"All Gemini models are currently unavailable. Last error: {str(last_error)}"
            }

        # Validate response
        if response.prompt_feedback and response.prompt_feedback.block_reason:
            logger.error(f"Response blocked: {response.prompt_feedback.block_reason}")
            return {
                "success": False,
                "error": "content_blocked",
                "block_reason": response.prompt_feedback.block_reason,
                "safety_ratings": response.prompt_feedback.safety_ratings
            }

        if not response.candidates or not response.candidates[0].content.parts:
            logger.error("No content returned from Gemini")
            return {
                "success": False,
                "error": "no_content",
                "prompt_feedback": response.prompt_feedback
            }

        return {
            "success": True,
             "response_text": response.candidates[0].content.parts[0].text,
             "prompt_feedback": response.prompt_feedback,
             "usage_metadata": getattr(response, 'usage_metadata', None),
             "input_tokens": getattr(response, 'usage_metadata', {}).get('prompt_token_count', 0) if hasattr(response, 'usage_metadata') else 0,
             "output_tokens": getattr(response, 'usage_metadata', {}).get('candidates_token_count', 0) if hasattr(response, 'usage_metadata') else 0,
             "total_tokens": getattr(response, 'usage_metadata', {}).get('total_token_count', 0) if hasattr(response, 'usage_metadata') else 0
        }
        
    except Exception as e:
        logger.error(f"Error in Gemini audio processing: {e}", exc_info=True)
        return {
            "success": False,
            "error": "processing_failed",
            "error_message": str(e)
        }

def translate_text_with_gemini(
    text: str,
    source_language: str,
    target_language: str,
    is_premium: bool = False
) -> Dict[str, Any]:
    """
    Translate text using Gemini
    
    Args:
        text: Text to translate
        source_language: Source language code
        target_language: Target language code
        is_premium: Whether user has premium features
        
    Returns:
        Dict containing translation result or error info
    """
    try:
        client = get_gemini_client()
        
        # Create translation prompt
        enhanced_user_message = f"""
        Translate the following text from {source_language} to {target_language}.
        Keep the translation simple and natural, preserving the tone of the original text.
        Return only the translated text, with no additional notes or explanations.
        
        Text to translate: {text}
        """
        
        config = GenerateContentConfig(
            temperature=0.2,  # Lower temperature for more accurate translation
            top_p=0.95,
            top_k=40,
            max_output_tokens=1024,
            safety_settings=COMMON_SAFETY_SETTINGS
        )
        
        # Try different models with fallback
        models_to_try = [
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash", 
            "gemini-1.5-pro-latest",
            "gemini-1.5-pro"
        ]
        
        response = None
        last_error = None
        
        for model_name in models_to_try:
            try:
                logger.info(f"Attempting {model_name} for text translation")
                response = client.models.generate_content(
                    model=model_name,
                    contents=[types.Content(
                        role="user",
                        parts=[types.Part(text=enhanced_user_message)]
                    )],
                    config=config
                )
                logger.info(f"Successfully used {model_name} for translation")
                break
                
            except Exception as e:
                last_error = e
                logger.warning(f"Model {model_name} failed for translation: {e}")
                continue
        
        # If all models failed
        if response is None:
            logger.error(f"All translation models failed. Last error: {last_error}")
            return {
                "success": False,
                "error": "translation_models_unavailable",
                "error_message": f"All translation models are currently unavailable. Last error: {str(last_error)}"
            }
        
        # Validate response
        if not response.candidates or not response.candidates[0].content.parts:
            return {
                "success": False,
                "error": "no_translation_returned"
            }
            
        translated_text = response.candidates[0].content.parts[0].text.strip()
        logger.info(f"Successfully translated text from {source_language} to {target_language}")
        
        return {
            "success": True,
            "translation": translated_text
        }
        
    except Exception as e:
        logger.error(f"Error in text translation: {e}", exc_info=True)
        return {
            "success": False,
            "error": "translation_failed",
            "error_message": str(e)
        }

def generate_expert_response_with_gemini(
    query: str,
    context_text: str,
    target_language: str
) -> Dict[str, Any]:
    """
    Generate expert response using Gemini
    
    Args:
        query: User query
        context_text: Conversation context
        target_language: Target language for response
        
    Returns:
        Dict containing expert response or error info
    """
    try:
        client = get_gemini_client()
        
        # Create expert prompt
        expert_prompt = f"""
        You are an expert AI assistant helping with language translation and communication.
        
        Conversation context:
        {context_text}
        
        User query: {query}
        
        Please provide a helpful, accurate response in {target_language}. 
        Be concise but informative. If this relates to translation or language learning,
        provide practical advice.
        """
        
        config = GenerateContentConfig(
            temperature=0.7,
            max_output_tokens=500,
            safety_settings=COMMON_SAFETY_SETTINGS
        )
        
        # Try different models with fallback
        models_to_try = [
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-pro",
            "gemini-1.5-pro-latest"
        ]
        
        response = None
        last_error = None
        
        for model_name in models_to_try:
            try:
                logger.info(f"Attempting {model_name} for expert response")
                response = client.models.generate_content(
                    model=model_name,
                    contents=[types.Content(
                        role="user",
                        parts=[types.Part(text=expert_prompt)]
                    )],
                    config=config
                )
                logger.info(f"Successfully used {model_name} for expert response")
                break
                
            except Exception as e:
                last_error = e
                logger.warning(f"Model {model_name} failed for expert response: {e}")
                continue
        
        # If all models failed, return graceful fallback
        if response is None:
            logger.error(f"All expert response models failed. Last error: {last_error}")
            return {
                "success": True,  # Still return success with fallback message
                "answer": f"I apologize, but I'm currently experiencing technical difficulties with my language models. Please try again in a few moments, or contact support if the issue persists.",
                "response_language": target_language,
                "expertise_area": "system_fallback",
                "confidence": 0.3,
                "error_message": f"All models unavailable: {str(last_error)}"
            }
        
        expert_answer = response.text if response.text else "I'm not able to provide a response to that query."
        
        return {
            "success": True,
            "answer": expert_answer,
            "response_language": target_language,
            "expertise_area": "language_and_communication",
            "confidence": 0.85
        }
        
    except Exception as e:
        logger.error(f"Error generating expert response: {e}", exc_info=True)
        return {
            "success": False,
            "answer": "I'm sorry, I encountered an error while processing your request.",
            "response_language": target_language,
            "expertise_area": "general",
            "confidence": 0.5,
            "error_message": str(e)
        }

def check_model_availability() -> Dict[str, Any]:
    """
    Check which Gemini models are currently available
    
    Returns:
        Dict containing availability status of different models
    """
    try:
        client = get_gemini_client()
        
        models_to_check = [
            "gemini-2.0-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash",
            "gemini-1.5-pro-latest", 
            "gemini-1.5-pro"
        ]
        
        availability = {}
        
        for model_name in models_to_check:
            try:
                # Simple test request
                test_response = client.models.generate_content(
                    model=model_name,
                    contents=[types.Content(
                        role="user",
                        parts=[types.Part(text="Hello")]
                    )],
                    config=GenerateContentConfig(
                        max_output_tokens=10,
                        temperature=0.1
                    )
                )
                availability[model_name] = {
                    "available": True,
                    "status": "operational",
                    "last_checked": datetime.now().isoformat()
                }
                logger.info(f"Model {model_name} is available")
                
            except Exception as e:
                error_msg = str(e).lower()
                if "429" in str(e) or "quota" in error_msg:
                    status = "quota_exceeded"
                elif "unavailable" in error_msg or "not found" in error_msg:
                    status = "unavailable"
                elif "permission" in error_msg:
                    status = "permission_denied"
                else:
                    status = "error"
                    
                availability[model_name] = {
                    "available": False,
                    "status": status,
                    "error": str(e),
                    "last_checked": datetime.now().isoformat()
                }
                logger.warning(f"Model {model_name} unavailable: {e}")
        
        return {
            "success": True,
            "models": availability,
            "checked_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error checking model availability: {e}")
        return {
            "success": False,
            "error": str(e),
            "checked_at": datetime.now().isoformat()
        }

def get_fallback_response_for_audio(
    main_language: str, 
    other_language: str, 
    error_message: str
) -> Dict[str, Any]:
    """
    Create a fallback response when all Gemini models are unavailable
    
    Args:
        main_language: Primary language code
        other_language: Secondary language code
        error_message: Error message from model failures
        
    Returns:
        Fallback response dictionary
    """
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "gender": "NEUTRAL",
        "audio_language": main_language,
        "transcription": "Service temporarily unavailable - audio processing failed",
        "translation_language": other_language,
        "translation": "I apologize, but the translation service is temporarily unavailable. Please try again in a few moments.",
        "tone": "apologetic",
        "Translation_with_gestures": "I apologize, but the translation service is temporarily unavailable. Please try again in a few moments.",
        "is_direct_query": False,
        "service_status": "models_unavailable",
        "error_detail": error_message
    }
