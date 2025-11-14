const OpenAI = require('openai');

// Initialize OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
let openai;

if (OPENAI_API_KEY && OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY_HERE') {
    try {
        openai = new OpenAI({
            apiKey: OPENAI_API_KEY,
            baseURL: 'https://openrouter.ai/api/v1'
        });
        console.log('✅ OpenRouter service initialized successfully (GPT-4o-mini via OpenRouter)');
    } catch (error) {
        console.error('❌ Error initializing OpenAI:', error);
        console.error('⚠️  API KEY ERROR');
        console.error('📝 Get a new API key from: https://openrouter.ai/keys');
        console.error('🔧 Update OPENAI_API_KEY in .env file');
        console.error('🔄 Restart the bot');
        openai = null;
    }
} else {
    console.log('⚠️  Warning: OpenAI API key not configured. AI features will be disabled.');
    openai = null;
}

/**
 * Ask OpenAI GPT a question
 * @param {string} question - The question to ask
 * @returns {Promise<string>} - The AI's response
 */
async function askQuestion(question) {
    if (!openai) {
        return "❌ AI features are not configured. Please check your OpenAI API key.\n\n**To fix:**\n1. Get a new API key from https://platform.openai.com/api-keys\n2. Update OPENAI_API_KEY in your .env file\n3. Restart the bot";
    }
    
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "user", content: question }
            ],
            max_tokens: 500
        });
        
        return completion.choices[0].message.content;
    } catch (error) {
        console.error('❌ Error asking OpenAI:', error.message);
        
        if (error.message.includes('401') || error.message.includes('invalid')) {
            return "❌ **OpenAI API Error**: The API key is invalid.\n\n**To fix:**\n1. Generate a new API key at: https://platform.openai.com/api-keys\n2. Update `OPENAI_API_KEY` in your `.env` file\n3. Restart the bot";
        }
        
        return "Sorry, I encountered an error processing your question. The AI service might be temporarily unavailable. Please try again later.";
    }
}

/**
 * Generate AI-powered motivational content
 * @returns {Promise<string>} - Motivational message
 */
async function generateMotivation() {
    if (!openai) {
        return null; // Return null to use fallback quotes
    }
    
    try {
        const prompt = `Generate a short, inspiring motivational message (2-3 sentences max) about consistent learning, daily progress, and self-improvement. Make it encouraging and actionable. Include an emoji. Keep it under 150 characters.`;
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "user", content: prompt }
            ],
            max_tokens: 100
        });
        
        return completion.choices[0].message.content.trim();
    } catch (error) {
        console.error('❌ Error generating AI motivation:', error.message);
        return null; // Return null to use fallback quotes
    }
}

/**
 * Get conversation context for better AI responses
 * @param {string} question - User's question
 * @param {string} context - Additional context
 * @returns {Promise<string>} - AI response with context
 */
async function askWithContext(question, context = '') {
    if (!openai) {
        return "AI features are not available.";
    }
    
    try {
        const messages = context 
            ? [
                { role: "system", content: context },
                { role: "user", content: question }
            ]
            : [{ role: "user", content: question }];
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            max_tokens: 500
        });
        
        return completion.choices[0].message.content;
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
    return openai !== null;
}

module.exports = {
    askQuestion,
    generateMotivation,
    askWithContext,
    isAIAvailable
};
