#!/bin/bash
# Setup script to use .NET 8 for A3I Translator project

echo "Setting up .NET 8 environment..."

# Add .NET 8 to PATH
export PATH="/opt/homebrew/opt/dotnet@8/bin:$PATH"
export DOTNET_ROOT="/opt/homebrew/opt/dotnet@8/libexec"

# Verify .NET version
echo "Current .NET version:"
dotnet --version

# Add to shell profile for persistence
SHELL_RC=""
if [[ $SHELL == */zsh ]]; then
    SHELL_RC="$HOME/.zshrc"
elif [[ $SHELL == */bash ]]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [[ -n $SHELL_RC ]]; then
    echo ""
    echo "To make this permanent, add these lines to $SHELL_RC:"
    echo 'export PATH="/opt/homebrew/opt/dotnet@8/bin:$PATH"'
    echo 'export DOTNET_ROOT="/opt/homebrew/opt/dotnet@8/libexec"'
fi

echo ""
echo "✅ .NET 8 environment is ready!"
echo "You can now run: dotnet build, dotnet test, dotnet run"
