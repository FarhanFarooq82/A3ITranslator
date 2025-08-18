import re
import logging

logger = logging.getLogger(__name__)


def process_text_to_ssml(text: str, tone: str = "neutral") -> str:
    """Convert text with non-verbal expressions to SSML format for Azure TTS."""
    processed_text = text
    processed_text = re.sub(r'\[laughter\]', '<mstts:express-as style="laughter">', processed_text)
    processed_text = processed_text.replace('[/laughter]', '</mstts:express-as>')
    expressions = {
        r'\[sigh\]': '<mstts:express-as style="sigh"></mstts:express-as>',
        r'\[cough\]': '<mstts:express-as style="cough"></mstts:express-as>',
        r'\[crying\]': '<mstts:express-as style="crying"></mstts:express-as>',
        r'\[gasp\]': '<mstts:express-as style="gasp"></mstts:express-as>',
        r'\[clearing throat\]': '<mstts:express-as style="clearing-throat"></mstts:express-as>',
        r'\[whisper\](.+?)\[/whisper\]': r'<prosody volume="x-soft">\1</prosody>',
        r'\[shouting\](.+?)\[/shouting\]': r'<prosody volume="x-loud" pitch="high">\1</prosody>',
        r'\[pause\]': '<break time="1s"/>'
    }
    for pattern, replacement in expressions.items():
        processed_text = re.sub(pattern, replacement, processed_text)
    return processed_text


def fix_ssml_content(text: str) -> str:
    """
    Fix common SSML issues and ensure proper formatting
    
    Args:
        text: SSML content that may have issues
        
    Returns:
        Fixed and validated SSML content
    """
    if not text:
        return text
        
    # Remove any existing <speak> or <voice> tags if they leaked through
    text = re.sub(r'<speak[^>]*>', '', text)
    text = re.sub(r'</speak>', '', text)
    text = re.sub(r'<voice[^>]*>', '', text)
    text = re.sub(r'</voice>', '', text)
    
    # Fix malformed break tags with double slashes (common AI generation issue)
    malformed_breaks = len(re.findall(r'<break([^>]*?)//>', text))
    text = re.sub(r'<break([^>]*?)//>', r'<break\1/>', text)
    if malformed_breaks > 0:
        logger.info(f"Fixed {malformed_breaks} malformed <break> tags with double slashes")
    
    # Fix other malformed self-closing tags
    text = re.sub(r'<(break|pause)([^>]*?)//>', r'<\1\2/>', text)
    
    # Escape problematic characters in text content
    # Escape single quotes inside attribute values
    text = re.sub(r"(\w+)='([^']*)'s([^']*)'", r'\1="\2&apos;s\3"', text)
    
    # Fix unclosed <prosody> tags
    prosody_open = len(re.findall(r'<prosody[^>]*>', text))
    prosody_close = len(re.findall(r'</prosody>', text))
    if prosody_open > prosody_close:
        text += '</prosody>' * (prosody_open - prosody_close)
        logger.info(f"Fixed {prosody_open - prosody_close} unclosed <prosody> tags")
    
    # Fix unclosed <emphasis> tags
    emphasis_open = len(re.findall(r'<emphasis[^>]*>', text))
    emphasis_close = len(re.findall(r'</emphasis>', text))
    if emphasis_open > emphasis_close:
        text += '</emphasis>' * (emphasis_open - emphasis_close)
        logger.info(f"Fixed {emphasis_open - emphasis_close} unclosed <emphasis> tags")
    
    # Fix unclosed <mstts:express-as> tags
    express_open = len(re.findall(r'<mstts:express-as[^>]*>', text))
    express_close = len(re.findall(r'</mstts:express-as>', text))
    if express_open > express_close:
        text += '</mstts:express-as>' * (express_open - express_close)
        logger.info(f"Fixed {express_open - express_close} unclosed <mstts:express-as> tags")
    
    # Fix malformed attribute values (ensure quotes)
    attr_fixes = len(re.findall(r'<(\w+)\s+(\w+)=([^"\s>]+)', text))
    text = re.sub(r'<(\w+)\s+(\w+)=([^"\s>]+)', r'<\1 \2="\3"', text)
    if attr_fixes > 0:
        logger.info(f"Fixed {attr_fixes} unquoted SSML attributes")
    
    # Fix nonverbal expressions - convert to SSML express-as
    nonverbal_map = {
        r'\[laughter\]': '<mstts:express-as style="cheerful">[laughter]</mstts:express-as>',
        r'\[sigh\]': '<mstts:express-as style="sad">[sigh]</mstts:express-as>',
        r'\[cough\]': '<break time="500ms"/>',
        r'\[crying\]': '<mstts:express-as style="sad">[crying]</mstts:express-as>',
        r'\[whisper\]': '<prosody volume="x-soft">',  # Note: needs closing tag
        r'\[shout\]': '<prosody volume="x-loud">',    # Note: needs closing tag
    }
    
    for pattern, replacement in nonverbal_map.items():
        if re.search(pattern, text, flags=re.IGNORECASE):
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
            logger.debug(f"Converted nonverbal expression: {pattern}")
    
    # Clean up multiple spaces and newlines
    text = re.sub(r'\s+', ' ', text).strip()
    
    logger.debug(f"SSML content fixed and validated: {text[:100]}...")
    return text
