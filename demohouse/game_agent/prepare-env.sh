#!/bin/bash

set -euo pipefail

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "> Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    echo "✓ uv installation completed"
    # Add uv to PATH
    export PATH="$HOME/.local/bin:$PATH"
fi

# Install Python
uv python install 3.11
uv python pin 3.11

# Initialize virtual environment
echo "> Creating virtual environment..."
uv venv --prompt game_demo || {
    echo "✗ Failed to create virtual environment"
    exit 1
}

# Activate environment
source .venv/bin/activate

# Update project environment，会根据uv.lock去查找依赖
# 可以替换成其他源，清华源：https://pypi.tuna.tsinghua.edu.cn/simple
uv sync --index-url https://bytedpypi.byted.org/simple/

echo "✓ Environment setup completed"
echo "Run 'source .venv/bin/activate' to activate the environment"