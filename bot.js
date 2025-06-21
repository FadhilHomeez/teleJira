import { existsSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import TelegramBot from 'node-telegram-bot-api';  // Correct import syntax

import { validateEnv } from './config/env.js';
import { AIService } from './services/ai.service.js';
import { GeminiService } from './services/gemini.service.js';
import { JiraService } from './services/jira.service.js';
import { StorageService } from './services/storage.service.js';
import { setupCommandHandlers } from './handlers/commands.js';
import { setupMessageHandlers } from './handlers/messages.js';
import { setupCallbackHandlers } from './handlers/callbacks.js';
import { setupEditHandlers } from './handlers/edits.js';
import { TEMP_DIR } from './config/index.js';

// Get current directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize services
const env = validateEnv();
const aiService = new AIService(env.geminiApiKey);
const jiraService = new JiraService(env.jiraConfig);
const storageService = new StorageService();

// Initialize Gemini Vision transcription service
let geminiService = null;

try {
  geminiService = new GeminiService();
  console.log('Gemini transcription service initialized');
} catch (error) {
  console.log('Gemini transcription service not available:', error.message);
}

// Initialize bot - THIS IS NOW CORRECT
const bot = new TelegramBot(env.telegramToken, { polling: true });

// Create temp directory if it doesn't exist
if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
}

// Setup handlers
setupCommandHandlers(bot, storageService);
setupMessageHandlers(bot, storageService, aiService, null, geminiService);
setupCallbackHandlers(bot, storageService, jiraService);
setupEditHandlers(bot, storageService);

// Cleanup on exit
process.on('exit', () => {
    if (existsSync(TEMP_DIR)) {
        rmSync(TEMP_DIR, { recursive: true, force: true });
    }
});

// Error handling
process.on('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err);
    try {
        await bot.sendMessage(
            env.adminChatId, 
            `❌ Bot crashed: ${err.message}`
        );
    } catch (e) {
        console.error("Failed to send crash report:", e);
    }
    process.exit(1);
});

console.log("🚀 TaskBot is running...");
bot.sendMessage(env.adminChatId, "🔌 Bot started successfully")
    .catch(err => console.error("Failed to send startup notification:", err));
