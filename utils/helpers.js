// chunkArray function moved to handlers/helpers.js

export function parseTaskText(text) {
    // Extract priority from text (e.g., "urgent", "high", "low")
    const priorityKeywords = {
        urgent: 'High',
        high: 'High', 
        medium: 'Medium',
        low: 'Low',
        normal: 'Medium'
    };

    const lowerText = text.toLowerCase();
    let priority = 'Medium';
    
    for (const [keyword, value] of Object.entries(priorityKeywords)) {
        if (lowerText.includes(keyword)) {
            priority = value;
            break;
        }
    }

    // Extract effort estimation
    const effortPattern = /(\d+)\s*(h|hour|hours|d|day|days|w|week|weeks)/i;
    const effortMatch = text.match(effortPattern);
    const estimatedEffort = effortMatch ? `${effortMatch[1]}${effortMatch[2].charAt(0)}` : null;

    // Extract due date
    const datePattern = /(today|tomorrow|next week|next month|in \d+ days)/i;
    const dateMatch = text.match(datePattern);
    const dueDate = dateMatch ? parseRelativeDate(dateMatch[1]) : null;

    return {
        priority,
        estimatedEffort,
        dueDate,
        cleanText: text.replace(effortPattern, '').replace(datePattern, '').trim()
    };
}

function parseRelativeDate(dateText) {
    const today = new Date();
    const lowerText = dateText.toLowerCase();
    
    if (lowerText === 'today') {
        return today.toISOString().split('T')[0];
    } else if (lowerText === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    } else if (lowerText === 'next week') {
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek.toISOString().split('T')[0];
    } else if (lowerText === 'next month') {
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth.toISOString().split('T')[0];
    } else if (lowerText.includes('in') && lowerText.includes('days')) {
        const daysMatch = lowerText.match(/in (\d+) days/);
        if (daysMatch) {
            const days = parseInt(daysMatch[1]);
            const futureDate = new Date(today);
            futureDate.setDate(futureDate.getDate() + days);
            return futureDate.toISOString().split('T')[0];
        }
    }
    
    return null;
}

export function generateTaskSuggestions(text) {
    const suggestions = [];
    
    if (text.toLowerCase().includes('bug') || text.toLowerCase().includes('error')) {
        suggestions.push('🐛 Bug Report Template');
    }
    
    if (text.toLowerCase().includes('feature') || text.toLowerCase().includes('new')) {
        suggestions.push('✨ Feature Request Template');
    }
    
    if (text.toLowerCase().includes('doc') || text.toLowerCase().includes('write')) {
        suggestions.push('📝 Documentation Template');
    }
    
    if (text.toLowerCase().includes('review') || text.toLowerCase().includes('check')) {
        suggestions.push('👀 Review Task');
    }
    
    return suggestions;
}

export function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
        return 'just now';
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours}h ago`;
    } else {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days}d ago`;
    }
}

export function validateProjectKey(key) {
    return /^[A-Z]{2,4}$/.test(key);
}

export function getProjectDisplayName(key) {
    const projects = {
        'WEB': 'Website',
        'MRK': 'Marketing', 
        'DEV': 'Development',
        'GEN': 'General'
    };
    return projects[key] || key;
}
