# A3I Translator

A real-time AI-powered translation application with speech recognition and text-to-speech capabilities.

## 🔐 Security Setup

**IMPORTANT**: Before running the application, you must configure your API keys:

1. **Copy the environment template:**
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```

2. **Get your API keys:**
   - **Google Gemini API**: Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - **Azure Speech Services**: Visit [Azure Portal](https://portal.azure.com) → Speech Services

3. **Update the .env files with your actual API keys:**
   ```bash
   GOOGLE_API_KEY=your_actual_google_api_key_here
   AZURE_SPEECH_KEY=your_actual_azure_speech_key_here
   AZURE_SPEECH_REGION=your_azure_region
   ```

⚠️ **Never commit .env files to git - they are already in .gitignore**

## Features

- Real-time speech recognition
- AI-powered translation using Google Gemini
- Text-to-speech with Azure Speech Services
- Multi-language support
- Interactive conversation interface