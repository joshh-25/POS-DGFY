export const normalizeConversationMessages = (messages) => {
    let normalized = messages || [];

    if (typeof normalized === 'string') {
        try {
            normalized = JSON.parse(normalized);
        } catch {
            normalized = [];
        }
    }

    if (!Array.isArray(normalized)) {
        normalized = [];
    }

    return normalized;
};

export const generateConversationTitle = (messages) => {
    const firstUserMessage = messages.find((message) => message.role === 'user');
    if (!firstUserMessage) {
        return 'New Conversation';
    }

    let content = firstUserMessage.content;
    if (Array.isArray(content)) {
        const textPart = content.find((part) => part.type === 'text');
        content = textPart?.text || 'Image conversation';
    }

    if (typeof content !== 'string') {
        return 'New Conversation';
    }

    if (content.length <= 50) {
        return content;
    }

    return `${content.substring(0, 47)}...`;
};
