// OpenRouter AI Service
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Default model - you can change this to any OpenRouter supported model
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-lite-001';

let isConfigured = false;

if (OPENROUTER_API_KEY) {
    isConfigured = true;
    console.log(`✅ OpenRouter AI service initialized (Model: ${DEFAULT_MODEL})`);
} else {
    console.log('⚠️  Warning: OpenRouter API key not configured. AI features will be disabled.');
}

/**
 * Make a request to OpenRouter API
 * @param {Array} messages - Array of message objects [{role, content}]
 * @param {number} maxTokens - Maximum tokens in response
 * @returns {Promise<string>} - AI response text
 */
async function makeOpenRouterRequest(messages, maxTokens = 500) {
    const response = await fetch(OPENROUTER_BASE_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/Lethinkj/BeeLert',
            'X-Title': 'BeeLert Discord Bot'
        },
        body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages: messages,
            max_tokens: maxTokens,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error?.message || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

/**
 * Ask AI a question (simple, no history)
 * @param {string} question - The question to ask
 * @returns {Promise<string>} - The AI's response
 */
async function askQuestion(question) {
    if (!isConfigured) {
        return "❌ AI features are not configured. Please check your OpenRouter API key.";
    }
    
    try {
        const messages = [
            { role: 'user', content: question }
        ];
        
        return await makeOpenRouterRequest(messages);
    } catch (error) {
        console.error('❌ Error asking OpenRouter:', error.message);
        
        if (error.status === 401 || error.message.includes('API_KEY')) {
            return "❌ **OpenRouter API Error**: The API key is invalid.\n\n**To fix:**\n1. Get a new API key from OpenRouter.ai\n2. Update `OPENROUTER_API_KEY` in your `.env` file\n3. Restart the bot";
        }
        
        if (error.status === 429 || error.message.includes('429')) {
            return "⏳ Too many requests. Please wait a moment and try again.";
        }
        
        return "Sorry, I encountered an error processing your question. Please try again later.";
    }
}

/**
 * Generate AI-powered motivational content
 * @returns {Promise<string>} - Motivational message
 */
async function generateMotivation() {
    if (!isConfigured) {
        return null; // Return null to use fallback quotes
    }
    
    try {
        const messages = [
            { 
                role: 'system', 
                content: 'You are a motivational assistant. Generate short, inspiring messages.'
            },
            { 
                role: 'user', 
                content: 'Generate a short, inspiring motivational message (2-3 sentences max) about consistent learning, daily progress, and self-improvement. Make it encouraging and actionable. Include an emoji. Keep it under 150 characters.'
            }
        ];
        
        const response = await makeOpenRouterRequest(messages, 100);
        return response.trim();
    } catch (error) {
        console.error('❌ Error generating AI motivation:', error.message);
        return null; // Return null to use fallback quotes
    }
}

/**
 * Ask AI with conversation history for context-aware responses
 * @param {string} question - Current user question
 * @param {Array} history - Previous conversation messages [{role, content}]
 * @param {string} systemPrompt - Optional system context
 * @returns {Promise<string>} - AI response
 */
async function askWithHistory(question, history = [], systemPrompt = '') {
    if (!isConfigured) {
        return "❌ AI features are not configured. Please check your OpenRouter API key.";
    }
    
    try {
        // Build messages array with OpenRouter/OpenAI format
        const messages = [];
        
        // Add system prompt if provided
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        
        // Add conversation history
        for (const msg of history) {
            messages.push({
                role: msg.role, // 'user' or 'assistant'
                content: msg.content
            });
        }
        
        // Add current question
        messages.push({ role: 'user', content: question });
        
        return await makeOpenRouterRequest(messages, 500);
    } catch (error) {
        console.error('❌ Error in OpenRouter with history:', error.message);
        
        if (error.status === 429 || error.message.includes('429')) {
            return "⏳ Too many requests. Please wait a moment and try again.";
        }
        
        return "Sorry, I encountered an error processing your question. Please try again.";
    }
}

/**
 * Get conversation context for better AI responses
 * @param {string} question - User's question
 * @param {string} context - Additional context
 * @returns {Promise<string>} - AI response with context
 */
async function askWithContext(question, context = '') {
    if (!isConfigured) {
        return "AI features are not available.";
    }
    
    try {
        const messages = [];
        
        if (context) {
            messages.push({ role: 'system', content: context });
        }
        
        messages.push({ role: 'user', content: question });
        
        return await makeOpenRouterRequest(messages, 500);
    } catch (error) {
        console.error('❌ Error in contextual AI query:', error.message);
        return "Sorry, I encountered an error. Please try again.";
    }
}

/**
 * Check if AI service is available
 * @returns {boolean} - True if AI is configured and ready
 */
function isAIAvailable() {
    return isConfigured;
}

module.exports = {
    askQuestion,
    generateMotivation,
    askWithContext,
    askWithHistory,
    isAIAvailable
};
