import { sendSafeMessage } from '../utils/safeSend.js';
import { escapeMarkdownV2 } from '../utils/formatters.js';
import { chunkArray } from './helpers.js';

/**
 * Sets up command handlers for the bot
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} storageService - The storage service
 */
export function setupCommandHandlers(bot, storageService) {
    // Command to toggle transcription method
    bot.onText(/\/transcribe/, async (msg) => {
        const chatId = msg.chat.id;
        const session = storageService.getSession(chatId);
        const preferences = session.preferences || {};
        
        await bot.sendMessage(
            chatId,
            "🎙️ *Transcription Method*\n\nChoose which method to use for transcribing audio messages:",
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { 
                                text: "👁️ Gemini Vision (Accurate)", 
                                callback_data: "transcribe_gemini_vision" 
                            }
                        ],
                        [
                            { 
                                text: "🤖 Gemini AI (Default)", 
                                callback_data: "transcribe_gemini" 
                            }
                        ],
                        [
                            { 
                                text: "ℹ️ About Transcription Methods", 
                                callback_data: "transcribe_info" 
                            }
                        ]
                    ]
                },
                parse_mode: 'MarkdownV2'
            }
        );
    });
    
    bot.onText(/\/start/, async (msg) => {
        const welcomeMsg = escapeMarkdownV2(`
👋 *Welcome to TaskBot!*  
I create Jira tasks from your messages with AI assistance.

*Quick Start:*
• Send any task description
• Use /quick for AI\\-enhanced tasks
• Use /template for structured tasks
• Voice messages are automatically transcribed

*Examples:*
• \`Fix login bug\`
• \`Review marketing materials\`
• \`Update user documentation\`
• \`/quick Optimize database queries\`

*Need help?* Use /help for detailed instructions.
        `, true);
        
        await sendSafeMessage(bot, msg.chat.id, welcomeMsg, { isPreFormatted: true });
        
        // Send quick action buttons
        await bot.sendMessage(
            msg.chat.id,
            "🚀 *Get Started:*",
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "⚡ Quick Task", callback_data: "quick_task" },
                            { text: "📋 Templates", callback_data: "show_templates" }
                        ],
                        [
                            { text: "📊 My Stats", callback_data: "show_stats" },
                            { text: "⚙️ Settings", callback_data: "show_settings" }
                        ]
                    ]
                },
                parse_mode: 'MarkdownV2'
            }
        );
    });

    bot.onText(/\/help/, async (msg) => {
        const helpMsg = escapeMarkdownV2(`
📘 *TaskBot Help Guide*

*Input Methods:*
1️⃣ *Text Messages*
   • Simple: \`Fix login bug\`
   • Multiple: \`*Task 1: Description\`\n\`*Task 2: Description\`

2️⃣ *Voice Messages* 🎤
   • Max 20 minutes
   • Auto\\-transcribed to text
   • AI\\-enhanced suggestions

3️⃣ *Audio Files* 🔊
   • Same as voice messages
   • Supports various formats

*Commands:*
• \`/quick <task>\` \\- AI\\-enhanced task creation
• \`/template\` \\- Choose from task templates
• \`/stats\` \\- View your task statistics
• \`/settings\` \\- Configure default project
• \`/transcribe\` \\- Choose audio transcription method

*AI Features:*
• Automatic project suggestion
• Priority estimation
• Effort estimation
• Task enhancement

*Projects:*
• WEB \\- Website tasks
• MRK \\- Marketing tasks  
• DEV \\- Development tasks
• GEN \\- General tasks

*Tips:*
• Set a default project to skip selection
• Use templates for structured tasks
• Edit tasks before creating in Jira
• Voice messages work great for quick capture
        `, true);
        
        await sendSafeMessage(bot, msg.chat.id, helpMsg, { isPreFormatted: true });
    });

    bot.onText(/\/settings/, async (msg) => {
        const session = storageService.getSession(msg.chat.id);
        const currentProject = session.defaultProject || 'GEN';
        const preferences = session.preferences || {};
        const transcriptionMethod = preferences.transcriptionMethod || 'gemini';
        
        let transcriptionMethodText = 'Gemini AI';
        if (transcriptionMethod === 'gemini_vision') {
            transcriptionMethodText = 'Gemini Vision';
        }
        
        const settingsMsg = escapeMarkdownV2(`
⚙️ *Your Settings*

*Current Default Project:* ${currentProject}
*Total Tasks Created:* ${session.taskCount || 0}
*Transcription Method:* ${transcriptionMethodText}

*Change Default Project:*
        `, true);
        
        await sendSafeMessage(bot, msg.chat.id, settingsMsg, { isPreFormatted: true });
        
        // Send project selection buttons
        const projectButtons = [
            { key: 'WEB', name: 'Website' },
            { key: 'MRK', name: 'Marketing' },
            { key: 'DEV', name: 'Development' },
            { key: 'GEN', name: 'General' }
        ].map(project => ({
            text: `${project.name} (${project.key})`,
            callback_data: `setdefaultproj_${project.key}`
        }));

        await bot.sendMessage(
            msg.chat.id,
            "Select new default project:",
            {
                reply_markup: {
                    inline_keyboard: [
                        ...chunkArray(projectButtons, 2),
                        [{ text: "✏️ Enter Custom", callback_data: "customdefaultproj" }],
                        [{ text: "🎙️ Change Transcription Method", callback_data: "show_transcribe" }]
                    ]
                }
            }
        );
    });

    bot.onText(/\/stats/, async (msg) => {
        const session = storageService.getSession(msg.chat.id);
        const taskCount = session.taskCount || 0;
        const defaultProject = session.defaultProject || 'GEN';
        
        const statsMsg = escapeMarkdownV2(`
📊 *Your TaskBot Statistics*

*Tasks Created:* ${taskCount}
*Default Project:* ${defaultProject}
*Session Started:* ${session.sessionStart ? new Date(session.sessionStart).toLocaleDateString() : 'Today'}

${taskCount > 0 ? `🎉 *Great job!* You've created ${taskCount} tasks so far.` : '🚀 *Ready to create your first task!*'}
        `, true);
        
        await sendSafeMessage(bot, msg.chat.id, statsMsg, { isPreFormatted: true });
    });
}
