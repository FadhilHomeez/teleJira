import { escapeMarkdownV2, formatTaskCard } from '../utils/formatters.js';
import { KNOWN_PROJECTS, MAX_AUDIO_DURATION } from '../config/index.js';
import { chunkArray } from './helpers.js';
import { sendTaskConfirmation } from './helpers.js'; // <-- Import shared one
import { parseTaskText, generateTaskSuggestions } from '../utils/helpers.js';


export function setupMessageHandlers(bot, storageService, aiService, speechService, geminiService) {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text?.trim();
        const session = storageService.getSession(chatId);
        
        // Skip if in edit mode - let the edit handlers handle it
        const editState = storageService.getEditState(chatId);
        if (editState) {
            return;
        }

        // Handle project key input if waiting for it
        if (session.waitingForDefaultProject && text) {
            if (/^[A-Z]{2,4}$/.test(text)) {
                storageService.updateSession(chatId, { 
                    defaultProject: text,
                    waitingForDefaultProject: false
                });
                await bot.sendMessage(chatId, `✅ Default project set to ${text}`);
                await processPendingTasks(bot, storageService, aiService, chatId);
            } else {
                await bot.sendMessage(
                    chatId,
                    "⚠️ Invalid project key. Use 2-4 uppercase letters. Please try again:",
                    { reply_markup: { force_reply: true } }
                );
            }
            return;
        }

        // Handle normal messages
        try {
            if (msg.voice) {
                await handleVoiceMessage(bot, storageService, aiService, speechService, chatId, msg.voice);
                return;
            }

            if (msg.audio) {
                await handleAudioMessage(bot, storageService, aiService, speechService, chatId, msg.audio);
                return;
            }

            if (text) {
                // Handle quick commands
                if (text.startsWith('/')) {
                    await handleQuickCommands(bot, storageService, chatId, text);
                    return;
                }

                // Handle smart task parsing
                if (text.includes('*')) {
                    await handleBulletPoints(bot, storageService, aiService, chatId, text);
                } else {
                    await handleSingleTask(bot, storageService, aiService, chatId, text);
                }
            }
        } catch (error) {
            console.error("Message error:", error);
            await bot.sendMessage(chatId, "😕 Something went wrong. Please try again.");
        }
    });
}

async function processPendingTasks(bot, storageService, aiService, chatId) {
    const session = storageService.getSession(chatId);
    if (!session?.pendingTasks) return;

    for (const task of session.pendingTasks) {
        const taskWithId = storageService.createTask({
            ...task,
            projectKey: session.defaultProject || 'GEN'
        });
        await sendTaskConfirmation(bot, chatId, taskWithId);
    }

    storageService.updateSession(chatId, { 
        pendingTasks: undefined,
        lastMessageId: undefined 
    });
}

async function promptForDefaultProject(bot, chatId) {
    const projectButtons = KNOWN_PROJECTS.map(project => ({
        text: `${project.name} (${project.key})`,
        callback_data: `setdefaultproj_${project.key}`
    }));

    await bot.sendMessage(
        chatId,
        "📂 *Set default project for all tasks*",
        {
            reply_markup: {
                inline_keyboard: [
                    ...chunkArray(projectButtons, 2),
                    [{ text: "✏️ Enter Custom", callback_data: "customdefaultproj" }],
                    [{ text: "⏩ Skip", callback_data: "skipdefaultproj" }]
                ]
            },
            parse_mode: 'MarkdownV2'
        }
    );
}

async function handleQuickCommands(bot, storageService, chatId, text) {
    const command = text.toLowerCase();
    
    switch (command) {
        case '/quick':
            await bot.sendMessage(
                chatId,
                "⚡ *Quick Task Mode*\n\nSend your task in one line:\n`/quick Fix login bug`\n`/quick Review marketing materials`",
                { parse_mode: 'MarkdownV2' }
            );
            storageService.updateSession(chatId, { quickMode: true });
            break;
            
        case '/template':
            await bot.sendMessage(
                chatId,
                "📋 *Task Templates*\n\nChoose a template:",
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🐛 Bug Report", callback_data: "template_bug" }],
                            [{ text: "✨ Feature Request", callback_data: "template_feature" }],
                            [{ text: "📝 Documentation", callback_data: "template_docs" }],
                            [{ text: "🔧 Maintenance", callback_data: "template_maintenance" }]
                        ]
                    },
                    parse_mode: 'MarkdownV2'
                }
            );
            break;
            
        case '/stats':
            const session = storageService.getSession(chatId);
            const taskCount = session.taskCount || 0;
            await bot.sendMessage(
                chatId,
                `📊 *Your Stats*\n\nTasks created: ${taskCount}\nDefault project: ${session.defaultProject || 'GEN'}`,
                { parse_mode: 'MarkdownV2' }
            );
            break;
            
        default:
            if (command.startsWith('/quick ')) {
                const taskText = text.substring(7);
                await handleQuickTask(bot, storageService, aiService, chatId, taskText);
            }
    }
}

async function handleQuickTask(bot, storageService, aiService, chatId, taskText) {
    await bot.sendMessage(chatId, "🤖 *AI is analyzing your task\\.\\.\\.*", { parse_mode: 'MarkdownV2' });
    
    // Use AI to enhance the task
    const enhanced = await aiService.enhanceTaskDescription(taskText);
    const suggestedProject = await aiService.suggestProject(taskText);
    
    const task = {
        ...enhanced,
        projectKey: suggestedProject
    };
    
    const taskWithId = storageService.createTask(task);
    
    await bot.sendMessage(
        chatId,
        `✨ *AI Enhanced Task*\n\n${formatTaskCard(taskWithId, 1, 1)}\n\n*AI Suggestions:*\n• Project: ${suggestedProject}\n• Priority: ${enhanced.priority}\n${enhanced.estimatedEffort ? `• Effort: ${enhanced.estimatedEffort}` : ''}`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🚀 Create Now", callback_data: `create_${taskWithId.taskId}` },
                        { text: "✏️ Edit", callback_data: `edit_${taskWithId.taskId}` }
                    ],
                    [
                        { text: "🔄 Use Original", callback_data: `original_${taskWithId.taskId}` }
                    ]
                ]
            },
            parse_mode: 'MarkdownV2'
        }
    );
}

async function handleBulletPoints(bot, storageService, aiService, chatId, text) {
    const tasks = text.split('\n*')
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => {
            const parsed = parseTaskText(item);
            const summary = parsed.cleanText.split(':')[0].trim();
            const description = parsed.cleanText.split(':').slice(1).join(':').trim();
            
            return {
                summary: summary.length > 50 ? summary.substring(0, 47) + '\\.\\.\\.' : summary,
                description: description || parsed.cleanText,
                priority: parsed.priority,
                estimatedEffort: parsed.estimatedEffort,
                dueDate: parsed.dueDate,
                originalText: item
            };
        });

    storageService.updateSession(chatId, { pendingTasks: tasks });
    await promptForDefaultProject(bot, chatId);
}

async function handleSingleTask(bot, storageService, aiService, chatId, text) {
    // Parse the text for priority, effort, and dates
    const parsed = parseTaskText(text);
    
    // Create basic task
    const task = {
        summary: parsed.cleanText.length > 100 ? parsed.cleanText.substring(0, 97) + '\\.\\.\\.' : parsed.cleanText,
        description: parsed.cleanText,
        priority: parsed.priority,
        estimatedEffort: parsed.estimatedEffort,
        dueDate: parsed.dueDate,
        originalText: text
    };

    // Check if user has auto-enhancement enabled
    const session = storageService.getSession(chatId);
    const preferences = session.preferences || {};
    
    if (preferences.autoEnhance && aiService) {
        await bot.sendMessage(chatId, "🤖 *AI is analyzing your task\\.\\.\\.*", { parse_mode: 'MarkdownV2' });
        
        try {
            // Use AI to enhance the task
            const enhanced = await aiService.enhanceTaskDescription(text);
            const suggestedProject = await aiService.suggestProject(text);
            
            const enhancedTask = {
                ...task,
                ...enhanced,
                projectKey: suggestedProject
            };
            
            const taskWithId = storageService.createTask(enhancedTask);
            
            // Generate suggestions
            const suggestions = generateTaskSuggestions(text);
            
            let suggestionText = '';
            if (suggestions.length > 0) {
                suggestionText = `\n\n💡 *Suggestions:*\n${suggestions.map(s => `• ${s}`).join('\n')}`;
            }
            
            await bot.sendMessage(
                chatId,
                `✨ *AI Enhanced Task*\n\n${formatTaskCard(taskWithId, 1, 1)}\n\n*AI Suggestions:*\n• Project: ${suggestedProject}\n• Priority: ${enhancedTask.priority}\n${enhancedTask.estimatedEffort ? `• Effort: ${enhancedTask.estimatedEffort}` : ''}${suggestionText}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🚀 Create Now", callback_data: `create_${taskWithId.taskId}` },
                                { text: "✏️ Edit", callback_data: `edit_${taskWithId.taskId}` }
                            ],
                            [
                                { text: "🔄 Use Original", callback_data: `original_${taskWithId.taskId}` }
                            ]
                        ]
                    },
                    parse_mode: 'MarkdownV2'
                }
            );
            return;
        } catch (error) {
            console.error("AI enhancement failed:", error);
            // Fall back to basic task creation
        }
    }
    
    // Basic task creation without AI enhancement
    const taskWithId = storageService.createTask(task);
    await sendTaskConfirmation(bot, chatId, taskWithId);
}

async function handleVoiceMessage(bot, storageService, aiService, speechService, chatId, voice) {
    const processingMsg = await bot.sendMessage(chatId, "🔊 Processing voice message...");
    
    // Get user preferences for transcription method
    const session = storageService.getSession(chatId);
    const preferences = session.preferences || {};
    const transcriptionMethod = preferences.transcriptionMethod || 'gemini';
    
    // Choose transcription method based on user preference
    let transcription;
    if (transcriptionMethod === 'gemini_vision' && geminiService) {
        console.log("Using Gemini Vision for transcription");
        transcription = await geminiService.transcribeAudio(bot, voice.file_id, voice.duration);
    } else {
        console.log("Using Gemini AI for transcription");
        transcription = await aiService.transcribeAudio(bot, voice.file_id, voice.duration);
    }
    
    if (!transcription) {
        await bot.sendMessage(chatId, "❌ Couldn't process the voice message. Please try again or type your task.");
        return;
    }
    
    // Update processing message to indicate task extraction
    await bot.editMessageText(
        "🔍 Transcription complete. Extracting tasks...",
        {
            chat_id: chatId,
            message_id: processingMsg.message_id
        }
    ).catch(err => {
        console.warn("Failed to edit message:", err);
    });
    
    // Extract tasks from transcription
    const tasks = await aiService.extractTasksFromTranscription(transcription);
    
    // Properly escape the tasks for MarkdownV2 format
    const safeTasks = escapeMarkdownV2(tasks);
    
    // Edit the processing message to show extracted tasks
    const message = `📋 *Extracted Tasks:*\n${safeTasks}\n\nProcessing tasks\\.\\.\\.`;
    
    await bot.editMessageText(
        message,
        {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: 'MarkdownV2'
        }
    ).catch(err => {
        console.warn("Failed to edit message:", err);
        // If editing fails, send as new message
        return bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
    });
    
    // Check if the tasks contain bullet points (indicated by * prefix)
    if (tasks.includes('*')) {
      // If tasks are in bullet point format, process them as multiple tasks
      console.log("Processing multiple tasks from audio");
      await handleBulletPoints(bot, storageService, aiService, chatId, tasks);
    } else {
      // If no bullet points, process as a single task
      console.log("Processing single task from audio");
      await handleSingleTask(bot, storageService, aiService, chatId, tasks);
    }
}

async function handleAudioMessage(bot, storageService, aiService, speechService, chatId, audio) {
    const processingMsg = await bot.sendMessage(chatId, "🔊 Processing audio file...");
    
    // Get user preferences for transcription method
    const session = storageService.getSession(chatId);
    const preferences = session.preferences || {};
    const transcriptionMethod = preferences.transcriptionMethod || 'gemini';
    
    // Choose transcription method based on user preference
    let transcription;
    if (transcriptionMethod === 'gemini_vision' && geminiService) {
        console.log("Using Gemini Vision for transcription");
        transcription = await geminiService.transcribeAudio(bot, audio.file_id, audio.duration);
    } else {
        console.log("Using Gemini AI for transcription");
        transcription = await aiService.transcribeAudio(bot, audio.file_id, audio.duration);
    }
    
    if (!transcription) {
        await bot.sendMessage(chatId, "❌ Couldn't process the audio file. Please try again or type your task.");
        return;
    }
    
    // Update processing message to indicate task extraction
    await bot.editMessageText(
        "🔍 Transcription complete. Extracting tasks...",
        {
            chat_id: chatId,
            message_id: processingMsg.message_id
        }
    ).catch(err => {
        console.warn("Failed to edit message:", err);
    });
    
    // Extract tasks from transcription
    const tasks = await aiService.extractTasksFromTranscription(transcription);
    
    // Properly escape the tasks for MarkdownV2 format
    const safeTasks = escapeMarkdownV2(tasks);
    
    // Edit the processing message to show extracted tasks
    const message = `📋 *Extracted Tasks:*\n${safeTasks}\n\nProcessing tasks\\.\\.\\.`;
    
    await bot.editMessageText(
        message,
        {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: 'MarkdownV2'
        }
    ).catch(err => {
        console.warn("Failed to edit message:", err);
        // If editing fails, send as new message
        return bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
    });
    
    // Check if the tasks contain bullet points (indicated by * prefix)
    if (tasks.includes('*')) {
      // If tasks are in bullet point format, process them as multiple tasks
      console.log("Processing multiple tasks from audio");
      await handleBulletPoints(bot, storageService, aiService, chatId, tasks);
    } else {
      // If no bullet points, process as a single task
      console.log("Processing single task from audio");
      await handleSingleTask(bot, storageService, aiService, chatId, tasks);
    }
}
