# AutoJira Bot

A Telegram bot that transcribes audio messages and creates Jira tickets from them.

## Features

- Transcribe voice messages and audio files using Gemini AI
- Extract tasks from transcriptions using Google Gemini AI
- Create Jira tickets from extracted tasks
- Support for multiple projects and task templates

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm
- A Telegram bot token (from BotFather)
- A Google Gemini API key
- Jira account with API token
- FFmpeg (optional, for better handling of large audio files)

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   GEMINI_API_KEY=your_gemini_api_key
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   JIRA_HOST=your_jira_host
   JIRA_EMAIL=your_jira_email
   JIRA_API_TOKEN=your_jira_api_token
   ADMIN_CHAT_ID=your_telegram_chat_id
   ```

### Optional: Installing FFmpeg

For large audio files, the bot can compress them before processing to improve performance. If FFmpeg is installed on your system, the bot will automatically use it. If not, the bot will still work but may be slower with large audio files.

To install FFmpeg:
- **Ubuntu/Debian**: `sudo apt-get install ffmpeg`
- **macOS**: `brew install ffmpeg`
- **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) or install via Chocolatey: `choco install ffmpeg`

## Running the Bot

Start the bot with:

```
node bot.js
```

## Usage

1. Start a chat with your bot on Telegram
2. Send a voice message or audio file
3. The bot will transcribe the audio using Gemini AI
4. It will then extract tasks from the transcription using Gemini AI
5. You can confirm or edit the tasks before creating Jira tickets

## Commands

- `/start` - Start the bot and get a welcome message
- `/help` - Show help information
- `/quick` - Enable quick task mode
- `/template` - Choose a task template
- `/stats` - Show your task creation statistics

## Audio Transcription

The bot supports two methods of audio transcription:

1. **Gemini Vision**: High accuracy transcription using Gemini's vision capabilities. Works well for complex audio with multiple speakers.

2. **Gemini AI**: Default method that works without additional setup. Good for shorter voice notes and simple recordings.

You can switch between these methods using the `/transcribe` command or through the bot's settings menu.

## Troubleshooting

- If you encounter issues with audio transcription, make sure your Gemini API key is valid and correctly set in the .env file.
- For large audio files, the bot will attempt to compress them using FFmpeg. Installing FFmpeg on your system will improve handling of large audio files.
- If transcription fails, try sending a shorter audio message or improve the audio quality.
- If you're experiencing slow transcription with large files, try switching to Gemini Vision mode which may handle complex audio better.
