/**
 * AI Service — True Token-by-Token Streaming
 *
 * Rate-limit aware: uses a request queue + exponential backoff retry
 */

import { exaSearchService } from './exaSearchService';
import { authHeaders, handleUnauthorized } from './apiService';

// ════════════════════════════════════════════
//  REQUEST QUEUE — prevents burst requests that trigger 429
// ════════════════════════════════════════════
type QueuedRequest = {
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (err: any) => void;
};

const REQUEST_QUEUE: QueuedRequest[] = [];
const MAX_CONCURRENT = 2;  // Allow 2 concurrent to stay within free tier
let activeCount = 0;

async function queueRequest<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        REQUEST_QUEUE.push({ fn, resolve, reject });
        processQueue();
    });
}

async function processQueue() {
    if (activeCount >= MAX_CONCURRENT || REQUEST_QUEUE.length === 0) return;

    const item = REQUEST_QUEUE.shift()!;
    activeCount++;

    try {
        const result = await item.fn();
        item.resolve(result);
    } catch (err) {
        item.reject(err);
    } finally {
        activeCount--;
        // 300ms gap between requests to avoid burst rate limits
        setTimeout(processQueue, 300);
    }
}

// ════════════════════════════════════════════
//  Configuration & Constants
// ════════════════════════════════════════════

// The server owns model choice and falls back across its allowed models
// (server/services/llmProxy.js). The browser names no model: an empty model
// means "server's choice", so a model change never needs a frontend rebuild.
const SERVER_CHOOSES = '';

const getModelConfig = () => ({
    primary: SERVER_CHOOSES,
    fallbacks: [] as string[],
    roadmaps: [SERVER_CHOOSES],
    chatbot: [SERVER_CHOOSES],
    code: [SERVER_CHOOSES],
});

// All LLM traffic goes through Cognify's backend, which holds the provider
// key. Nothing secret is bundled into the browser.
const LLM_PROXY_ENDPOINT = '/api/llm/chat';


const DEBUG_AI = false;
function logAI(msg: string) { if (DEBUG_AI) console.log('[AI]', msg); }
function warnAI(msg: string) { console.warn('[AI]', msg); }
function errorAI(msg: string, err?: any) { console.error('[AI]', msg, err || ''); }

// ════════════════════════════════════════════
//  Cognify LLM proxy — with retry & backoff
// ════════════════════════════════════════════
async function callLlmProxy(
    messages: ChatMessage[],
    model: string,
    options: { temperature?: number; max_tokens?: number; stream?: boolean } = {}
): Promise<{ text: string; stream?: AsyncGenerator<string> }> {
    // logAI(`LLM proxy → ${model || "server default"} (stream=${options.stream})`);

    return await queueRequest(async () => {
        const maxRetries = 3;
        let attempt = 0;
        let lastError: Error | null = null;

        while (attempt < maxRetries) {
            try {
                const response = await fetch(LLM_PROXY_ENDPOINT, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        ...(model ? { model } : {}),
                        messages: messages,
                        temperature: options.temperature ?? 0.7,
                        max_tokens: options.max_tokens ?? 2048,
                        stream: options.stream ?? false,
                    }),
                });

                if (!response.ok) {
                    handleUnauthorized(response);
                    const error = await response.text();

                    if (response.status === 429 && attempt < maxRetries - 1) {
                        attempt++;
                        const retryAfter = response.headers.get('Retry-After');
                        const delay = retryAfter
                            ? Math.min(parseInt(retryAfter) * 1000, 30000)
                            : Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
                        // logAI(`Rate limited (429). Retry ${attempt}/${maxRetries} in ${Math.round(delay)}ms`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    if (response.status === 401 || response.status === 403) {
                        throw new Error(`Please sign in again to use AI features (${response.status}).`);
                    }

                    let reason = '';
                    try { reason = JSON.parse(error)?.error || ''; } catch { /* not JSON */ }
                    // Never surface an HTML error page (e.g. from a proxy) as a message.
                    if (!reason && !/<[a-z!]/i.test(error)) reason = error.slice(0, 200);
                    throw new Error(response.status >= 500
                        ? `The AI service is unavailable right now. ${reason}`.trim()
                        : `AI request failed (${response.status}): ${reason}`);
                }

                if (options.stream) {
                    const reader = response.body?.getReader();
                    if (!reader) throw new Error('No response body');

                    const decoder = new TextDecoder();
                    let buffer = '';

                    const generator = async function* () {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';
                            for (const line of lines) {
                                if (!line.trim() || !line.startsWith('data: ')) continue;
                                if (line.includes('[DONE]')) continue;
                                let data: any;
                                try { data = JSON.parse(line.slice(6)); } catch { continue; }
                                if (data?.error) throw new Error(data.error.message || 'The AI stream was interrupted.');
                                const content = data.choices?.[0]?.delta?.content || '';
                                if (content) yield content;
                            }
                        }
                    };

                    let accumulated = '';
                    const streamWrapper = async function* () {
                        for await (const chunk of generator()) {
                            accumulated += chunk;
                            yield chunk;
                        }
                    };
                    return { text: '', stream: streamWrapper() };
                }

                const data = await response.json();
                const text = data.choices?.[0]?.message?.content || '';
                return { text };
            } catch (err: any) {
                lastError = err;
                if (err.message.includes('401') || err.message.includes('403') || err.message.includes('400')) {
                    break;
                }
                if (attempt >= maxRetries - 1) break;
                attempt++;
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            }
        }

        const msg = lastError?.message || 'Unknown error';
        if (msg.includes('429') || msg.includes('rate limit')) {
            throw new Error(`Too many AI requests — please wait a moment and try again. Details: ${msg}`);
        }
        throw lastError || new Error('AI request failed');
    });
}

// ════════════════════════════════════════════
//  NON-STREAMING
// ════════════════════════════════════════════
async function llamaChat(options: LlamaCompletionOptions, model: string = SERVER_CHOOSES): Promise<string> {
    const result = await callLlmProxy(options.messages, model, {
        temperature: options.temperature,
        max_tokens: options.max_tokens,
    });
    return result.text;
}

// ════════════════════════════════════════════
//  STREAMING: token-by-token
// ════════════════════════════════════════════
async function llamaChatStream(
    options: LlamaCompletionOptions,
    onToken: (accumulated: string) => void,
    model: string = SERVER_CHOOSES
): Promise<string> {
    const result = await callLlmProxy(options.messages, model, {
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        stream: true,
    });
    if (result.stream) {
        let accumulated = '';
        for await (const chunk of result.stream) {
            accumulated += chunk;
            onToken(accumulated);
        }
        return accumulated;
    }
    onToken(result.text);
    return result.text;
}

// ════════════════════════════════════════════
//  Types & Helpers
// ════════════════════════════════════════════

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface LlamaCompletionOptions {
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
}

// Try multiple models with fallback
async function tryModels(
    models: string[],
    fn: (model: string) => Promise<string>
): Promise<string> {
    let lastError: Error | null = null;
    for (const model of models) {
        try {
            logAI(`Trying model: ${model}`);
            return await fn(model);
        } catch (err) {
            logAI(`Model ${model} failed: ${err}`);
            lastError = err as Error;
        }
    }
    throw new Error(`All models failed. Last error: ${lastError?.message}`);
}

// Wrapper: every model is served through the Cognify LLM proxy
async function callAI(
    messages: ChatMessage[],
    model: string,
    options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
    const result = await callLlmProxy(messages, model, options);
    return result.text;
}

// ════════════════════════════════════════════
//  AIService Class
// ════════════════════════════════════════════

export class AIService {

    async getCodeExplanation(code: string, language: string): Promise<string> {
        return llamaChat({
            messages: [
                { role: 'system', content: 'You are an expert programming tutor. Explain code clearly and concisely.' },
                { role: 'user', content: `Explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`` }
            ],
            temperature: 0.5,
            max_tokens: 512,
        });
    }

    async getHint(code: string, error: string): Promise<string> {
        return llamaChat({
            messages: [
                { role: 'system', content: 'Provide hints without giving full answers. Be encouraging.' },
                { role: 'user', content: `Error: "${error}"\nCode:\n${code}\n\nProvide a hint only.` }
            ],
            temperature: 0.6,
            max_tokens: 256,
        });
    }

    async getLearningRecommendation(xp: number, completedTopics: string[]): Promise<string> {
        return llamaChat({
            messages: [
                { role: 'system', content: 'You are an AI learning advisor.' },
                { role: 'user', content: `Student has ${xp} XP, finished: [${completedTopics.join(', ')}]. Suggest 3 next topics.` }
            ],
            temperature: 0.7,
            max_tokens: 256,
        });
    }

    async analyzeSubmission(code: string): Promise<{ readability: number; efficiency: number; explanation: string }> {
        const response = await llamaChat({
            messages: [
                { role: 'system', content: 'Return a JSON object: { readability: 0-100, efficiency: 0-100, explanation: "..." }. ONLY valid JSON.' },
                { role: 'user', content: `Analyze:\n\n${code}` }
            ],
            temperature: 0.3,
            max_tokens: 1024,
        });
        try {
            const m = response.match(/\{[\s\S]*\}/);
            return JSON.parse(m ? m[0] : response);
        } catch {
            return { readability: 0, efficiency: 0, explanation: 'Could not parse AI response.' };
        }
    }

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
        const all: ChatMessage[] = [];
        if (systemPrompt) all.push({ role: 'system', content: systemPrompt });
        all.push(...messages);
        return tryModels(
            getModelConfig().chatbot,
            async (model) => callAI(all, model, { temperature: 0.7 })
        );
    }

    async chatStream(messages: ChatMessage[], onToken: (text: string) => void, systemPrompt?: string): Promise<string> {
        // Check if we should use web search for the last user message
        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
        const shouldSearch = lastUserMessage && this.shouldUseWebSearch(lastUserMessage.content);

        let augmentedMessages = [...messages];

        if (shouldSearch && exaSearchService.isConfigured()) {
            try {
                const searchResults = await exaSearchService.search(lastUserMessage.content, 3);
                if (searchResults.length > 0) {
                    const searchContext = exaSearchService.formatResultsForPrompt(searchResults);
                    // Add search results as a system message before the conversation
                    augmentedMessages = [
                        ...augmentedMessages.slice(0, -1),
                        { role: 'user' as const, content: `${lastUserMessage.content}\n\n${searchContext}` },
                    ];
                }
            } catch (err) {
                console.warn('[AI] Exa search failed, continuing without:', err);
            }
        }

        const all: ChatMessage[] = [];
        if (systemPrompt) all.push({ role: 'system', content: systemPrompt });
        all.push(...augmentedMessages);

        let lastError: Error | null = null;
        for (const model of getModelConfig().chatbot) {
            try {
                logAI(`Chat streaming with model: ${model}`);
                return await llamaChatStream({ messages: all, temperature: 0.7 }, onToken, model);
            } catch (err) {
                logAI(`Model ${model} failed: ${err}`);
                lastError = err as Error;
            }
        }
        throw new Error(`All streaming models failed: ${lastError?.message}`);
    }

    // Roadmap generation now lives on the server
    // (server/services/roadmap/), which prefers roadmap.sh and falls back to
    // this same AI generation. The frontend asks /api/roadmaps/resolve.

    async generateLevelContent(topic: string, levelTitle: string, levelDescription: string): Promise<string> {
        return llamaChat({
            messages: [
                { role: 'system', content: 'Write educational content with markdown (##, bullets, bold, code). 300-500 words with examples.' },
                { role: 'user', content: `Theory for "${levelTitle}" (topic: "${topic}"). Context: ${levelDescription}. Include: explanation, key points, example, fun fact.` }
            ],
            temperature: 0.6,
            max_tokens: 1024,
        });
    }

    async generateLevelContentStream(
        topic: string, levelTitle: string, levelDescription: string,
        onToken: (text: string) => void
    ): Promise<string> {
        return llamaChatStream({
            messages: [
                { role: 'system', content: 'Write educational content with markdown (##, bullets, bold, code). 300-500 words with examples.' },
                { role: 'user', content: `Theory for "${levelTitle}" (topic: "${topic}"). Context: ${levelDescription}. Include: explanation, key points, example, fun fact.` }
            ],
            temperature: 0.6,
            max_tokens: 1024,
        }, onToken);
    }

    async generateQuiz(topic: string, levelTitle: string): Promise<Array<{ question: string; options: string[]; correctIndex: number; explanation: string }>> {
        const response = await llamaChat({
            messages: [
                { role: 'system', content: 'Generate quiz questions. Return ONLY a valid JSON array.' },
                { role: 'user', content: `5 quiz questions about "${levelTitle}" (topic: "${topic}"). JSON: [{"question":"...","options":["a","b","c","d"],"correctIndex":0,"explanation":"..."}]. ONLY JSON.` }
            ],
            temperature: 0.5,
            max_tokens: 1024,
        });
        try {
            const m = response.match(/\[[\s\S]*\]/);
            return JSON.parse(m ? m[0] : response);
        } catch {
            console.error('Failed to parse quiz:', response);
            throw new Error('Failed to generate quiz.');
        }
    }

    async generateSubtopics(topic: string, levelTitle: string, levelDescription: string): Promise<Array<{ title: string; description: string }>> {
        const response = await llamaChat({
            messages: [
                { role: 'system', content: 'Break down a topic into subtopics. Return ONLY a valid JSON array.' },
                { role: 'user', content: `Break "${levelTitle}" (course: "${topic}") into 4-6 subtopics. Context: ${levelDescription}. JSON: [{"title":"...","description":"..."}]. ONLY JSON.` }
            ],
            temperature: 0.6,
            max_tokens: 1024,
        });
        try {
            const m = response.match(/\[[\s\S]*\]/);
            return JSON.parse(m ? m[0] : response);
        } catch {
            console.error('Failed to parse subtopics:', response);
            throw new Error('Failed to generate subtopics.');
        }
    }

    async generateSubtopicContent(topic: string, levelTitle: string, subtopicTitle: string, subtopicDescription: string): Promise<string> {
        return llamaChat({
            messages: [
                { role: 'system', content: 'Write detailed educational content with markdown. 400-600 words with examples.' },
                { role: 'user', content: `Content for "${subtopicTitle}" (level: "${levelTitle}", course: "${topic}"). Context: ${subtopicDescription}.` }
            ],
            temperature: 0.6,
            max_tokens: 1024,
        });
    }

    async generateSubtopicContentStream(
        topic: string, levelTitle: string, subtopicTitle: string, subtopicDescription: string,
        onToken: (text: string) => void
    ): Promise<string> {
        return llamaChatStream({
            messages: [
                { role: 'system', content: 'Write detailed educational content with markdown. 400-600 words with examples.' },
                { role: 'user', content: `Content for "${subtopicTitle}" (level: "${levelTitle}", course: "${topic}"). Context: ${subtopicDescription}.` }
            ],
            temperature: 0.6,
            max_tokens: 1024,
        }, onToken);
    }

    async generateCode(
        prompt: string,
        language: string,
        onToken: (text: string) => void
    ): Promise<string> {
        return llamaChatStream({
            messages: [
                {
                    role: 'system',
                    content: `You are an expert ${language} programmer. Generate clean, well-commented, production-quality code. Return ONLY the code — no explanations, no markdown fences, no extra text. The code should be complete and runnable.`
                },
                {
                    role: 'user',
                    content: `Write ${language} code for: ${prompt}`
                }
            ],
            temperature: 0.4,
            max_tokens: 2048,
        }, onToken);
    }

    async getDetailedInsights(
        code: string,
        language: string,
        onToken: (text: string) => void
    ): Promise<string> {
        return llamaChatStream({
            messages: [
                {
                    role: 'system',
                    content: `You are a senior software engineer and expert code reviewer. Provide a thorough, detailed analysis of the given code. Structure your response with these sections using markdown headers:

## 📋 Overview
Brief summary of what the code does.

## 🔍 Line-by-Line Explanation
Walk through the key parts of the code explaining the logic.

## 📊 Complexity Analysis
- **Time Complexity**: Big-O analysis
- **Space Complexity**: Big-O analysis

## ✅ Strengths
What the code does well (list 2-4 points).

## ⚠️ Issues & Improvements
Bugs, edge cases, or improvements (list 2-4 points with suggested fixes).

## 💡 Best Practices
Relevant best practices for this ${language} code.

## 🎯 Readability Score: X/10
## ⚡ Efficiency Score: X/10

Be specific, reference actual lines/variables, and provide actionable suggestions.`
                },
                {
                    role: 'user',
                    content: `Analyze this ${language} code in complete detail:\n\n\`\`\`${language}\n${code}\n\`\`\``
                }
            ],
            temperature: 0.4,
            max_tokens: 2048,
        }, onToken);
    }

    /**
     * Determine if a query should trigger web search
     * Uses heuristics to detect factual/current information requests
     */
    shouldUseWebSearch(query: string): boolean {
        const searchTriggers = [
            // Questions about current events, news, recent developments
            /\b(current|latest|recent|new|today|202[4-6]|2027|2028|2029|2030)\b/i,
            // Questions starting with Who/What/Where/When/Why/How that might need facts
            /^(who|what|where|when|why|how)\s/i,
            // Specific factual queries
            /\b(define|definition|meaning|explain|what is|who is|when did|where is)\b/i,
            // Technology/tool-specific questions
            /\b(api|framework|library|tool|software|programming language|version)\b/i,
            // Questions about statistics, data, numbers
            /\b(statistics|population|gdp|temperature|price|cost|value)\b/i,
            // Roadmap/career path questions
            /\b(roadmap|career path|how to become|skills needed|learn|study)\b/i,
        ];

        // Don't search for these types of queries
        const skipPatterns = [
            /^(hello|hi|hey|thanks|thank you)/i,
            /\b(code|function|variable|loop|if|else|return|class)\b/i, // Code-specific
            /\b(quiz|question|test|exam)\b/i, // Assessment
            /^[a-z0-9_]+\s*\([^)]*\)\s*\{/i, // Code snippets
        ];

        // Check if we should skip
        for (const pattern of skipPatterns) {
            if (pattern.test(query)) return false;
        }

        // Check if any trigger matches
        for (const pattern of searchTriggers) {
            if (pattern.test(query)) return true;
        }

        return false;
    }
}

export const aiService = new AIService();
