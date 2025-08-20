import time
import csv
import os
from datetime import datetime
from pathlib import Path
import threading

class AudioLatencyTracker:
    def __init__(self):
        self.lock = threading.Lock()
        self.logs_dir = Path("logs")
        self.logs_dir.mkdir(exist_ok=True)
        
        # Enhanced CSV headers with detailed timing and token usage
        self.csv_headers = [
            'timestamp',
            'session_id',
            'total_latency_ms',
            'audio_processing_ms',      # Time for Gemini API call
            'translation_processing_ms', # Time for response parsing
            'audio_synthesis_ms',       # Time for TTS generation
            'input_audio_size_bytes',   # Size of received audio file
            'input_audio_duration_ms',  # Estimated duration of input audio
            'gemini_input_tokens',      # Tokens sent to Gemini
            'gemini_output_tokens',     # Tokens received from Gemini
            'gemini_total_tokens',      # Total Gemini tokens used
            'tts_character_count',      # Characters sent to TTS
            'tts_audio_length_ms',      # Length of generated audio
            'audio_language',
            'translation_language',
            'is_direct_query',
            'error_occurred'
        ]
    
    def start_timing(self):
        """Start timing a request - returns timing data structure"""
        return {
            'start_time': time.time(),
            'audio_start': None,
            'audio_end': None,
            'translation_start': None,
            'translation_end': None,
            'synthesis_start': None,
            'synthesis_end': None
        }
    
    def mark_audio_start(self, timing_data):
        """Mark start of audio processing (Gemini API call)"""
        timing_data['audio_start'] = time.time()
    
    def mark_audio_end(self, timing_data):
        """Mark end of audio processing"""
        timing_data['audio_end'] = time.time()
    
    def mark_translation_start(self, timing_data):
        """Mark start of translation processing (response parsing)"""
        timing_data['translation_start'] = time.time()
    
    def mark_translation_end(self, timing_data):
        """Mark end of translation processing"""
        timing_data['translation_end'] = time.time()
    
    def mark_synthesis_start(self, timing_data):
        """Mark start of audio synthesis (TTS)"""
        timing_data['synthesis_start'] = time.time()
    
    def mark_synthesis_end(self, timing_data):
        """Mark end of audio synthesis"""
        timing_data['synthesis_end'] = time.time()
    
    def log_audio_latency(
        self,
        timing_data: dict,
        session_id: str,
        audio_language: str,
        translation_language: str,
        is_direct_query: bool = False,
        error_occurred: bool = False,
        gemini_input_tokens: int = 0,
        gemini_output_tokens: int = 0,
        tts_character_count: int = 0,
        tts_audio_length_ms: int = 0,
        input_audio_size_bytes: int = 0,
        input_audio_duration_ms: int = 0
    ):
        """Log detailed audio processing latency and token usage to CSV"""
        
        end_time = time.time()
        total_latency_ms = (end_time - timing_data['start_time']) * 1000
        
        # Calculate individual component times
        audio_processing_ms = 0
        if timing_data['audio_start'] and timing_data['audio_end']:
            audio_processing_ms = (timing_data['audio_end'] - timing_data['audio_start']) * 1000
        
        translation_processing_ms = 0
        if timing_data['translation_start'] and timing_data['translation_end']:
            translation_processing_ms = (timing_data['translation_end'] - timing_data['translation_start']) * 1000
        
        audio_synthesis_ms = 0
        if timing_data['synthesis_start'] and timing_data['synthesis_end']:
            audio_synthesis_ms = (timing_data['synthesis_end'] - timing_data['synthesis_start']) * 1000
        
        # Calculate total Gemini tokens
        gemini_total_tokens = gemini_input_tokens + gemini_output_tokens
        
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'session_id': session_id,
            'total_latency_ms': round(total_latency_ms, 2),
            'audio_processing_ms': round(audio_processing_ms, 2),
            'translation_processing_ms': round(translation_processing_ms, 2),
            'audio_synthesis_ms': round(audio_synthesis_ms, 2),
            'input_audio_size_bytes': input_audio_size_bytes,
            'input_audio_duration_ms': input_audio_duration_ms,
            'gemini_input_tokens': gemini_input_tokens,
            'gemini_output_tokens': gemini_output_tokens,
            'gemini_total_tokens': gemini_total_tokens,
            'tts_character_count': tts_character_count,
            'tts_audio_length_ms': tts_audio_length_ms,
            'audio_language': audio_language,
            'translation_language': translation_language,
            'is_direct_query': is_direct_query,
            'error_occurred': error_occurred
        }
        
        # Write to CSV
        self._write_to_csv(log_entry, session_id)
        
        # Enhanced console log with breakdown and token usage
        print(f"🕐 Latency & Usage - Session: {session_id[:8]}... | "
              f"Total: {total_latency_ms:.0f}ms | "
              f"Audio: {audio_processing_ms:.0f}ms | "
              f"Translation: {translation_processing_ms:.0f}ms | "
              f"Synthesis: {audio_synthesis_ms:.0f}ms | "
              f"Input: {input_audio_size_bytes}B ({input_audio_duration_ms:.0f}ms) | "
              f"Gemini: {gemini_total_tokens} tokens ({gemini_input_tokens}→{gemini_output_tokens}) | "
              f"TTS: {tts_character_count} chars")
    
    def _write_to_csv(self, log_entry: dict, session_id: str):
        """Write to session-specific CSV file"""
        with self.lock:
            csv_file = self.logs_dir / f"latency_{session_id}.csv"
            file_exists = csv_file.exists()
            
            try:
                with open(csv_file, 'a', newline='', encoding='utf-8') as csvfile:
                    writer = csv.DictWriter(csvfile, fieldnames=self.csv_headers)
                    
                    if not file_exists:
                        writer.writeheader()
                    
                    writer.writerow(log_entry)
                    
            except Exception as e:
                print(f"❌ Latency log error: {e}")

# Global instance
audio_latency_tracker = AudioLatencyTracker()
