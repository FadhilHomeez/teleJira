import { escapeMarkdownV2, formatTaskCard, ensureMarkdownV2Safe } from '../utils/formatters.js';
import { KNOWN_PROJECTS } from '../config/index.js';
import { chunkArray, sendTaskConfirmation } from './helpers.js';
import { startEditFlow, handleEditProjectCallback } from './edits.js';
import { sendSafeMessage, editSafeMessage } from '../utils/safeSend.js';

export function setupCallbackHandlers(bot, storageService, jiraService) {
    bot.on('callback_query', async (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        const messageId = callbackQuery.message.message_id;

        try {
            // Handle default project selection
            if (data.startsWith('setdefaultproj_')) {
                const projectKey = data.replace('setdefaultproj_', '');
                storageService.updateSession(chatId, { 
                    defaultProject: projectKey,
                    waitingForDefaultProject: false
                });
                
                await bot.answerCallbackQuery(callbackQuery.id, { 
                    text: `Default project set to ${projectKey}` 
                });
                await bot.deleteMessage(chatId, messageId);
                await processPendingTasks(bot, storageService, chatId);
                return;
            }

            if (data === 'customdefaultproj') {
                storageService.updateSession(chatId, { 
                    waitingForDefaultProject: true 
                });
                await bot.sendMessage(
                    chatId,
                    "Enter custom project key (2-4 uppercase letters):",
                    { reply_markup: { force_reply: true } }
                );
                await bot.answerCallbackQuery(callbackQuery.id);
                return;
            }

            if (data === 'skipdefaultproj') {
                storageService.updateSession(chatId, { 
                    defaultProject: 'GEN',
                    waitingForDefaultProject: false
                });
                await bot.answerCallbackQuery(callbackQuery.id, { 
                    text: "Using default project (GEN)" 
                });
                await bot.deleteMessage(chatId, messageId);
                await processPendingTasks(bot, storageService, chatId);
                return;
            }

            // Handle task creation
            if (data.startsWith('create_')) {
                const taskId = data.replace('create_', '');
                const task = storageService.getTask(taskId);
                
                if (!task) {
                    await bot.answerCallbackQuery(callbackQuery.id, { text: "Task expired" });
                    return;
                }

                // Show processing state
                await editSafeMessage(
                    bot,
                    chatId,
                    messageId,
                    "⏳ *Creating task in Jira...*",
                    { isPreFormatted: false }
                ).catch(err => console.warn("Failed to update message:", err));
                
                // Create the issue in Jira
                const result = await jiraService.createIssue(task);
                storageService.deleteTask(taskId);

                if (result.success) {
                    // Make sure the URL is properly escaped
                    const safeUrl = ensureMarkdownV2Safe(escapeMarkdownV2(result.url));
                    
                    const successMessage = escapeMarkdownV2(`✅ *Task Created\\!*\n\n`) + 
                                          formatTaskCard(task, 0, 1) + 
                                          `\n\n[View in Jira](${safeUrl})`;
                    
                    try {
                        await editSafeMessage(
                            bot,
                            chatId,
                            messageId,
                            successMessage,
                            { isPreFormatted: true }
                        );
                    } catch (error) {
                        console.error("Failed to edit message:", error);
                        
                        // Fallback to a simpler message if formatting fails
                        await editSafeMessage(
                            bot,
                            chatId,
                            messageId,
                            `✅ Task Created!\n\nView in Jira: ${result.url}`,
                            { isPreFormatted: false }
                        ).catch(err => {
                            console.error("Fallback also failed:", err);
                            // Last resort - send as plain text
                            return bot.editMessageText(
                                `✅ Task Created!\n\nView in Jira: ${result.url}`,
                                {
                                    chat_id: chatId,
                                    message_id: messageId,
                                    parse_mode: undefined
                                }
                            );
                        });
                    }
                } else {
                    // Make sure to escape any periods in the error message
                    const safeError = result.error.replace(/\./g, '\\.');
                    const errorMessage = `⚠️ Failed to create task:\\n• ${safeError}\\n• Please check project key and try again`;
                    
                    await sendSafeMessage(
                        bot,
                        chatId, 
                        errorMessage,
                        { isPreFormatted: true }
                    );
                }
                return;
            }

            // Handle edit button
            if (data.startsWith('edit_')) {
                const taskId = data.replace('edit_', '');
                await bot.answerCallbackQuery(callbackQuery.id);
                await bot.deleteMessage(chatId, messageId);
                await startEditFlow(bot, storageService, chatId, taskId);
                return;
            }
            
            // Handle cancel button
            if (data.startsWith('cancel_')) {
                const taskId = data.replace('cancel_', '');
                const task = storageService.getTask(taskId);
                
                if (!task) {
                    await bot.answerCallbackQuery(callbackQuery.id, { text: "Task already expired" });
                    return;
                }
                
                // Delete the task
                storageService.deleteTask(taskId);
                
                // Update the message
                await editSafeMessage(
                    bot,
                    chatId,
                    messageId,
                    "❌ *Task cancelled*",
                    { isPreFormatted: false }
                ).catch(err => console.warn("Failed to update message:", err));
                
                await bot.answerCallbackQuery(callbackQuery.id, { text: "Task cancelled" });
                return;
            }

            // Handle project selection during edit
            if (data.startsWith('setproj_')) {
                // setproj_{taskId}_{projectKey}
                const [, taskId, projectKey] = data.split('_');
                await bot.answerCallbackQuery(callbackQuery.id);
                await bot.deleteMessage(chatId, messageId);
                await handleEditProjectCallback(bot, storageService, chatId, taskId, projectKey, 'set');
                return;
            }
            if (data.startsWith('customproj_')) {
                // customproj_{taskId}
                const [, taskId] = data.split('_');
                await bot.answerCallbackQuery(callbackQuery.id);
                await bot.deleteMessage(chatId, messageId);
                await handleEditProjectCallback(bot, storageService, chatId, taskId, null, 'custom');
                return;
            }
            if (data.startsWith('finishproj_')) {
                // finishproj_{taskId}
                const [, taskId] = data.split('_');
                await bot.answerCallbackQuery(callbackQuery.id);
                await bot.deleteMessage(chatId, messageId);
                await handleEditProjectCallback(bot, storageService, chatId, taskId, null, 'done');
                return;
            }
            
            // Handle transcription method selection
            if (data === 'transcribe_gemini_vision') {
                // Set preference to use Gemini Vision
                const session = storageService.getSession(chatId);
                const preferences = session.preferences || {};
                preferences.transcriptionMethod = 'gemini_vision';
                storageService.updateSession(chatId, { preferences });
                
                await bot.answerCallbackQuery(callbackQuery.id, { 
                    text: "Using Gemini Vision for transcription" 
                });
                
                await editSafeMessage(
                    bot,
                    chatId,
                    messageId,
                    "👁️ *Transcription Method Updated*\n\nNow using *Gemini Vision* for audio transcription.\n\nThis method provides high accuracy for audio transcription.",
                    { isPreFormatted: false }
                );
                return;
            }
            
            if (data === 'transcribe_gemini') {
                // Set preference to use Gemini AI
                const session = storageService.getSession(chatId);
                const preferences = session.preferences || {};
                preferences.transcriptionMethod = 'gemini';
                storageService.updateSession(chatId, { preferences });
                
                await bot.answerCallbackQuery(callbackQuery.id, { 
                    text: "Using Gemini AI for transcription" 
                });
                
                await editSafeMessage(
                    bot,
                    chatId,
                    messageId,
                    "🤖 *Transcription Method Updated*\n\nNow using *Gemini AI* for audio transcription.\n\nThis is the default method and works well for most recordings.",
                    { isPreFormatted: false }
                );
                return;
            }
            
            if (data === 'show_transcribe') {
                await bot.answerCallbackQuery(callbackQuery.id);
                
                await editSafeMessage(
                    bot,
                    chatId,
                    messageId,
                    "🎙️ *Transcription Method*\n\nChoose which method to use for transcribing audio messages:",
                    { 
                        isPreFormatted: false,
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
                                ],
                                [
                                    { 
                                        text: "⬅️ Back to Settings", 
                                        callback_data: "show_settings" 
                                    }
                                ]
                            ]
                        }
                    }
                );
                return;
            }
            
            if (data === 'show_settings') {
                await bot.answerCallbackQuery(callbackQuery.id);
                
                const session = storageService.getSession(chatId);
                const currentProject = session.defaultProject || 'GEN';
                const preferences = session.preferences || {};
                const transcriptionMethod = preferences.transcriptionMethod || 'gemini';
                
                let transcriptionMethodText = 'Gemini AI';
                if (transcriptionMethod === 'gemini_vision') {
                    transcriptionMethodText = 'Gemini Vision';
                }
                
                // Make sure to escape any periods in the settings values
                const safeProject = currentProject.replace(/\./g, '\\.');
                const safeCount = String(session.taskCount || 0).replace(/\./g, '\\.');
                const safeMethod = transcriptionMethodText.replace(/\./g, '\\.');
                
                const settingsMsg = `
⚙️ *Your Settings*

*Current Default Project:* ${safeProject}
*Total Tasks Created:* ${safeCount}
*Transcription Method:* ${safeMethod}

*Change Settings:*
                `;
                
                await editSafeMessage(
                    bot,
                    chatId,
                    messageId,
                    settingsMsg,
                    {
                        isPreFormatted: true,
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "🔄 Change Project", callback_data: "change_project" }
                                ],
                                [
                                    { text: "🎙️ Change Transcription Method", callback_data: "show_transcribe" }
                                ]
                            ]
                        }
                    }
                );
                return;
            }
            
            if (data === 'change_project') {
                await bot.answerCallbackQuery(callbackQuery.id);
                
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

                await editSafeMessage(
                    bot,
                    chatId,
                    messageId,
                    "Select new default project:",
                    {
                        isPreFormatted: false,
                        reply_markup: {
                            inline_keyboard: [
                                ...chunkArray(projectButtons, 2),
                                [{ text: "✏️ Enter Custom", callback_data: "customdefaultproj" }],
                                [{ text: "⬅️ Back to Settings", callback_data: "show_settings" }]
                            ]
                        }
                    }
                );
                return;
            }
            
            if (data === 'transcribe_info') {
                await bot.answerCallbackQuery(callbackQuery.id);
                
                await editSafeMessage(
                    bot,
                    chatId,
                    messageId,
                    "ℹ️ *About Transcription Methods*\n\n*Gemini Vision*\n• High accuracy for all recordings\n• Uses Gemini's vision capabilities\n• No additional setup required\n• Good for complex audio\n\n*Gemini AI*\n• Default method\n• Good for shorter recordings\n• No additional setup required\n• May be slower for long recordings\n\nUse /transcribe to change your preference.",
                    {
                        isPreFormatted: false,
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { 
                                        text: "👁️ Use Gemini Vision", 
                                        callback_data: "transcribe_gemini_vision" 
                                    }
                                ],
                                [
                                    { 
                                        text: "🤖 Use Gemini AI", 
                                        callback_data: "transcribe_gemini" 
                                    }
                                ]
                            ]
                        }
                    }
                );
                return;
            }

            await bot.answerCallbackQuery(callbackQuery.id);
        } catch (error) {
            console.error("Callback error:", error);
            await bot.answerCallbackQuery(callbackQuery.id, { text: "Error processing request" });
        }
    });
}

async function processPendingTasks(bot, storageService, chatId) {
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
