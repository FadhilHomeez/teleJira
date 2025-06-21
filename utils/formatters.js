// Characters that need to be escaped in MarkdownV2
const MARKDOWN_V2_RESERVED_CHARS = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!', '\\'];

/**
 * Escapes text for Telegram's MarkdownV2 format
 * @param {string} text - The text to escape
 * @param {boolean} [isPreFormatted=false] - Whether the text already contains some MarkdownV2 formatting
 * @returns {string} - The escaped text
 */
export function escapeMarkdownV2(text, isPreFormatted = false) {
    if (!text) return '';
    
    // If the text is already pre-formatted, return as is
    if (isPreFormatted) return text;
    
    let result = text.toString();
    
    // Escape backslash first to avoid double escaping
    result = result.replace(/\\/g, '\\\\');
    
    // Escape all other reserved characters
    for (const char of MARKDOWN_V2_RESERVED_CHARS) {
        if (char !== '\\') { // Skip backslash as we already escaped it
            const regex = new RegExp(`\\${char}`, 'g');
            result = result.replace(regex, `\\${char}`);
        }
    }
    
    return result;
}

/**
 * Double-checks that all reserved characters are properly escaped
 * @param {string} text - The text to check
 * @returns {string} - The properly escaped text
 */
export function ensureMarkdownV2Safe(text) {
    if (!text) return '';
    
    let result = text;
    
    // Check for unescaped reserved characters
    for (const char of MARKDOWN_V2_RESERVED_CHARS) {
        if (char === '\\') continue; // Skip backslash as it's handled differently
        
        // Look for unescaped instances (not preceded by \)
        const unescapedRegex = new RegExp(`(?<!\\\\)\\${char}`, 'g');
        result = result.replace(unescapedRegex, `\\${char}`);
    }
    
    return result;
}

/**
 * Formats a task into a MarkdownV2 card representation
 * @param {Object} task - The task object
 * @param {number} index - The index of the task
 * @param {number} total - The total number of tasks
 * @returns {string} - The formatted task card with MarkdownV2 syntax
 */
export function formatTaskCard(task, index, total) {
    // Make sure to escape any periods in the task fields
    const safeSummary = escapeMarkdownV2(task.summary || 'No summary');
    const safeDescription = task.description ? escapeMarkdownV2(task.description) : null;
    const safeProject = escapeMarkdownV2(task.projectKey || 'Not set');
    const safePriority = task.priority ? escapeMarkdownV2(task.priority) : null;
    const safeDueDate = task.dueDate ? escapeMarkdownV2(task.dueDate) : null;

    // Use proper escaping for static text and formatting characters
    let card = [
        `🛠️ *Task ${escapeMarkdownV2(String(index + 1))} of ${escapeMarkdownV2(String(total))}*`,
        escapeMarkdownV2('━━━━━━━━━━━━━'),
        `📝 ${task.summary ? `*Title:* ${safeSummary}` : escapeMarkdownV2('No summary')}`,
    ];
    
    if (safeDescription) {
        card.push(`📄 ${task.description ? `*Desc:* ${safeDescription}` : ''}`);
    }
    
    card.push(`📂 *Project:* ${safeProject}`);
    
    if (safePriority) {
        card.push(`⚡ ${task.priority ? `*Priority:* ${safePriority}` : ''}`);
    }
    
    if (safeDueDate) {
        card.push(`⏰ ${task.dueDate ? `*Due:* ${safeDueDate}` : ''}`);
    }

    // Return the card with proper MarkdownV2 formatting
    // The escapeMarkdownV2 function should have already escaped all periods
    return card.join('\n');
}
