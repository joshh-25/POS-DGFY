export const buildHandleSpecialQueriesUseCase = ({
  getCapabilitiesExplanation,
  getLimitationsExplanation
}) => {
  return (message = '') => {
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes('what can you do') ||
      lowerMessage.includes('what are your capabilities') ||
      lowerMessage.includes('help me understand')
    ) {
      return {
        type: 'text',
        content: getCapabilitiesExplanation()
      };
    }

    if (
      lowerMessage.includes("what can't you do") ||
      lowerMessage.includes('what are your limitations') ||
      lowerMessage.includes('what you cannot do')
    ) {
      return {
        type: 'text',
        content: getLimitationsExplanation()
      };
    }

    return null;
  };
};
