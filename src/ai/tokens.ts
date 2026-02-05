/**
 * Simple Token Estimator
 * Rule of thumb: 1 token ~= 4 characters in English
 */
const TokenUtils = {
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  },

  truncateToTokenLimit(text, limit = 4000) {
    const estimated = this.estimateTokens(text);
    if (estimated <= limit) return text;

    const charLimit = limit * 4;
    return text.substring(0, charLimit) + '... [TRUNCATED]';
  }
};

export default TokenUtils;