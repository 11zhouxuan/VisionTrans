#!/bin/bash
# Setup AWS git-secrets for local development
# Run this once after cloning the repository
# Usage: ./scripts/setup-git-secrets.sh

set -e

echo "🔧 Setting up AWS git-secrets..."

# Check if git-secrets is installed
if ! command -v git-secrets &> /dev/null; then
    echo "📦 git-secrets not found. Installing..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install git-secrets
        else
            echo "❌ Homebrew not found. Please install git-secrets manually:"
            echo "   https://github.com/awslabs/git-secrets#installing-git-secrets"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        git clone https://github.com/awslabs/git-secrets.git /tmp/git-secrets
        cd /tmp/git-secrets && sudo make install
        cd - > /dev/null
        rm -rf /tmp/git-secrets
    else
        echo "❌ Unsupported OS. Please install git-secrets manually:"
        echo "   https://github.com/awslabs/git-secrets#installing-git-secrets"
        exit 1
    fi
    
    echo "✅ git-secrets installed"
fi

# Install git-secrets hooks into this repo
echo "🔗 Installing git-secrets hooks..."
git secrets --install -f

# Register AWS patterns
echo "🔐 Registering AWS credential patterns..."
git secrets --register-aws

# Add custom patterns for this project
echo "🔐 Adding custom prohibited patterns..."

# OpenAI API keys
git secrets --add 'sk-[a-zA-Z0-9]{20,}' 2>/dev/null || true

# Generic private keys
git secrets --add 'BEGIN.*PRIVATE KEY' 2>/dev/null || true

# Add allowed patterns (placeholders in code/docs)
git secrets --add --allowed 'sk-xxx' 2>/dev/null || true
git secrets --add --allowed 'sk-your' 2>/dev/null || true
git secrets --add --allowed 'sk-xxxxxxxxxxxxxxxx' 2>/dev/null || true
git secrets --add --allowed 'AKIA\[0-9A-Z\]' 2>/dev/null || true
git secrets --add --allowed 'sk-\[a-zA-Z0-9\]' 2>/dev/null || true

echo ""
echo "✅ git-secrets setup complete!"
echo ""
echo "git-secrets will now automatically scan every commit for:"
echo "  • AWS Access Key IDs (AKIA...)"
echo "  • AWS Secret Access Keys"
echo "  • OpenAI API Keys (sk-...)"
echo "  • Private Keys (BEGIN PRIVATE KEY)"
echo ""
echo "To manually scan the repo: git secrets --scan"