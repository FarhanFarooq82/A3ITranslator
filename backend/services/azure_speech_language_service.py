# Azure Speech Service for A3I Translator
# Handles fetching supported languages and voices from Azure Speech Services

import azure.cognitiveservices.speech as speechsdk
import logging
import asyncio
import os
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
import json
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

logger = logging.getLogger(__name__)

@dataclass
class SupportedLanguage:
    """Supported language information from Azure Speech Services"""
    code: str
    name: str
    display_name: str
    native_name: str
    supports_neural: bool = True
    region: str = ""

@dataclass 
class SupportedVoice:
    """Supported voice information from Azure Speech Services"""
    name: str
    display_name: str
    language_code: str
    language_name: str
    gender: str
    voice_type: str  # Neural, Standard
    sample_rate_hertz: int = 24000
    styles: List[str] = None
    
    def __post_init__(self):
        if self.styles is None:
            self.styles = []

class AzureSpeechLanguageService:
    """Service for fetching supported languages and voices from Azure Speech SDK"""
    
    def __init__(self):
        # Load environment variables
        self.azure_speech_key = os.environ.get("AZURE_SPEECH_KEY", "")
        self.azure_region = os.environ.get("AZURE_SPEECH_REGION", "")
        
        # Debug logging for environment variables
        logger.info(f"Azure Speech Key found: {'Yes' if self.azure_speech_key else 'No'}")
        logger.info(f"Azure Speech Region: {self.azure_region}")
        if self.azure_speech_key:
            logger.info(f"Azure Speech Key length: {len(self.azure_speech_key)} characters")
        
        self.speech_config = None
        
        # In-memory storage for MVP (loaded once on startup)
        self.languages_dataset: List[Dict[str, Any]] = []
        self.voices_dataset: List[Dict[str, Any]] = []
        self.voices_by_language: Dict[str, List[Dict[str, Any]]] = {}
        self._is_loaded = False
        
        # Initialize speech config if available
        if self.azure_speech_key:
            try:
                self.speech_config = speechsdk.SpeechConfig(
                    subscription=self.azure_speech_key,
                    region=self.azure_region
                )
                logger.info(f"✅ Azure Speech Language Service initialized for region: {self.azure_region}")
            except Exception as e:
                logger.error(f"❌ Failed to initialize Azure Speech config: {e}")
        else:
            logger.warning("⚠️ Azure Speech key not available - will use fallback language list")
    
    async def initialize_datasets_on_startup(self) -> bool:
        """Initialize language and voice datasets on backend startup"""
        if self._is_loaded:
            logger.info("📦 Datasets already loaded")
            return True
        
        logger.info("🚀 Initializing language and voice datasets on startup...")
        
        try:
            if self.speech_config:
                # Fetch real data from Azure
                await self._fetch_and_store_azure_data()
            else:
                # Use fallback data
                self._load_fallback_data()
            
            self._is_loaded = True
            logger.info(f"✅ MVP Datasets loaded: {len(self.languages_dataset)} languages, {len(self.voices_dataset)} voices")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize datasets: {e}")
            # Fallback to hardcoded data
            self._load_fallback_data()
            self._is_loaded = True
            logger.info(f"⚠️ Using fallback data: {len(self.languages_dataset)} languages")
            return False
    
    async def _fetch_and_store_azure_data(self):
        """Fetch real data from Azure and store in memory collections"""
        logger.info("🔄 Fetching real-time data from Azure Speech Services...")
        
        # Create synthesizer
        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=self.speech_config, 
            audio_config=None
        )
        
        # Fetch all voices from Azure (this gives us both languages and voices)
        def get_all_voices():
            return synthesizer.get_voices_async().get()
        
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        voices_result = await loop.run_in_executor(None, get_all_voices)
        
        if voices_result.reason != speechsdk.ResultReason.VoicesListRetrieved:
            raise Exception(f"Failed to retrieve voices from Azure: {voices_result.reason}")
        
        # Process voices and extract unique languages
        language_map = {}
        voices = []
        
        logger.info(f"📥 Processing {len(voices_result.voices)} voices from Azure...")
        
        for voice in voices_result.voices:
            locale = voice.locale  # e.g., 'en-US', 'da-DK'
            
            # Extract language info if not seen before
            if locale not in language_map:
                language_parts = locale.split('-')
                base_language = language_parts[0]  # 'en', 'da'
                region = language_parts[1] if len(language_parts) > 1 else ""
                
                # Create language entry
                language_map[locale] = {
                    "code": locale,
                    "name": self._get_language_name(base_language),
                    "display_name": f"{self._get_language_name(base_language)} ({self._get_region_name(region)})",
                    "native_name": self._get_native_name(locale),
                    "supports_neural": True,
                    "region": region
                }
            
            # Parse voice gender
            gender = "Neutral"
            if hasattr(voice, 'gender'):
                if voice.gender == speechsdk.SynthesisVoiceGender.Female:
                    gender = "Female"
                elif voice.gender == speechsdk.SynthesisVoiceGender.Male:
                    gender = "Male"
            
            # Create voice entry
            voice_info = {
                "name": voice.name,
                "shortname": voice.short_name,
                "display_name": voice.local_name,
                "language_code": locale,
                "language_name": language_map[locale]["display_name"],
                "gender": gender,
                "voice_type": "Neural" if "Neural" in voice.short_name else "Standard",
                "sample_rate_hertz": 24000,
                "styles": getattr(voice, 'style_list', [])
            }
            voices.append(voice_info)
        
        # Store in datasets
        self.languages_dataset = list(language_map.values())
        self.voices_dataset = voices
        
        # Sort languages by display name
        self.languages_dataset.sort(key=lambda l: l["display_name"])
        
        # Sort voices: Neural first, then by language, then by gender, then by name
        self.voices_dataset.sort(key=lambda v: (
            v["language_code"],
            v["voice_type"] != "Neural",
            v["gender"],
            v["name"]
        ))
        
        # Create voices-by-language lookup for fast access
        self.voices_by_language = {}
        for voice in self.voices_dataset:
            lang_code = voice["language_code"]
            if lang_code not in self.voices_by_language:
                self.voices_by_language[lang_code] = []
            self.voices_by_language[lang_code].append(voice)
        
        logger.info(f"✅ Azure data processed: {len(self.languages_dataset)} languages, {len(self.voices_dataset)} voices")
    
    def _load_fallback_data(self):
        """Load fallback data when Azure is not available"""
        logger.info("📂 Loading fallback language and voice data...")
        
        # Comprehensive fallback languages
        self.languages_dataset = [
            {"code": "en-US", "name": "English", "display_name": "English (United States)", "native_name": "English", "supports_neural": True, "region": "US"},
            {"code": "en-GB", "name": "English", "display_name": "English (United Kingdom)", "native_name": "English", "supports_neural": True, "region": "GB"},
            {"code": "da-DK", "name": "Danish", "display_name": "Danish (Denmark)", "native_name": "Dansk", "supports_neural": True, "region": "DK"},
            {"code": "ur-PK", "name": "Urdu", "display_name": "Urdu (Pakistan)", "native_name": "اردو", "supports_neural": True, "region": "PK"},
            {"code": "ur-IN", "name": "Urdu", "display_name": "Urdu (India)", "native_name": "اردو", "supports_neural": True, "region": "IN"},
            {"code": "es-ES", "name": "Spanish", "display_name": "Spanish (Spain)", "native_name": "Español", "supports_neural": True, "region": "ES"},
            {"code": "fr-FR", "name": "French", "display_name": "French (France)", "native_name": "Français", "supports_neural": True, "region": "FR"},
            {"code": "de-DE", "name": "German", "display_name": "German (Germany)", "native_name": "Deutsch", "supports_neural": True, "region": "DE"},
            {"code": "zh-CN", "name": "Chinese", "display_name": "Chinese (Simplified)", "native_name": "中文 (简体)", "supports_neural": True, "region": "CN"},
            {"code": "ja-JP", "name": "Japanese", "display_name": "Japanese (Japan)", "native_name": "日本語", "supports_neural": True, "region": "JP"},
            {"code": "ko-KR", "name": "Korean", "display_name": "Korean (Korea)", "native_name": "한국어", "supports_neural": True, "region": "KR"},
            {"code": "ar-SA", "name": "Arabic", "display_name": "Arabic (Saudi Arabia)", "native_name": "العربية", "supports_neural": True, "region": "SA"},
            {"code": "hi-IN", "name": "Hindi", "display_name": "Hindi (India)", "native_name": "हिन्दी", "supports_neural": True, "region": "IN"},
            {"code": "it-IT", "name": "Italian", "display_name": "Italian (Italy)", "native_name": "Italiano", "supports_neural": True, "region": "IT"},
            {"code": "pt-PT", "name": "Portuguese", "display_name": "Portuguese (Portugal)", "native_name": "Português", "supports_neural": True, "region": "PT"},
            {"code": "ru-RU", "name": "Russian", "display_name": "Russian (Russia)", "native_name": "Русский", "supports_neural": True, "region": "RU"},
            {"code": "nl-NL", "name": "Dutch", "display_name": "Dutch (Netherlands)", "native_name": "Nederlands", "supports_neural": True, "region": "NL"},
            {"code": "sv-SE", "name": "Swedish", "display_name": "Swedish (Sweden)", "native_name": "Svenska", "supports_neural": True, "region": "SE"},
            {"code": "no-NO", "name": "Norwegian", "display_name": "Norwegian (Norway)", "native_name": "Norsk", "supports_neural": True, "region": "NO"},
            {"code": "fi-FI", "name": "Finnish", "display_name": "Finnish (Finland)", "native_name": "Suomi", "supports_neural": True, "region": "FI"},
            {"code": "tr-TR", "name": "Turkish", "display_name": "Turkish (Turkey)", "native_name": "Türkçe", "supports_neural": True, "region": "TR"},
            # Additional missing languages
            {"code": "as-IN", "name": "Assamese", "display_name": "Assamese (India)", "native_name": "অসমীয়া", "supports_neural": True, "region": "IN"},
            {"code": "hy-AM", "name": "Armenian", "display_name": "Armenian (Armenia)", "native_name": "Հայերեն", "supports_neural": True, "region": "AM"},
            {"code": "az-AZ", "name": "Azerbaijani", "display_name": "Azerbaijani (Azerbaijan)", "native_name": "Azərbaycan", "supports_neural": True, "region": "AZ"},
            {"code": "bs-BA", "name": "Bosnian", "display_name": "Bosnian (Bosnia and Herzegovina)", "native_name": "Bosanski", "supports_neural": True, "region": "BA"},
            {"code": "fil-PH", "name": "Filipino", "display_name": "Filipino (Philippines)", "native_name": "Filipino", "supports_neural": True, "region": "PH"},
            {"code": "iu-Cans-CA", "name": "Inuktitut", "display_name": "Inuktitut (Canada, Syllabics)", "native_name": "ᐃᓄᒃᑎᑐᑦ", "supports_neural": True, "region": "CA"},
            {"code": "iu-Latn-CA", "name": "Inuktitut", "display_name": "Inuktitut (Canada, Latin)", "native_name": "Inuktitut", "supports_neural": True, "region": "CA"},
            {"code": "ps-AF", "name": "Pashto", "display_name": "Pashto (Afghanistan)", "native_name": "پښتو", "supports_neural": True, "region": "AF"},
            {"code": "jv-ID", "name": "Javanese", "display_name": "Javanese (Indonesia)", "native_name": "Basa Jawa", "supports_neural": True, "region": "ID"},
            {"code": "kk-KZ", "name": "Kazakh", "display_name": "Kazakh (Kazakhstan)", "native_name": "Қазақ тілі", "supports_neural": True, "region": "KZ"},
            {"code": "mn-MN", "name": "Mongolian", "display_name": "Mongolian (Mongolia)", "native_name": "Монгол", "supports_neural": True, "region": "MN"},
            {"code": "nb-NO", "name": "Norwegian Bokmål", "display_name": "Norwegian Bokmål (Norway)", "native_name": "Norsk bokmål", "supports_neural": True, "region": "NO"},
            {"code": "or-IN", "name": "Odia", "display_name": "Odia (India)", "native_name": "ଓଡ଼ିଆ", "supports_neural": True, "region": "IN"},
            {"code": "so-SO", "name": "Somali", "display_name": "Somali (Somalia)", "native_name": "Soomaaliga", "supports_neural": True, "region": "SO"},
            {"code": "sr-RS", "name": "Serbian", "display_name": "Serbian (Serbia)", "native_name": "Српски", "supports_neural": True, "region": "RS"},
            {"code": "sr-Latn-RS", "name": "Serbian", "display_name": "Serbian (Serbia, Latin)", "native_name": "Srpski", "supports_neural": True, "region": "RS"},
            {"code": "su-ID", "name": "Sundanese", "display_name": "Sundanese (Indonesia)", "native_name": "Basa Sunda", "supports_neural": True, "region": "ID"},
            {"code": "uk-UA", "name": "Ukrainian", "display_name": "Ukrainian (Ukraine)", "native_name": "Українська", "supports_neural": True, "region": "UA"},
            {"code": "uz-UZ", "name": "Uzbek", "display_name": "Uzbek (Uzbekistan)", "native_name": "Oʻzbek", "supports_neural": True, "region": "UZ"},
            {"code": "wuu-CN", "name": "Wu Chinese", "display_name": "Wu Chinese (China)", "native_name": "吴语", "supports_neural": True, "region": "CN"},
            {"code": "yue-CN", "name": "Cantonese", "display_name": "Cantonese (China)", "native_name": "粤语", "supports_neural": True, "region": "CN"},
            {"code": "yue-HK", "name": "Cantonese", "display_name": "Cantonese (Hong Kong)", "native_name": "粤语", "supports_neural": True, "region": "HK"},
        ]
        
        # Comprehensive fallback voices
        self.voices_dataset = [
            # English voices
            {"name": "en-US-JennyNeural", "display_name": "Jenny (US)", "language_code": "en-US", "language_name": "English (United States)", "gender": "Female", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            {"name": "en-US-ChristopherNeural", "display_name": "Christopher (US)", "language_code": "en-US", "language_name": "English (United States)", "gender": "Male", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            {"name": "en-GB-SoniaNeural", "display_name": "Sonia (UK)", "language_code": "en-GB", "language_name": "English (United Kingdom)", "gender": "Female", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            {"name": "en-GB-RyanNeural", "display_name": "Ryan (UK)", "language_code": "en-GB", "language_name": "English (United Kingdom)", "gender": "Male", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            
            # Danish voices
            {"name": "da-DK-ChristelNeural", "display_name": "Christel (DK)", "language_code": "da-DK", "language_name": "Danish (Denmark)", "gender": "Female", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            {"name": "da-DK-JeppeNeural", "display_name": "Jeppe (DK)", "language_code": "da-DK", "language_name": "Danish (Denmark)", "gender": "Male", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            
            # Urdu voices
            {"name": "ur-PK-UzmaNeural", "display_name": "Uzma (PK)", "language_code": "ur-PK", "language_name": "Urdu (Pakistan)", "gender": "Female", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            {"name": "ur-PK-SalmanNeural", "display_name": "Salman (PK)", "language_code": "ur-PK", "language_name": "Urdu (Pakistan)", "gender": "Male", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            {"name": "ur-IN-GulNeural", "display_name": "Gul (IN)", "language_code": "ur-IN", "language_name": "Urdu (India)", "gender": "Female", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            {"name": "ur-IN-SalmanNeural", "display_name": "Salman (IN)", "language_code": "ur-IN", "language_name": "Urdu (India)", "gender": "Male", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            
            # Spanish voices
            {"name": "es-ES-ElviraNeural", "display_name": "Elvira (ES)", "language_code": "es-ES", "language_name": "Spanish (Spain)", "gender": "Female", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            {"name": "es-ES-AlvaroNeural", "display_name": "Alvaro (ES)", "language_code": "es-ES", "language_name": "Spanish (Spain)", "gender": "Male", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            
            # French voices
            {"name": "fr-FR-DeniseNeural", "display_name": "Denise (FR)", "language_code": "fr-FR", "language_name": "French (France)", "gender": "Female", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            {"name": "fr-FR-HenriNeural", "display_name": "Henri (FR)", "language_code": "fr-FR", "language_name": "French (France)", "gender": "Male", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            
            # German voices
            {"name": "de-DE-KatjaNeural", "display_name": "Katja (DE)", "language_code": "de-DE", "language_name": "German (Germany)", "gender": "Female", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
            {"name": "de-DE-ConradNeural", "display_name": "Conrad (DE)", "language_code": "de-DE", "language_name": "German (Germany)", "gender": "Male", "voice_type": "Neural", "sample_rate_hertz": 24000, "styles": []},
        ]
        
        # Create voices-by-language lookup
        self.voices_by_language = {}
        for voice in self.voices_dataset:
            lang_code = voice["language_code"]
            if lang_code not in self.voices_by_language:
                self.voices_by_language[lang_code] = []
            self.voices_by_language[lang_code].append(voice)
    
    async def get_supported_languages(self) -> List[Dict[str, Any]]:
        """Get supported languages from in-memory dataset"""
        
        # Ensure datasets are loaded
        if not self._is_loaded:
            await self.initialize_datasets_on_startup()
        
        logger.info(f"📊 Returning {len(self.languages_dataset)} languages from dataset")
        return self.languages_dataset.copy()  # Return copy to prevent external modification
    
    async def get_supported_voices(self, language_code: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get supported voices from in-memory dataset"""
        
        # Ensure datasets are loaded
        if not self._is_loaded:
            await self.initialize_datasets_on_startup()
        
        if language_code:
            # Return voices for specific language
            voices = self.voices_by_language.get(language_code, [])
            logger.info(f"🎙️ Returning {len(voices)} voices for {language_code}")
            return voices.copy()
        else:
            # Return all voices
            logger.info(f"🎙️ Returning {len(self.voices_dataset)} total voices")
            return self.voices_dataset.copy()
    
    def get_voice_for_language_and_gender(self, language_code: str, gender: str = "Female") -> Optional[Dict[str, Any]]:
        """Get a specific voice for language and gender preference"""
        
        voices = self.voices_by_language.get(language_code, [])
        
        # Try to find Neural voice with preferred gender
        for voice in voices:
            if voice["voice_type"] == "Neural" and voice["gender"] == gender:
                return voice
        
        # Fallback: any Neural voice for this language
        for voice in voices:
            if voice["voice_type"] == "Neural":
                return voice
        
        # Fallback: any voice for this language
        if voices:
            return voices[0]
        
        return None
    
    def get_language_info(self, language_code: str) -> Optional[Dict[str, Any]]:
        """Get language information by code"""
        for lang in self.languages_dataset:
            if lang["code"] == language_code:
                return lang
        return None
    
    def is_language_supported(self, language_code: str) -> bool:
        """Check if a language is supported"""
        return language_code in self.voices_by_language
    
    def get_dataset_stats(self) -> Dict[str, Any]:
        """Get statistics about loaded datasets"""
        return {
            "is_loaded": self._is_loaded,
            "languages_count": len(self.languages_dataset),
            "voices_count": len(self.voices_dataset),
            "azure_available": bool(self.speech_config),
            "languages_with_voices": len(self.voices_by_language),
            "neural_voices_count": len([v for v in self.voices_dataset if v["voice_type"] == "Neural"]),
            "data_source": "Azure Speech Services" if self.speech_config else "Fallback Data"
        }
    
    def _get_language_name(self, language_code: str) -> str:
        """Get friendly language name from language code"""
        language_names = {
            'en': 'English', 'da': 'Danish', 'ur': 'Urdu', 'es': 'Spanish',
            'fr': 'French', 'de': 'German', 'zh': 'Chinese', 'ja': 'Japanese',
            'ko': 'Korean', 'ar': 'Arabic', 'hi': 'Hindi', 'it': 'Italian',
            'pt': 'Portuguese', 'ru': 'Russian', 'nl': 'Dutch', 'sv': 'Swedish',
            'no': 'Norwegian', 'fi': 'Finnish', 'pl': 'Polish', 'tr': 'Turkish',
            'th': 'Thai', 'vi': 'Vietnamese', 'id': 'Indonesian', 'ms': 'Malay',
            'he': 'Hebrew', 'fa': 'Persian', 'sw': 'Swahili', 'af': 'Afrikaans',
            'cs': 'Czech', 'hu': 'Hungarian', 'ro': 'Romanian', 'bg': 'Bulgarian',
            'hr': 'Croatian', 'sk': 'Slovak', 'sl': 'Slovene', 'et': 'Estonian',
            'lv': 'Latvian', 'lt': 'Lithuanian', 'el': 'Greek', 'mt': 'Maltese',
            'ga': 'Irish', 'cy': 'Welsh', 'is': 'Icelandic', 'mk': 'Macedonian',
            'sq': 'Albanian', 'eu': 'Basque', 'ca': 'Catalan', 'gl': 'Galician',
            'bn': 'Bengali', 'ta': 'Tamil', 'te': 'Telugu', 'ml': 'Malayalam',
            'kn': 'Kannada', 'gu': 'Gujarati', 'mr': 'Marathi', 'pa': 'Punjabi',
            'ne': 'Nepali', 'si': 'Sinhala', 'my': 'Myanmar', 'km': 'Khmer',
            'lo': 'Lao', 'ka': 'Georgian', 'am': 'Amharic', 'zu': 'Zulu',
            'xh': 'Xhosa', 'st': 'Southern Sotho', 'tn': 'Tswana', 've': 'Venda',
            'ss': 'Swati', 'nr': 'Southern Ndebele', 'nso': 'Northern Sotho',
            'ts': 'Tsonga',
            # Additional missing languages
            'as': 'Assamese', 'hy': 'Armenian', 'az': 'Azerbaijani', 'bs': 'Bosnian',
            'fil': 'Filipino', 'iu': 'Inuktitut', 'ps': 'Pashto', 'jv': 'Javanese',
            'kk': 'Kazakh', 'mn': 'Mongolian', 'nb': 'Norwegian Bokmål', 'or': 'Odia',
            'so': 'Somali', 'sr': 'Serbian', 'su': 'Sundanese', 'uk': 'Ukrainian',
            'uz': 'Uzbek', 'wuu': 'Wu Chinese', 'yue': 'Cantonese'
        }
        return language_names.get(language_code.lower(), language_code.upper())

    def _get_region_name(self, region_code: str) -> str:
        """Get friendly region name from region code"""
        region_names = {
            # North America
            'US': 'United States', 'CA': 'Canada', 'MX': 'Mexico',
            
            # Europe
            'GB': 'United Kingdom', 'IE': 'Ireland', 'FR': 'France', 'DE': 'Germany',
            'ES': 'Spain', 'IT': 'Italy', 'PT': 'Portugal', 'NL': 'Netherlands',
            'BE': 'Belgium', 'CH': 'Switzerland', 'AT': 'Austria', 'DK': 'Denmark',
            'SE': 'Sweden', 'NO': 'Norway', 'FI': 'Finland', 'IS': 'Iceland',
            'PL': 'Poland', 'CZ': 'Czech Republic', 'SK': 'Slovakia', 'HU': 'Hungary',
            'RO': 'Romania', 'BG': 'Bulgaria', 'HR': 'Croatia', 'SI': 'Slovenia',
            'EE': 'Estonia', 'LV': 'Latvia', 'LT': 'Lithuania', 'GR': 'Greece',
            'MT': 'Malta', 'CY': 'Cyprus', 'AL': 'Albania', 'MK': 'Macedonia',
            'RS': 'Serbia', 'BA': 'Bosnia and Herzegovina', 'ME': 'Montenegro',
            'UA': 'Ukraine', 'BY': 'Belarus', 'MD': 'Moldova', 'RU': 'Russia',
            
            # Asia-Pacific
            'CN': 'China', 'TW': 'Taiwan', 'HK': 'Hong Kong', 'MO': 'Macau',
            'JP': 'Japan', 'KR': 'Korea', 'IN': 'India', 'PK': 'Pakistan',
            'BD': 'Bangladesh', 'LK': 'Sri Lanka', 'MV': 'Maldives', 'NP': 'Nepal',
            'BT': 'Bhutan', 'AF': 'Afghanistan', 'TH': 'Thailand', 'VN': 'Vietnam',
            'MY': 'Malaysia', 'SG': 'Singapore', 'ID': 'Indonesia', 'PH': 'Philippines',
            'BN': 'Brunei', 'KH': 'Cambodia', 'LA': 'Laos', 'MM': 'Myanmar',
            'AU': 'Australia', 'NZ': 'New Zealand', 'FJ': 'Fiji', 'PG': 'Papua New Guinea',
            
            # Middle East
            'SA': 'Saudi Arabia', 'AE': 'UAE', 'QA': 'Qatar', 'BH': 'Bahrain',
            'KW': 'Kuwait', 'OM': 'Oman', 'YE': 'Yemen', 'IR': 'Iran',
            'IQ': 'Iraq', 'IL': 'Israel', 'PS': 'Palestine', 'JO': 'Jordan',
            'LB': 'Lebanon', 'SY': 'Syria', 'TR': 'Turkey', 'CY': 'Cyprus',
            'GE': 'Georgia', 'AM': 'Armenia', 'AZ': 'Azerbaijan',
            
            # Africa
            'EG': 'Egypt', 'LY': 'Libya', 'TN': 'Tunisia', 'DZ': 'Algeria',
            'MA': 'Morocco', 'SD': 'Sudan', 'SS': 'South Sudan', 'ET': 'Ethiopia',
            'ER': 'Eritrea', 'DJ': 'Djibouti', 'SO': 'Somalia', 'KE': 'Kenya',
            'UG': 'Uganda', 'TZ': 'Tanzania', 'RW': 'Rwanda', 'BI': 'Burundi',
            'ZA': 'South Africa', 'NA': 'Namibia', 'BW': 'Botswana', 'ZW': 'Zimbabwe',
            'ZM': 'Zambia', 'MW': 'Malawi', 'MZ': 'Mozambique', 'SZ': 'Eswatini',
            'LS': 'Lesotho', 'MG': 'Madagascar', 'MU': 'Mauritius', 'SC': 'Seychelles',
            'NG': 'Nigeria', 'GH': 'Ghana', 'CI': 'Côte d\'Ivoire', 'BF': 'Burkina Faso',
            'ML': 'Mali', 'NE': 'Niger', 'TD': 'Chad', 'SN': 'Senegal',
            'GM': 'Gambia', 'GW': 'Guinea-Bissau', 'GN': 'Guinea', 'SL': 'Sierra Leone',
            'LR': 'Liberia', 'TG': 'Togo', 'BJ': 'Benin', 'CM': 'Cameroon',
            'CF': 'Central African Republic', 'GQ': 'Equatorial Guinea', 'GA': 'Gabon',
            'CG': 'Republic of the Congo', 'CD': 'Democratic Republic of the Congo',
            'AO': 'Angola',
            
            # Americas (South & Central)
            'BR': 'Brazil', 'AR': 'Argentina', 'CL': 'Chile', 'PE': 'Peru',
            'CO': 'Colombia', 'VE': 'Venezuela', 'EC': 'Ecuador', 'BO': 'Bolivia',
            'PY': 'Paraguay', 'UY': 'Uruguay', 'GY': 'Guyana', 'SR': 'Suriname',
            'GF': 'French Guiana', 'CR': 'Costa Rica', 'PA': 'Panama',
            'NI': 'Nicaragua', 'HN': 'Honduras', 'SV': 'El Salvador', 'GT': 'Guatemala',
            'BZ': 'Belize', 'CU': 'Cuba', 'JM': 'Jamaica', 'HT': 'Haiti',
            'DO': 'Dominican Republic', 'PR': 'Puerto Rico', 'TT': 'Trinidad and Tobago',
            
            # Central Asia
            'KZ': 'Kazakhstan', 'UZ': 'Uzbekistan', 'TM': 'Turkmenistan',
            'TJ': 'Tajikistan', 'KG': 'Kyrgyzstan', 'MN': 'Mongolia'
        }
        return region_names.get(region_code.upper(), region_code)

    def _get_native_name(self, locale: str) -> str:
        """Get native language name for locale"""
        native_names = {
            'en-US': 'English', 'en-GB': 'English', 'en-AU': 'English', 'en-CA': 'English',
            'en-IE': 'English', 'en-NZ': 'English', 'en-ZA': 'English', 'en-IN': 'English',
            'da-DK': 'Dansk', 'ur-PK': 'اردو', 'ur-IN': 'اردو',             'es-ES': 'Español', 'es-MX': 'Español', 'es-AR': 'Español', 'es-CO': 'Español',
            'es-VE': 'Español', 'es-CL': 'Español', 'es-PE': 'Español', 'es-UY': 'Español',
            'es-EC': 'Español', 'es-BO': 'Español', 'es-PY': 'Español', 'es-CR': 'Español',
            'es-PA': 'Español', 'es-GT': 'Español', 'es-HN': 'Español', 'es-SV': 'Español',
            'es-NI': 'Español', 'es-DO': 'Español', 'es-CU': 'Español', 'es-PR': 'Español',
            'fr-FR': 'Français', 'fr-CA': 'Français', 'fr-BE': 'Français', 'fr-CH': 'Français',
            'de-DE': 'Deutsch', 'de-AT': 'Deutsch', 'de-CH': 'Deutsch',
            'zh-CN': '中文 (简体)', 'zh-TW': '中文 (繁體)', 'zh-HK': '中文 (繁體)', 'zh-SG': '中文 (简体)',
            'ja-JP': '日本語',             'ko-KR': '한국어', 'ar-SA': 'العربية', 'ar-EG': 'العربية', 'ar-AE': 'العربية', 'ar-BH': 'العربية',
            'ar-QA': 'العربية', 'ar-KW': 'العربية', 'ar-OM': 'العربية', 'ar-YE': 'العربية',
            'ar-JO': 'العربية', 'ar-LB': 'العربية', 'ar-SY': 'العربية', 'ar-IQ': 'العربية',
            'ar-LY': 'العربية', 'ar-TN': 'العربية', 'ar-DZ': 'العربية', 'ar-MA': 'العربية',
            'hi-IN': 'हिन्दी', 'it-IT': 'Italiano', 'it-CH': 'Italiano',
            'pt-PT': 'Português', 'pt-BR': 'Português',
            'ru-RU': 'Русский', 'nl-NL': 'Nederlands', 'nl-BE': 'Nederlands', 'sv-SE': 'Svenska',
            'no-NO': 'Norsk', 'fi-FI': 'Suomi', 'pl-PL': 'Polski', 'tr-TR': 'Türkçe',
            'th-TH': 'ไทย', 'vi-VN': 'Tiếng Việt', 'id-ID': 'Bahasa Indonesia',
            'ms-MY': 'Bahasa Melayu', 'he-IL': 'עברית', 'fa-IR': 'فارسی',
            'sw-KE': 'Kiswahili', 'af-ZA': 'Afrikaans', 'bn-IN': 'বাংলা',
            'ta-IN': 'தமிழ்', 'te-IN': 'తెలుగు', 'ml-IN': 'മലയാളം',
            'kn-IN': 'ಕನ್ನಡ', 'gu-IN': 'ગુજરાતી', 'mr-IN': 'मराठी',
            'pa-IN': 'ਪੰਜਾਬੀ', 'am-ET': 'አማርኛ', 'zu-ZA': 'isiZulu',
            # Additional missing languages
            'as-IN': 'অসমীয়া', 'hy-AM': 'Հայերեն', 'az-AZ': 'Azərbaycan',
            'bs-BA': 'Bosanski', 'fil-PH': 'Filipino', 'iu-Cans-CA': 'ᐃᓄᒃᑎᑐᑦ',
            'iu-Latn-CA': 'Inuktitut', 'ps-AF': 'پښتو', 'jv-ID': 'Basa Jawa',
            'kk-KZ': 'Қазақ тілі', 'mn-MN': 'Монгол', 'nb-NO': 'Norsk bokmål',
            'or-IN': 'ଓଡ଼ିଆ', 'so-SO': 'Soomaaliga', 'sr-RS': 'Српски',
            'sr-Latn-RS': 'Srpski', 'su-ID': 'Basa Sunda', 'uk-UA': 'Українська',
            'uz-UZ': 'Oʻzbek', 'wuu-CN': '吴语', 'yue-CN': '粤语', 'yue-HK': '粤语'
        }
        return native_names.get(locale, locale)

# Global instance
azure_speech_language_service = AzureSpeechLanguageService()
