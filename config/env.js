import 'dotenv/config';
import path from 'path';

export function validateEnv() {
    const requiredEnvVars = [
        'GEMINI_API_KEY',
        'TELEGRAM_BOT_TOKEN',
        'JIRA_HOST',
        'JIRA_EMAIL',
        'JIRA_API_TOKEN',
        'ADMIN_CHAT_ID'
        // GOOGLE_APPLICATION_CREDENTIALS should be set in the environment
        // but we don't make it required to allow fallback to Gemini for transcription
    ];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
    }

    return {
        geminiApiKey: process.env.GEMINI_API_KEY,
        telegramToken: process.env.TELEGRAM_BOT_TOKEN,
        jiraConfig: {
            host: process.env.JIRA_HOST.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
            email: process.env.JIRA_EMAIL,
            apiToken: process.env.JIRA_API_TOKEN
        },
        adminChatId: process.env.ADMIN_CHAT_ID
    };
}
