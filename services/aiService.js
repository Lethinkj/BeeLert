const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI;
let model;

if (GEMINI_API_KEY) {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        console.log('✅ Gemini AI service initialized successfully (Gemini 2.5 Flash)');
    } catch (error) {
        console.error('❌ Error initializing Gemini:', error);
        genAI = null;
        model = null;
    }
} else {
    console.log('⚠️  Warning: Gemini API key not configured. AI features will be disabled.');
    genAI = null;
    model = null;
}

/**
 * Ask Gemini a question (simple, no history)
 * @param {string} question - The question to ask
 * @returns {Promise<string>} - The AI's response
 */
async function askQuestion(question) {
    if (!model) {
        return "❌ AI features are not configured. Please check your Gemini API key.";
    }
    
    try {
        const result = await model.generateContent(question);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('❌ Error asking Gemini:', error.message);
        
        if (error.message.includes('API_KEY') || error.message.includes('401')) {
            return "❌ **Gemini API Error**: The API key is invalid.\n\n**To fix:**\n1. Get a new API key from Google AI Studio\n2. Update `GEMINI_API_KEY` in your `.env` file\n3. Restart the bot";
        }
        
        return "Sorry, I encountered an error processing your question. Please try again later.";
    }
}

/**
 * Generate AI-powered motivational content
 * @returns {Promise<string>} - Motivational message
 */
async function generateMotivation() {
    if (!model) {
        return null; // Return null to use fallback quotes
    }
    
    try {
        const prompt = `Generate a short, inspiring motivational message (2-3 sentences max) about consistent learning, daily progress, and self-improvement. Make it encouraging and actionable. Include an emoji. Keep it under 150 characters.`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error('❌ Error generating AI motivation:', error.message);
        return null; // Return null to use fallback quotes
    }
}

/**
 * Ask Gemini with conversation history for context-aware responses
 * @param {string} question - Current user question
 * @param {Array} history - Previous conversation messages [{role, content}]
 * @param {string} systemPrompt - Optional system context
 * @returns {Promise<string>} - AI response
 */
async function askWithHistory(question, history = [], systemPrompt = '') {
    if (!model) {
        return "❌ AI features are not configured. Please check your Gemini API key.";
    }
    
    try {
        // Build conversation history for Gemini format
        const chatHistory = [];
        
        // Convert history to Gemini format
        for (const msg of history) {
            chatHistory.push({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            });
        }
        
        // Start chat with history
        const chat = model.startChat({
            history: chatHistory,
            generationConfig: {
                maxOutputTokens: 500,
            },
        });
        
        // Build the prompt with system context
        const fullPrompt = systemPrompt 
            ? `${systemPrompt}\n\nUser message: ${question}`
            : question;
        
        const result = await chat.sendMessage(fullPrompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('❌ Error in Gemini with history:', error.message);
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
    if (!model) {
        return "AI features are not available.";
    }
    
    try {
        const fullPrompt = context 
            ? `${context}\n\nQuestion: ${question}`
            : question;
        
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        return response.text();
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
    return model !== null;
}

module.exports = {
    askQuestion,
    generateMotivation,
    askWithContext,
    askWithHistory,
    isAIAvailable
};
