/**
 * RAG-based Notes Service
 * Implements a strict retrieval-augmented generation architecture
 * with zero-temperature and strict system prompt constraints
 */

import { aiService } from './llamaService';
import { authHeaders } from './apiService';

export interface NoteSource {
    id: number;
    noteId: number;
    type: 'text' | 'file' | 'url' | 'roadmap' | 'level';
    title: string;
    content: string;
    metadata: Record<string, any>;
    embedding?: number[];
}

export interface Note {
    id: number;
    userId: number;
    title: string;
    type: 'summary' | 'study_guide' | 'exam_prep' | 'flashcards';
    sourceIds: number[];
    content: string;
    metadata: {
        sources: Array<{ id: number; title: string; type: string }>;
        summary: string;
        keyPoints: string[];
        createdAt: string;
        updatedAt: string;
    };
    createdAt: string;
    updatedAt: string;
}

export interface GenerateNotesOptions {
    sources: NoteSource[];
    noteType: 'summary' | 'study_guide' | 'exam_prep' | 'flashcards';
    maxTokens?: number;
    useRAG?: boolean; // default true
}

const RAG_SYSTEM_PROMPT = `You are a Retrieval-Augmented Generation (RAG) system. Your sole purpose is to process and synthesize the provided source documents.

STRICT RULES:
1. Use ONLY the information contained in the provided source documents
2. Do NOT use any pre-trained knowledge or internal weights
3. Do NOT hallucinate, guess, or fabricate information
4. If information is not in the sources, explicitly state "Not found in sources"
5. Temperature is fixed at 0 for deterministic, factual output
6. Structure all responses in the specified format

Your response must be purely derived from the provided context.`;

const NOTE_TEMPLATES = {
    summary: `
Create a comprehensive summary from the provided sources:
1. Extract the main theme and key concepts
2. Structure hierarchically with clear sections
3. Use bullet points for key details
4. Include relevant examples from the sources
5. Keep it concise but comprehensive

Format:
# Summary: [Title]
## Overview
[2-3 sentence summary]

## Key Concepts
- [Concept 1]: [Details from sources]
- [Concept 2]: [Details from sources]

## Important Details
[Structured information from sources]
`,
    study_guide: `
Create a structured study guide from the provided sources:
1. Organize by topics/themes from the sources
2. Include definitions, explanations, and examples
3. Add memory aids from the content
4. Highlight important facts and relationships

Format:
# Study Guide: [Title]
## Learning Objectives
[What can be learned from these sources]

## Topic 1: [From Sources]
### Definition
[Explanation from sources]
### Key Points
- [Point 1 from sources]
- [Point 2 from sources]
### Examples
[Examples from sources]

## Review Questions
[Questions that can be answered from sources]
`,
    exam_prep: `
Create exam preparation materials from the provided sources:
1. Identify key facts, dates, formulas, concepts
2. Create practice questions with answers from sources
3. Highlight common pitfalls mentioned
4. Generate concise study notes

Format:
# Exam Prep: [Title]
## Critical Information
- [Key fact 1 from sources]
- [Key fact 2 from sources]

## Practice Questions
Q1: [Question based on sources]
A: [Answer from sources]

Q2: [Another question]
A: [Answer from sources]

## Key Formulas/Principles (if applicable)
[From sources]

## Common Mistakes to Avoid
[From sources]
`,
    flashcards: `
Create flashcards from the provided sources:
1. One concept per card
2. Question on front, answer on back
3. Focus on definitions, key facts, relationships

Format (one card per line, separated by |):
Q: [Question about content from sources] | A: [Answer from sources]
Q: [Another question] | A: [Answer]
`
};

export class NotesService {
    private sources: Map<number, NoteSource> = new Map();
    private notes: Map<number, Note> = new Map();
    private nextSourceId = 1;
    private nextNoteId = 1;

    async generateNotes(options: GenerateNotesOptions): Promise<{
        content: string;
        summary: string;
        keyPoints: string[];
    }> {
        const { sources, noteType, useRAG = true } = options;

        if (sources.length === 0) {
            throw new Error('No sources provided for note generation');
        }

        let allSources = [...sources];

        // RAG: Retrieve relevant chunks from shared ChromaDB knowledge base
        if (useRAG) {
            try {
                const query = sources.map(s => s.title).join(', ') + ' ' + noteType.replace('_', ' ');
                const res = await fetch('/api/notes/retrieve', {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ query, topK: 5 })
                });
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    allSources.push({
                        id: 0, noteId: 0, type: 'text',
                        title: '📚 Shared Knowledge Base',
                        content: data.results.map((r: any) =>
                            `[Source: ${r.metadata?.fileName || r.metadata?.title || 'Unknown'}]\n${r.content}`
                        ).join('\n\n---\n\n'),
                        metadata: {}
                    });
                }
            } catch (e) {
                console.error('RAG retrieval error:', e);
            }
        }

        const combinedContent = allSources.map(s =>
            `--- SOURCE: ${s.title} (${s.type}) ---\n${s.content}`
        ).join('\n\n');

        const userPrompt = `
${RAG_SYSTEM_PROMPT}

SOURCES:
${combinedContent}

TASK: ${NOTE_TEMPLATES[noteType]}

Remember: Use ONLY information from the sources above. Do not add external knowledge.`;

        const messages = [
            { role: 'system' as const, content: RAG_SYSTEM_PROMPT },
            { role: 'user' as const, content: userPrompt }
        ];

        const response = await aiService.chat(messages);

        return {
            content: response,
            summary: this.extractSummary(response),
            keyPoints: this.extractKeyPoints(response, noteType)
        };
    }

    async generateNotesStream(
        options: GenerateNotesOptions,
        onToken: (text: string) => void
    ): Promise<string> {
        const { sources, noteType, useRAG = true } = options;

        if (sources.length === 0) {
            throw new Error('No sources provided for note generation');
        }

        let allSources = [...sources];

        // RAG: Retrieve from shared knowledge base
        if (useRAG) {
            try {
                const query = sources.map(s => s.title).join(', ') + ' ' + noteType.replace('_', ' ');
                const res = await fetch('/api/notes/retrieve', {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ query, topK: 5 })
                });
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    allSources.push({
                        id: 0, noteId: 0, type: 'text',
                        title: '📚 Shared Knowledge Base',
                        content: data.results.map((r: any) =>
                            `[Source: ${r.metadata?.fileName || r.metadata?.title || 'Unknown'}]\n${r.content}`
                        ).join('\n\n---\n\n'),
                        metadata: {}
                    });
                }
            } catch (e) {
                console.error('RAG retrieval error:', e);
            }
        }

        const combinedContent = allSources.map(s =>
            `--- SOURCE: ${s.title} (${s.type}) ---\n${s.content}`
        ).join('\n\n');

        const userPrompt = `
${RAG_SYSTEM_PROMPT}

SOURCES:
${combinedContent}

TASK: ${NOTE_TEMPLATES[noteType]}

Remember: Use ONLY information from the sources above. Do not add external knowledge.`;

        const messages = [
            { role: 'system' as const, content: RAG_SYSTEM_PROMPT },
            { role: 'user' as const, content: userPrompt }
        ];

        let accumulated = '';
        await aiService.chatStream(messages, (chunk) => {
            accumulated = chunk;
            onToken(chunk);
        });

        return accumulated;
    }

    private extractSummary(content: string): string {
        const overviewMatch = content.match(/## Overview\s*\n([\s\S]*?)(?=\n##|$)/);
        if (overviewMatch && overviewMatch[1]) {
            return overviewMatch[1].trim();
        }
        
        const firstPara = content.split('\n\n')[1] || content.split('\n')[1] || '';
        return firstPara.substring(0, 300) + (firstPara.length > 300 ? '...' : '');
    }

    private extractKeyPoints(content: string, noteType: string): string[] {
        const points: string[] = [];
        
        if (noteType === 'summary') {
            const keyConcepts = content.match(/## Key Concepts\s*\n([\s\S]*?)(?=\n##|$)/);
            if (keyConcepts) {
                const matches = keyConcepts[1].matchAll(/[-*]\s*(.+)/g);
                for (const match of matches) {
                    points.push(match[1].trim());
                }
            }
        } else if (noteType === 'exam_prep') {
            const criticalInfo = content.match(/## Critical Information\s*\n([\s\S]*?)(?=\n##|$)/);
            if (criticalInfo) {
                const matches = criticalInfo[1].matchAll(/[-*]\s*(.+)/g);
                for (const match of matches) {
                    points.push(match[1].trim());
                }
            }
        } else if (noteType === 'study_guide') {
            const objectives = content.match(/## Learning Objectives\s*\n([\s\S]*?)(?=\n##|$)/);
            if (objectives) {
                const matches = objectives[1].matchAll(/[-*]\s*(.+)/g);
                for (const match of matches) {
                    points.push(match[1].trim());
                }
            }
        } else if (noteType === 'flashcards') {
            const lines = content.split('\n');
            for (const line of lines) {
                const match = line.match(/^Q:\s*(.+?)\s*\|\s*A:\s*(.+)$/);
                if (match) {
                    points.push(match[1].trim());
                }
            }
        }

        return points.slice(0, 10);
    }

    addSource(source: Omit<NoteSource, 'id'>): NoteSource {
        const id = this.nextSourceId++;
        const noteSource: NoteSource = { ...source, id };
        this.sources.set(id, noteSource);
        return noteSource;
    }

    getSource(id: number): NoteSource | undefined {
        return this.sources.get(id);
    }

    createNote(data: {
        userId: number;
        title: string;
        type: 'summary' | 'study_guide' | 'exam_prep' | 'flashcards';
        sourceIds: number[];
        content: string;
    }): Note {
        const note: Note = {
            id: this.nextNoteId++,
            userId: data.userId,
            title: data.title,
            type: data.type,
            sourceIds: data.sourceIds,
            content: data.content,
            metadata: {
                sources: data.sourceIds.map(id => {
                    const source = this.sources.get(id);
                    return { id, title: source?.title || 'Unknown', type: source?.type || 'unknown' };
                }),
                summary: '',
                keyPoints: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.notes.set(note.id, note);
        return note;
    }

    getNote(id: number): Note | undefined {
        return this.notes.get(id);
    }

    getUserNotes(userId: number): Note[] {
        return Array.from(this.notes.values())
            .filter(n => n.userId === userId)
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
}

export const notesService = new NotesService();