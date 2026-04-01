#!/bin/bash
mkdir -p /workspace/.local/bin
if [ ! -f /workspace/.local/bin/yt-dlp ]; then
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /workspace/.local/bin/yt-dlp
  chmod +x /workspace/.local/bin/yt-dlp
fi
export PATH="/workspace/.local/bin:$PATH"
node src/index.js