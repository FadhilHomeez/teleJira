import { escapeMarkdownV2 } from './formatters.js';

/**
 * Safely sends a message with MarkdownV2 formatting
 * @param {Object} bot - The Telegram bot instance
 * @param {string|number} chatId - The chat ID to send the message to
 * @param {string} text - The text to send
 * @param {Object} options - Additional options for sendMessage
 * @param {boolean} [options.isPreFormatted=false] - Whether the text already contains MarkdownV2 formatting
 * @returns {Promise<Object>} - The sent message
 */
export async function sendSafeMessage(bot, chatId, text, options = {}) {
    // Extract isPreFormatted from options and remove it from the options object
    const { isPreFormatted = false, ...sendOptions } = options;
    
    try {
        // Apply escaping only if the text is not already pre-formatted
        const formattedText = isPreFormatted ? text : escapeMarkdownV2(text);
        
        return await bot.sendMessage(chatId, formattedText, {
            parse_mode: 'MarkdownV2',
            ...sendOptions
        });
    } catch (error) {
        console.warn('Markdown error, falling back to plain text:', error.message);
        return await bot.sendMessage(chatId, text, {
            parse_mode: undefined,
            ...sendOptions
        });
    }
}

/**
 * Safely edits a message with MarkdownV2 formatting
 * @param {Object} bot - The Telegram bot instance
 * @param {string|number} chatId - The chat ID of the message
 * @param {string|number} messageId - The message ID to edit
 * @param {string} text - The new text for the message
 * @param {Object} options - Additional options for editMessageText
 * @param {boolean} [options.isPreFormatted=false] - Whether the text already contains MarkdownV2 formatting
 * @returns {Promise<Object>} - The edited message
 */
export async function editSafeMessage(bot, chatId, messageId, text, options = {}) {
    // Extract isPreFormatted from options and remove it from the options object
    const { isPreFormatted = false, ...editOptions } = options;
    
    try {
        // Apply escaping only if the text is not already pre-formatted
        const formattedText = isPreFormatted ? text : escapeMarkdownV2(text);
        
        // Make sure all periods are properly escaped
        const safeText = formattedText.replace(/\./g, '\\.');
        
        return await bot.editMessageText(safeText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'MarkdownV2',
            ...editOptions
        });
    } catch (error) {
        console.warn('Markdown error in edit, falling back to plain text:', error.message);
        return await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: undefined,
            ...editOptions
        });
    }
}
