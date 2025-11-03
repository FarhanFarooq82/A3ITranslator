#!/bin/bash
# Set up environment variables for A3I Translator API

# Set Google Cloud credentials
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/a3itranslator-9b86c705f20c.json"

echo "Environment variables set:"
echo "GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_APPLICATION_CREDENTIALS"

# Run the API
echo "Starting A3I Translator API..."
dotnet run --project src/A3ITranslator.API
