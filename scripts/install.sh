#!/bin/bash
# Installer yt-dlp dans le dossier home (pas besoin de sudo)
YT_DLP="$HOME/.local/bin/yt-dlp"
mkdir -p "$HOME/.local/bin"

if [ ! -f "$YT_DLP" ]; then
  echo "Installation de yt-dlp..."
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$YT_DLP"
  chmod +x "$YT_DLP"
  echo "yt-dlp installé !"
fi

export PATH="$HOME/.local/bin:$PATH"
node src/index.js