import { escapeMarkdownV2 } from '../utils/formatters.js';
import { KNOWN_PROJECTS } from '../config/index.js';
import { chunkArray, sendTaskConfirmation } from './helpers.js';
import { sendSafeMessage } from '../utils/safeSend.js';

/**
 * Starts the edit flow for a task
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} storageService - The storage service
 * @param {string|number} chatId - The chat ID
 * @param {string} taskId - The task ID to edit
 */
export async function startEditFlow(bot, storageService, chatId, taskId) {
    const task = storageService.getTask(taskId);
    if (!task) {
        await bot.sendMessage(chatId, "⚠️ Task expired, please start over");
        return;
    }
    
    // First, show a summary of what's being edited
    const summaryMessage = escapeMarkdownV2(`🔄 *Editing Task*\n\n📝 *Title:* ${task.summary}\n📂 *Project:* ${task.projectKey || 'Not set'}\n\nYou'll be guided through each field one by one.`, true);
    
    await sendSafeMessage(
        bot,
        chatId,
        summaryMessage,
        { isPreFormatted: true }
    );
    
    // Start with the summary field
    // Set isEditing flag to true to indicate that the task is being edited
    storageService.setEditState(chatId, { taskId, currentField: 'summary', isEditing: true });
    
    const message = escapeMarkdownV2(`📝 *Editing Title*\n\nCurrent: "${task.summary}"\n\nSend new title or /skip:`, true);
    
    await sendSafeMessage(
        bot,
        chatId,
        message,
        { 
            isPreFormatted: true,
            reply_markup: { force_reply: true }
        }
    );
}


/**
 * Handles project selection during task editing
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} storageService - The storage service
 * @param {string|number} chatId - The chat ID
 * @param {string} taskId - The task ID being edited
 * @param {string|null} projectKey - The selected project key (if any)
 * @param {string} action - The action to perform ('set', 'custom', or 'done')
 */
export async function handleEditProjectCallback(bot, storageService, chatId, taskId, projectKey, action) {
    const task = storageService.getTask(taskId);
    if (!task) {
        await bot.sendMessage(chatId, "⚠️ Task expired, please start over");
        storageService.clearEditState(chatId);
        return;
    }
    
    if (action === 'set') {
        // Save original project for feedback
        const originalProject = task.projectKey || 'Not set';
        
        // Update project key
        task.projectKey = projectKey;
        
        // Update task in storage
        storageService.updateTask(taskId, { projectKey });
        
        // Show feedback about the change
        await sendSafeMessage(
            bot,
            chatId,
            escapeMarkdownV2(`📂 *Project Updated*\n\n"${originalProject}" → "${projectKey}"`, true),
            { isPreFormatted: true }
        );
        
        // Since this is the last field in the edit flow, show the task confirmation
        await finishEditing(bot, storageService, chatId, taskId, true);
    } else if (action === 'custom') {
        storageService.setEditState(chatId, { taskId, currentField: 'project', isEditing: true });
        
        await sendSafeMessage(
            bot,
            chatId,
            escapeMarkdownV2(`📂 *Editing Project*\n\nCurrent: "${task.projectKey || 'Not set'}"\n\nEnter custom project key (2-4 uppercase letters):`, true),
            { 
                isPreFormatted: true,
                reply_markup: { force_reply: true }
            }
        );
    } else if (action === 'done') {
        // Show feedback that we're moving to the next step
        await sendSafeMessage(
            bot,
            chatId,
            escapeMarkdownV2(`📂 *Project Field Completed*\n\nMoving to final review...`, true),
            { isPreFormatted: true }
        );
        
        // Since this is the last field in the edit flow, show the task confirmation
        await finishEditing(bot, storageService, chatId, taskId, true);
    }
}

/**
 * Sets up handlers for task editing
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} storageService - The storage service
 */
export function setupEditHandlers(bot, storageService) {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text?.trim();
        const editState = storageService.getEditState(chatId);

        // Skip if not in edit mode
        if (!editState) return;

        // Allow user to cancel editing at any time
        if (text === '/cancel') {
            storageService.clearEditState(chatId);
            await bot.sendMessage(chatId, "❌ Edit cancelled.");
            return;
        }

        const { taskId, currentField } = editState;
        const task = storageService.getTask(taskId);

        // Handle expired task
        if (!task) {
            storageService.clearEditState(chatId);
            await sendSafeMessage(bot, chatId, "⚠️ Task expired, please start over");
            return;
        }
        
        // Validate input based on field type
        if (text && text !== '/skip') {
            const validationError = validateFieldInput(currentField, text);
            if (validationError) {
                await sendSafeMessage(
                    bot, 
                    chatId,
                    escapeMarkdownV2(`⚠️ ${validationError}. Please try again:`, true),
                    { 
                        isPreFormatted: true,
                        reply_markup: { force_reply: true }
                    }
                );
                return;
            }
        }

        try {
            switch (currentField) {
                case 'summary':
                    if (text && text !== '/skip') {
                        // Trim and limit summary length
                        task.summary = text.length > 100 ? text.substring(0, 97) + '...' : text;
                        console.log('[EditHandler] Updated summary:', task.summary);
                        
                        // Update task in storage
                        storageService.updateTask(taskId, { summary: task.summary });
                        
                        // Show feedback about the change
                        await sendSafeMessage(
                            bot,
                            chatId,
                            escapeMarkdownV2(`📝 *Title Updated*\n\nNew title: "${task.summary}"`, true),
                            { isPreFormatted: true }
                        );
                    }
                    
                    // Move to next field
                    editState.currentField = 'description';
                    // Preserve the isEditing flag
                    storageService.setEditState(chatId, editState);
                    console.log(`[EditHandler] chatId=${chatId} moved to description`, editState);
                    
                    // Get the latest task data from storage
                    const taskForDescription = storageService.getTask(taskId);
                    
                    // Send description edit prompt
                    const descMessage = escapeMarkdownV2(`📄 *Editing Description*\n\nCurrent: "${taskForDescription.description || 'None'}"\n\nSend new description or /skip:`, true);
                    
                    await sendSafeMessage(
                        bot,
                        chatId,
                        descMessage,
                        { 
                            isPreFormatted: true,
                            reply_markup: { force_reply: true }
                        }
                    );
                    break;

                case 'description':
                    if (text && text !== '/skip') {
                        // Limit description length if needed
                        task.description = text.length > 1000 ? text.substring(0, 997) + '...' : text;
                        console.log('[EditHandler] Updated description:', task.description);
                        
                        // Update task in storage
                        storageService.updateTask(taskId, { description: task.description });
                        
                        // Show feedback about the change
                        await sendSafeMessage(
                            bot,
                            chatId,
                            escapeMarkdownV2(`📄 *Description Updated*\n\nNew description: "${task.description}"`, true),
                            { isPreFormatted: true }
                        );
                    }
                    
                    // Move to next field
                    editState.currentField = 'project';
                    // Preserve the isEditing flag
                    storageService.setEditState(chatId, editState);
                    console.log(`[EditHandler] chatId=${chatId} moved to project`, editState);
                    
                    // Get the latest task data from storage
                    const taskForProject = storageService.getTask(taskId);
                    
                    // Show project selection
                    await sendProjectKeyboard(bot, chatId, taskForProject);
                    break;

                case 'project':
                    if (text && text !== '/skip') {
                        if (/^[A-Z]{2,4}$/.test(text)) {
                            // Save original project for feedback
                            const originalProject = task.projectKey || 'Not set';
                            
                            // Update project key
                            task.projectKey = text;
                            
                            // Update task in storage
                            storageService.updateTask(taskId, { projectKey: text });
                            
                            // Show feedback about the change
                            await sendSafeMessage(
                                bot,
                                chatId,
                                escapeMarkdownV2(`📂 *Project Updated*\n\n"${originalProject}" → "${text}"`, true),
                                { isPreFormatted: true }
                            );
                            
                            // Since this is the last field in the edit flow, show the task confirmation
                            await finishEditing(bot, storageService, chatId, taskId, true);
                            storageService.clearEditState(chatId);
                        } else {
                            const errorMessage = escapeMarkdownV2(`📂 *Editing Project*\n\nCurrent: "${task.projectKey || 'Not set'}"\n\n⚠️ Invalid project key. Use 2-4 uppercase letters. Please try again:`, true);
                            
                            await sendSafeMessage(
                                bot,
                                chatId,
                                errorMessage,
                                { 
                                    isPreFormatted: true,
                                    reply_markup: { force_reply: true }
                                }
                            );
                            return;
                        }
                    } else if (text === '/skip') {
                        // Since this is the last field in the edit flow, show the task confirmation
                        await finishEditing(bot, storageService, chatId, taskId, true);
                        storageService.clearEditState(chatId);
                    }
                    break;
                    
                default:
                    // Handle unknown field
                    console.warn(`[EditHandler] Unknown field: ${currentField}`);
                    // Since we don't know what field this is, show the task confirmation
                    await finishEditing(bot, storageService, chatId, taskId, true);
                    storageService.clearEditState(chatId);
                    break;
            }
        } catch (error) {
            console.error("Edit error:", error);
            await sendSafeMessage(bot, chatId, "❌ Error during editing. Please try again.");
            storageService.clearEditState(chatId);
        }
    });
}

/**
 * Sends a keyboard with project selection options
 * @param {Object} bot - The Telegram bot instance
 * @param {string|number} chatId - The chat ID
 * @param {Object} task - The task being edited
 */
async function sendProjectKeyboard(bot, chatId, task) {
    const projectButtons = KNOWN_PROJECTS.map(project => ({
        text: `${project.name} (${project.key})`,
        callback_data: `setproj_${task.taskId}_${project.key}`
    }));

    const message = escapeMarkdownV2(`📂 *Editing Project*\n\nCurrent: ${task.projectKey || 'Not set'}\n\nSelect a project or enter a custom one:`, true);
    
    await sendSafeMessage(
        bot,
        chatId,
        message,
        {
            isPreFormatted: true,
            reply_markup: {
                inline_keyboard: [
                    ...chunkArray(projectButtons, 2),
                    [{ text: "✏️ Enter Custom", callback_data: `customproj_${task.taskId}` }],
                    [{ text: "✅ Done", callback_data: `finishproj_${task.taskId}` }]
                ]
            }
        }
    );
}

/**
 * Validates input for a specific field
 * @param {string} field - The field being edited
 * @param {string} input - The user input
 * @returns {string|null} - Error message or null if valid
 */
function validateFieldInput(field, input) {
    if (!input || input.trim().length === 0) {
        return "Input cannot be empty";
    }
    
    switch (field) {
        case 'summary':
            if (input.length < 3) {
                return "Summary is too short (minimum 3 characters)";
            }
            break;
            
        case 'project':
            if (!/^[A-Z]{2,4}$/.test(input)) {
                return "Invalid project key. Use 2-4 uppercase letters";
            }
            break;
    }
    
    return null;
}

/**
 * Shows a summary of changes made during editing
 * @param {Object} task - The original task
 * @param {Object} updatedTask - The updated task
 * @returns {string} - A formatted summary of changes
 */
function getEditSummary(task, updatedTask) {
    const changes = [];
    
    if (task.summary !== updatedTask.summary) {
        // Escape any periods in the summary
        const safeSummary = task.summary.replace(/\./g, '\\.');
        const safeUpdatedSummary = updatedTask.summary.replace(/\./g, '\\.');
        changes.push(`📝 *Title:* "${safeSummary}" → "${safeUpdatedSummary}"`);
    }
    
    if ((task.description || '') !== (updatedTask.description || '')) {
        let oldDesc = task.description ? 
            (task.description.length > 30 ? task.description.substring(0, 27) + '\\.\\.\\.' : task.description) : 
            'None';
        let newDesc = updatedTask.description ? 
            (updatedTask.description.length > 30 ? updatedTask.description.substring(0, 27) + '\\.\\.\\.' : updatedTask.description) : 
            'None';
        
        // Escape any periods in the descriptions
        oldDesc = oldDesc.replace(/\./g, '\\.');
        newDesc = newDesc.replace(/\./g, '\\.');
        
        changes.push(`📄 *Description:* "${oldDesc}" → "${newDesc}"`);
    }
    
    if ((task.projectKey || 'Not set') !== (updatedTask.projectKey || 'Not set')) {
        const safeProject = (task.projectKey || 'Not set').replace(/\./g, '\\.');
        const safeUpdatedProject = (updatedTask.projectKey || 'Not set').replace(/\./g, '\\.');
        changes.push(`📂 *Project:* "${safeProject}" → "${safeUpdatedProject}"`);
    }
    
    if (changes.length === 0) {
        return "No changes were made to the task\\.";
    }
    
    return `✅ *Task Updated Successfully*\n\n${changes.join('\n')}`;
}

/**
 * Completes the editing process and shows the updated task
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} storageService - The storage service
 * @param {string|number} chatId - The chat ID
 * @param {string} taskId - The task ID that was edited
 * @param {boolean} [showConfirmation=true] - Whether to show the task confirmation message
 */
async function finishEditing(bot, storageService, chatId, taskId, showConfirmation = true) {
    // Get the latest task data from storage
    const task = storageService.getTask(taskId);
    if (!task) {
        await bot.sendMessage(chatId, "⚠️ Task expired during editing. Please create a new task.");
        return;
    }
    
    // Get the edit state before clearing it
    const editState = storageService.getEditState(chatId);
    const isEditing = editState?.isEditing || false;
    const currentField = editState?.currentField || '';
    
    // Skip showing the changes summary if we're in the middle of editing
    // This prevents the "No changes were made" message from appearing prematurely
    if (isEditing && currentField !== 'project') {
        // Clear edit state
        storageService.clearEditState(chatId);
        return;
    }
    
    // Save original task for comparison (deep copy to ensure we capture all changes)
    const originalTask = JSON.parse(JSON.stringify(task));

    // Update task with edit timestamp
    const lastEdited = new Date().toISOString();
    storageService.updateTask(taskId, { lastEdited });
    
    // Clear edit state
    storageService.clearEditState(chatId);
    
    // Get the updated task with all changes
    // This ensures we have the most recent version of the task
    const finalTask = storageService.getTask(taskId);
    
    // Debug: log the task objects before comparison
    console.log('[EditHandler] Original task:', originalTask);
    console.log('[EditHandler] Final task:', finalTask);
    
    // Show a summary of changes
    const changesSummary = getEditSummary(originalTask, finalTask);
    await sendSafeMessage(
        bot,
        chatId,
        escapeMarkdownV2(changesSummary, true),
        { isPreFormatted: true }
    );
    
    // Only show the task confirmation if showConfirmation is true and we're not in the middle of editing
    // or if we've completed editing all fields
    if (showConfirmation && (!isEditing || currentField === 'project')) {
        // Wait a moment to ensure all updates are processed
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get the task one more time to ensure we have the latest data
        const confirmedTask = storageService.getTask(taskId);
        
        // Show the task confirmation after all edits are complete
        // This ensures the user sees the final state of the task
        const { sendTaskConfirmation } = await import('./helpers.js');
        await sendTaskConfirmation(bot, chatId, confirmedTask);
    }
}
