#!/usr/bin/env python3
"""
Test script for AI Assistant and Backend Conversation Storage features
"""

import asyncio
import json
import requests
from datetime import datetime

# Base URL for the backend
BASE_URL = "http://localhost:8000"

def test_conversation_sync():
    """Test conversation synchronization"""
    print("🔄 Testing conversation sync...")
    
    # Sample conversation data
    conversation_data = {
        "sessionId": "test-session-123",
        "conversation": [
            {
                "text": "Hello, how are you?",
                "language": "en",
                "speaker": "user",
                "timestamp": datetime.now().isoformat(),
                "type": "transcription"
            },
            {
                "text": "Hola, ¿cómo estás?",
                "language": "es",
                "speaker": "user",
                "timestamp": datetime.now().isoformat(),
                "type": "translation"
            }
        ],
        "timestamp": int(datetime.now().timestamp() * 1000)
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/conversation/sync", json=conversation_data)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Sync successful: {result['messageCount']} messages synced")
            print(f"   Summary topics: {result['summary']['topics']}")
            return result
        else:
            print(f"❌ Sync failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Sync error: {e}")
        return None

def test_conversation_load():
    """Test conversation loading"""
    print("\n📂 Testing conversation load...")
    
    try:
        response = requests.get(f"{BASE_URL}/api/conversation/load/test-session-123")
        if response.status_code == 200:
            result = response.json()
            conversation = result['conversation']
            print(f"✅ Load successful: {len(conversation)} messages loaded")
            if conversation:
                print(f"   First message: {conversation[0]['text']}")
            return result
        else:
            print(f"❌ Load failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Load error: {e}")
        return None

def test_context_optimization():
    """Test context optimization"""
    print("\n🎯 Testing context optimization...")
    
    try:
        response = requests.get(f"{BASE_URL}/api/context/optimize/test-session-123")
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Context optimization successful")
            print(f"   Token estimate: {result['tokenEstimate']}")
            print(f"   Recent messages: {len(result['recentMessages'])}")
            print(f"   Session info: {result['sessionInfo']['totalMessages']} total messages")
            return result
        else:
            print(f"❌ Context optimization failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Context optimization error: {e}")
        return None

def test_health_check():
    """Test backend health"""
    print("\n🏥 Testing backend health...")
    
    try:
        response = requests.get(f"{BASE_URL}/api/health")
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Backend healthy")
            print(f"   Status: {result['status']}")
            print(f"   Features: {', '.join(result['features'])}")
            return result
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return None

async def test_comprehensive_audio_analysis():
    """Test comprehensive audio analysis (mock)"""
    print("\n🎤 Testing comprehensive audio analysis...")
    
    # This would require actual audio file for real testing
    print("   ℹ️  Audio analysis requires actual audio file")
    print("   ℹ️  Intent detection logic: translation vs assistant query")
    print("   ℹ️  Context-aware processing with conversation history")
    print("   ℹ️  Expert responses isolated from conversation")

def run_all_tests():
    """Run all tests"""
    print("🚀 Starting AI Assistant and Backend Storage Tests")
    print("=" * 60)
    
    # Test health first
    health = test_health_check()
    if not health:
        print("❌ Backend is not healthy. Please start the backend server.")
        return
    
    # Test conversation features
    sync_result = test_conversation_sync()
    if sync_result:
        load_result = test_conversation_load()
        if load_result:
            context_result = test_context_optimization()
    
    # Test audio analysis (mock)
    asyncio.run(test_comprehensive_audio_analysis())
    
    print("\n" + "=" * 60)
    print("🎉 Test suite completed!")
    print("\n📋 Summary of AI Assistant Features:")
    print("   • Conversation storage and synchronization")
    print("   • Context optimization for LLM efficiency")
    print("   • Intent detection (translation vs assistant)")
    print("   • Expert responses isolated from conversation")
    print("   • Automatic conversation summarization")
    print("   • Token usage optimization")

if __name__ == "__main__":
    print("AI Assistant & Backend Storage Test Suite")
    print("Make sure the backend server is running: uvicorn main:app --reload")
    input("Press Enter to continue...")
    run_all_tests()
