import React, { useState, useRef, useEffect } from 'react';
import { notesService, NoteSource, Note } from '../services/notesService';
import * as api from '../services/apiService';
import { progressService } from '../services/progressService';

interface NotesViewProps {
    className?: string;
}

type NoteType = 'summary' | 'study_guide' | 'exam_prep' | 'flashcards';

const NotesView: React.FC<NotesViewProps> = ({ className = '' }) => {
    const [notes, setNotes] = useState<Note[]>([]);
    const [activeNote, setActiveNote] = useState<Note | null>(null);
    const [sources, setSources] = useState<NoteSource[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [noteType, setNoteType] = useState<NoteType>('summary');
    const [sourceTitle, setSourceTitle] = useState('');
    const [sourceContent, setSourceContent] = useState('');
    const [accumulatedContent, setAccumulatedContent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const userId = progressService.getDbUserId();

    useEffect(() => {
        loadNotes();
    }, []);

    const loadNotes = async () => {
        if (!userId) return;
        try {
            const userNotes = await api.getUserNotes(userId);
            setNotes(userNotes);
        } catch (err) {
            console.error('Failed to load notes:', err);
        }
    };

    const loadNote = async (noteId: number) => {
        try {
            const note = await api.getNote(noteId);
            setActiveNote(note);
            setSources(note.sources || []);
            setAccumulatedContent(note.content || '');
        } catch (err) {
            console.error('Failed to load note:', err);
        }
    };

    const addSource = async () => {
        if (!sourceTitle.trim() || !sourceContent.trim()) return;
        try {
            const newSource = await api.createNoteSource({
                noteId: null,
                type: 'text',
                title: sourceTitle.trim(),
                content: sourceContent.trim(),
                userId: userId ?? null,
            });
            setSources(prev => [...prev, newSource]);
            setSourceTitle('');
            setSourceContent('');
        } catch (err) {
            console.error('Failed to add source:', err);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const formData = new FormData();
            for (let i = 0; i < files.length; i++) {
                formData.append('files', files[i]);
            }

            const res = await fetch('/api/notes/upload-files', {
                method: 'POST',
                headers: api.authHeaders(),
                body: formData,
            });
            api.handleUnauthorized(res);
            const data = await res.json();

            if (data.success && data.files) {
                for (const f of data.files) {
                    const src = await api.createNoteSource({
                        noteId: null,
                        type: 'text',
                        title: f.filename,
                        content: f.content,
                        userId: userId ?? null,
                    });
                    setSources(prev => [...prev, src]);
                }
            }
        } catch (err) {
            console.error('Upload error:', err);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const generateNotes = async () => {
        if (!userId) {
            setError('Please log in to create notes');
            return;
        }

        setIsGenerating(true);
        setError(null);
        setAccumulatedContent('');

        try {
            const options = {
                sources,
                noteType,
                useRAG: true
            };

            let content = '';
            await notesService.generateNotesStream(options, (chunk) => {
                content = chunk;
                setAccumulatedContent(chunk);
            });

            const note = await api.createNote({
                userId,
                title: `Notes: ${noteType}`,
                type: noteType,
                content: content,
                sourceIds: sources.map(s => s.id)
            });

            const fullNote = await api.getNote(note.id);
            setActiveNote(fullNote);
            setNotes([fullNote, ...notes]);

        } catch (err) {
            console.error('Failed to generate notes:', err);
            setError('Failed to generate notes. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const exportToPDF = async () => {
        if (!activeNote || !contentRef.current) return;
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${activeNote.title}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                           padding: 40px; line-height: 1.6; color: #1a1a1a; max-width: 900px; margin: 0 auto; }
                    h1 { color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
                    h2 { color: #374151; margin-top: 24px; }
                    h3 { color: #6b7280; }
                    ul, ol { margin: 8px 0; }
                    li { margin: 4px 0; }
                    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
                    pre { background: #f9fafb; padding: 16px; border-radius: 8px; overflow-x: auto; }
                </style>
            </head>
            <body>
                <h1>${activeNote.title}</h1>
                ${contentRef.current.innerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    const exportToPowerPoint = () => {
        if (!activeNote) return;
        
        const pptxContent = activeNote.content;
        const sections = pptxContent.split(/##\s+/).filter(s => s.trim());
        
        let slideContent = '';
        sections.forEach((section, idx) => {
            const lines = section.split('\n').filter(l => l.trim());
            const title = lines[0] || `Slide ${idx + 1}`;
            const bullets = lines.slice(1).filter(l => l.startsWith('-') || l.startsWith('*')).map(l => l.substring(1).trim());
            
            slideContent += `---\n${title}\n`;
            bullets.forEach(b => slideContent += `- ${b}\n`);
        });
        
        const blob = new Blob([slideContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeNote.title.replace(/\s+/g, '_')}_notes.pptx.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={`h-full flex flex-col ${className}`}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800/50">
                <h2 className="text-xl font-bold text-white">RAG Notes</h2>
                <p className="text-sm text-slate-400 mt-1">
                    Retrieval-Augmented Generation for academic notes and study guides
                </p>
            </div>

            <div className="flex-1 flex min-h-0">
                {/* Sidebar - Sources */}
                <div className="w-80 border-r border-slate-800/50 flex flex-col">
                    <div className="p-4 border-b border-slate-800/50">
                        <h3 className="text-sm font-bold text-slate-300 mb-3">Sources</h3>
                        
                        <div className="space-y-3">
                            {/* File Upload */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-1.5 block">Upload Sources (PDF, TXT, MD)</label>
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.txt,.md"
                                    onChange={handleFileUpload}
                                    disabled={uploading}
                                    className="block w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700"
                                />
                                {uploading && <p className="text-[10px] text-amber-400 mt-1">Uploading & extracting…</p>}
                            </div>

                            {/* Manual Text Input */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-1.5 block">Add Manual Source</label>
                                <input
                                    type="text"
                                    value={sourceTitle}
                                    onChange={e => setSourceTitle(e.target.value)}
                                    placeholder="Source title"
                                    className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 mb-2"
                                />
                                <textarea
                                    value={sourceContent}
                                    onChange={e => setSourceContent(e.target.value)}
                                    placeholder="Paste or type your source content here..."
                                    className="w-full h-20 px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 resize-none mb-2"
                                />
                                <button
                                    onClick={addSource}
                                    disabled={!sourceTitle.trim() || !sourceContent.trim()}
                                    className="w-full px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50"
                                >
                                    Add Source
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {sources.map(source => (
                            <div key={source.id} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                                <p className="text-xs font-medium text-white truncate">{source.title}</p>
                                <p className="text-[10px] text-slate-500 mt-1">{source.type}</p>
                            </div>
                        ))}
                    </div>

                    {/* Controls */}
                    <div className="p-4 border-t border-slate-800/50">
                        <div className="mb-3">
                            <label className="text-xs font-bold text-slate-400 mb-2 block">Note Type</label>
                            <select
                                value={noteType}
                                onChange={e => setNoteType(e.target.value as NoteType)}
                                className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white"
                            >
                                <option value="summary">Summary</option>
                                <option value="study_guide">Study Guide</option>
                                <option value="exam_prep">Exam Prep</option>
                                <option value="flashcards">Flashcards</option>
                            </select>
                        </div>
                        
                        <button
                            onClick={generateNotes}
                            disabled={sources.length === 0 || isGenerating}
                            className="w-full px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isGenerating ? (
                                <>
                                    <i className="fas fa-circle-notch animate-spin"></i>
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-brain"></i>
                                    Generate Notes
                                </>
                            )}
                        </button>
                        
                        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col">
                    {activeNote ? (
                        <>
                            {/* Note Header */}
                            <div className="px-6 py-4 border-b border-slate-800/50 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-white">{activeNote.title}</h3>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {activeNote.type.replace('_', ' ')} • {sources.length} sources
                                    </p>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={exportToPDF}
                                        className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5"
                                    >
                                        <i className="fas fa-file-pdf text-red-400"></i>
                                        PDF
                                    </button>
                                    <button
                                        onClick={exportToPowerPoint}
                                        className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5"
                                    >
                                        <i className="fas fa-file-powerpoint text-orange-400"></i>
                                        PPTX
                                    </button>
                                </div>
                            </div>

                            {/* Note Content */}
                            <div className="flex-1 overflow-y-auto p-6" ref={contentRef}>
                                <div 
                                    className="prose prose-invert prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: formatContent(accumulatedContent || activeNote.content) }}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <i className="fas fa-file-alt text-5xl text-slate-700 mb-4"></i>
                                <h3 className="text-lg font-bold text-slate-300 mb-2">No Note Selected</h3>
                                <p className="text-sm text-slate-500 max-w-sm">
                                    Add sources on the left and generate notes. The RAG system will synthesize
                                    the content into structured study materials.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

function formatContent(content: string): string {
    if (!content) return '';
    
    return content
        .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-white mt-4 mb-2">$1</h3>')
        .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-indigo-400 mt-6 mb-3">$1</h2>')
        .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-indigo-500 mt-6 mb-4">$1</h1>')
        .replace(/^\- (.+)$/gm, '<li class="text-slate-300 mb-1">• $1</li>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300 text-xs">$1</code>')
        .split('\n\n')
        .map(p => `<p class="text-slate-300 mb-3 leading-relaxed">${p}</p>`)
        .join('');
}

export default NotesView;