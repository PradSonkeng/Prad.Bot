#!/bin/bash
set -e

mkdir -p /workspace/.local/bin

# Toujours télécharger la dernière version
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
     -o /workspace/.local/bin/yt-dlp
chmod +x /workspace/.local/bin/yt-dlp

export PATH="/workspace/.local/bin:$PATH"

# Vérifie la version (visible dans les logs Koyeb)
yt-dlp --version || true

node src/index.js