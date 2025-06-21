# Audio Transcription Integration

This document describes the audio transcription capabilities of the AutoJira bot.

## Overview

The AutoJira bot now supports two methods of audio transcription:

1. **Gemini Vision**: High accuracy transcription using Gemini's vision capabilities.
2. **Gemini AI**: Default method that works without additional setup.

## Implementation Details

### New Files

- `services/gemini.service.js`: A new service that handles audio transcription using Gemini Vision.
- `setup.js`: A setup script to help users configure the bot.
- `.env.example`: A template for the environment variables needed by the bot.
- `README.md`: Updated documentation with instructions for setting up the bot.

### Modified Files

- `bot.js`: Updated to initialize and use the new GeminiService.
- `handlers/messages.js`: Updated to use the user's preferred transcription method.
- `handlers/commands.js`: Added a new `/transcribe` command to toggle between transcription methods.
- `handlers/callbacks.js`: Added handlers for transcription method selection.
- `config/env.js`: Updated to use the Gemini API key.
- `package.json`: Added the Gemini API dependency.

## Features

- **User Preference**: Users can choose their preferred transcription method via the `/transcribe` command or settings menu.
- **Multiple Transcription Options**: Choose between Gemini Vision or Gemini AI based on your needs.
- **Fallback Mechanism**: If Gemini Vision is not available, the bot will automatically fall back to Gemini AI.
- **Visual Processing**: Gemini Vision can analyze audio files using its multimodal capabilities for high accuracy.
- **No Additional Setup**: Both transcription methods work out of the box with your Gemini API key.

## Setup Instructions

To use the audio transcription features:

1. Make sure you have a valid Gemini API key
2. Set the environment variable `GEMINI_API_KEY` in your `.env` file
3. The bot will automatically use the appropriate transcription method based on user preferences

### Optional Dependencies

- **FFmpeg**: For large audio files, the bot can compress them before processing to improve performance. If FFmpeg is installed on your system, the bot will automatically use it. If not, the bot will still work but may be slower with large audio files.

  To install FFmpeg:
  - **Ubuntu/Debian**: `sudo apt-get install ffmpeg`
  - **macOS**: `brew install ffmpeg`
  - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) or install via Chocolatey: `choco install ffmpeg`

For production use, it's recommended to set environment variables permanently in your system or deployment environment.

## Usage

1. Send a voice message or audio file to the bot
2. The bot will transcribe the audio using the preferred method
3. It will then extract tasks from the transcription using Gemini AI
4. You can confirm or edit the tasks before creating Jira tickets

## Comparison of Transcription Methods

| Feature | Gemini Vision | Gemini AI |
|---------|---------------|-----------|
| Speed | Medium | Slower for long recordings |
| Accuracy | High for all audio types | Good for general audio |
| Setup | No additional setup | No additional setup |
| Best for | Complex audio, multiple speakers | Short voice notes |
| Cost | Included with Gemini API | Included with Gemini API |
| Special features | Visual audio processing | Text-only processing |

## Future Improvements

- Add support for more languages
- Implement speaker diarization for multi-speaker transcription
- Add automatic language detection
- Optimize audio preprocessing for better results
