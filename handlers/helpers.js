import { formatTaskCard, escapeMarkdownV2 } from '../utils/formatters.js';
import { sendSafeMessage } from '../utils/safeSend.js';

/**
 * Splits an array into chunks of the specified size
 * @param {Array} arr - The array to chunk
 * @param {number} size - The size of each chunk
 * @returns {Array} - The chunked array
 */
export function chunkArray(arr, size) {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    );
}

/**
 * Sends a task confirmation message with inline keyboard options
 * @param {Object} bot - The Telegram bot instance
 * @param {string|number} chatId - The chat ID to send the message to
 * @param {Object} task - The task object
 * @returns {Promise<Object>} - The sent message
 */
export async function sendTaskConfirmation(bot, chatId, task) {
    // Format the confirmation message with proper MarkdownV2 escaping
    const confirmationHeader = "✅ *Ready to create this task:*";
    const confirmationFooter = "*Confirm creation?*";
    const formattedTask = formatTaskCard(task, 0, 1);
    
    // Double-check that all periods are properly escaped in the formatted task
    const safeFormattedTask = formattedTask.replace(/\./g, '\\.');
    
    // Escape the entire message to ensure all special characters are properly escaped
    const message = escapeMarkdownV2(`${confirmationHeader}\n\n${safeFormattedTask}\n\n${confirmationFooter}`);
    
    // Use sendSafeMessage with isPreFormatted=true since we've already handled the escaping
    return await sendSafeMessage(
        bot, 
        chatId,
        message,
        {
            isPreFormatted: true,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🚀 Create Now", callback_data: `create_${task.taskId}` },
                        { text: "✏️ Edit", callback_data: `edit_${task.taskId}` }
                    ],
                    [
                        { text: "❌ Cancel", callback_data: `cancel_${task.taskId}` }
                    ]
                ]
            }
        }
    );
}
