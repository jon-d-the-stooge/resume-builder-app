#!/bin/bash

# Setup script for Anthropic API key

echo "🔑 Anthropic API Key Setup"
echo "=========================="
echo ""

# Check if .env already exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists"
    echo ""
    read -p "Do you want to update it? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

echo "To get an API key:"
echo "1. Go to https://console.anthropic.com/"
echo "2. Sign up or log in"
echo "3. Navigate to API Keys section"
echo "4. Create a new API key"
echo ""

read -p "Enter your Anthropic API key: " api_key

if [ -z "$api_key" ]; then
    echo "❌ No API key provided"
    exit 1
fi

# Create or update .env file
echo "ANTHROPIC_API_KEY=$api_key" > .env

echo ""
echo "✅ API key saved to .env file"
echo ""
echo "You can now run the test:"
echo "  npx tsx test-parser.ts"
echo ""
echo "Or export it for the current session:"
echo "  export ANTHROPIC_API_KEY=\"$api_key\""
