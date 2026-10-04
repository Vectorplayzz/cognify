/**
 * Notes API Routes — RAG over each user's own uploaded sources.
 *
 * Mounted under the authenticated API router, so req.user is always set.
 * Every query is scoped to it.
 */
import { Router } from 'express';
import pool from '../db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import { fileURLToPath } from 'url';
import { embedText, embedBatch, chunkText, EMBED_MODEL } from '../services/embeddingService.js';
import { addToVectorDB, queryVectorDB } from '../vectorStore.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { touchActivity } from '../services/gamification.js';

const router = Router();

// PDF parsing and embedding are CPU/IO heavy; keep them per-user bounded.
const uploadLimiter = rateLimit({ windowMs: 60000, max: Number(process.env.NOTES_UPLOAD_RATE_LIMIT_PER_MIN || 10), keyPrefix: 'notes-upload' });
const ragLimiter = rateLimit({ windowMs: 60000, max: Number(process.env.NOTES_RAG_RATE_LIMIT_PER_MIN || 30), keyPrefix: 'notes-rag' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Logging helper ──
function log(tag, msg) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`\x1b[2m${ts}\x1b[0m \x1b[35m[${tag}]\x1b[0m ${msg}`);
}

// Retrieval is per-user unless an operator deliberately opts into a shared pool.
const SHARED_KNOWLEDGE = process.env.RAG_SHARED_KNOWLEDGE === 'true';

async function ownsNote(userId, noteId) {
    const [rows] = await pool.query('SELECT 1 FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    return rows.length > 0;
}

// ── Multer config (in-memory uploads) ──
const storage = multer.memoryStorage();
export const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

// ============================================
//  FILE UPLOAD & TEXT EXTRACTION
// ============================================

router.post('/upload-files', uploadLimiter, upload.array('files', 5), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const extracted = [];
        const skipped = [];

        for (const file of files) {
            let text = '';
            const ext = path.extname(file.originalname).toLowerCase();

            try {
                if (ext === '.pdf') {
                    const data = await pdfParse(file.buffer);
                    text = data.text;
                } else if (ext === '.txt' || ext === '.md') {
                    text = file.buffer.toString('utf-8');
                } else {
                    skipped.push(file.originalname);
                    continue; // unsupported type
                }

                // Trim to reasonable length
                text = text.slice(0, 50000); // 50k chars max per file
            } catch (err) {
                console.error('Extraction error:', err);
                skipped.push(file.originalname);
                continue;
            }
            if (!text.trim()) {
                // e.g. a scanned PDF with no text layer
                skipped.push(file.originalname);
                continue;
            }

            extracted.push({
                filename: file.originalname,
                content: text,
                type: ext.slice(1), // 'pdf', 'txt', 'md'
            });
        }

        if (extracted.length === 0) {
            return res.status(422).json({ error: 'No readable text was found in those files.', skipped });
        }
        res.json({ success: true, files: extracted, skipped });
    } catch (err) {
        console.error('[Upload] error:', err);
        res.status(500).json({ error: 'File processing failed' });
    }
});

// ============================================
//  RAG RETRIEVAL ENDPOINT
// ============================================

router.post('/retrieve', ragLimiter, async (req, res) => {
    try {
        const { query } = req.body || {};
        if (typeof query !== 'string' || !query.trim()) return res.status(400).json({ error: 'query required' });
        const topK = Math.min(Math.max(parseInt(req.body.topK, 10) || 5, 1), 20);

        // Generate embedding for the query (server-side)
        const queryEmbedding = await embedText(query.slice(0, 8000));

        // Query vector DB for relevant chunks (same embedding model, and only
        // this user's documents unless shared knowledge is switched on).
        const results = await queryVectorDB(queryEmbedding, topK, {
            model: EMBED_MODEL,
            ...(SHARED_KNOWLEDGE ? {} : { userId: req.user.id }),
        });
        res.json({ results });
    } catch (err) {
        console.error('[RAG] Retrieval error:', err);
        res.status(500).json({ error: 'Retrieval failed' });
    }
});

// ============================================
//  NOTE SOURCES (with RAG indexing)
// ============================================

router.post('/sources', ragLimiter, async (req, res) => {
    try {
        const { noteId, type, title, content, metadata, sourceType, referenceId } = req.body || {};
        const userId = req.user.id;
        // noteId is intentionally optional: sources are uploaded BEFORE the note
        // is generated, then linked afterwards via note_source_links.
        if (!type || !title || !content) {
            return res.status(400).json({ error: 'type, title, content required' });
        }
        if (noteId != null && !(await ownsNote(userId, noteId))) {
            return res.status(404).json({ error: 'Note not found' });
        }
        log('Notes', `Create source: "${title}"${noteId ? ` for note ${noteId}` : ' (unlinked)'} user=${userId}`);

        // Fold optional sourceType/referenceId into metadata (the note_sources
        // table has no dedicated columns for them).
        const sourceMeta = { ...(metadata || {}) };
        if (sourceType) sourceMeta.sourceType = sourceType;
        if (referenceId != null) sourceMeta.referenceId = referenceId;

        const [result] = await pool.query(
            `INSERT INTO note_sources (note_id, user_id, type, title, content, metadata)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [noteId ?? null, userId, String(type).slice(0, 20), String(title).slice(0, 255), content, JSON.stringify(sourceMeta)]
        );

        const [rows] = await pool.query('SELECT * FROM note_sources WHERE id = ?', [result.insertId]);
        const source = rows[0];

        // ── Asynchronously index this source into the MySQL vector store ──
        (async () => {
            try {
                const chunks = chunkText(source.content, 1000, 200);
                if (chunks.length === 0) return;

                const embeddings = await embedBatch(chunks);
                const docs = chunks
                    .map((chunk, idx) => ({
                        id: `${source.id}-${idx}`,
                        embedding: embeddings[idx],
                        content: chunk,
                        metadata: {
                            sourceId: source.id,
                            noteId: source.note_id,
                            userId: userId ?? null,
                            title: source.title,
                            type: source.type,
                            fileName: source.title,
                            model: EMBED_MODEL,
                        },
                    }))
                    .filter((d) => Array.isArray(d.embedding) && d.embedding.length > 0);

                const ok = await addToVectorDB(docs);
                if (ok) log('RAG', `Indexed source ${source.id} into ${docs.length} chunks (${EMBED_MODEL})`);
            } catch (e) {
                console.error('RAG indexing failure:', e);
            }
        })();

        res.json(source);
    } catch (err) {
        console.error('[API] Create note source error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/notes/:noteId/sources', async (req, res) => {
    try {
        if (!(await ownsNote(req.user.id, req.params.noteId))) return res.status(404).json({ error: 'Note not found' });
        const [rows] = await pool.query(
            'SELECT * FROM note_sources WHERE note_id = ? ORDER BY created_at ASC',
            [req.params.noteId]
        );
        res.json(rows);
    } catch (err) {
        console.error('[API] Get note sources error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/notes', async (req, res) => {
    try {
        const { title, type, content, summary, keyPoints, sourceIds } = req.body || {};
        const userId = req.user.id;
        if (!title || !type) {
            return res.status(400).json({ error: 'title, type required' });
        }
        log('Notes', `Create note: "${title}" for user ${userId}`);
        touchActivity(userId);

        const [result] = await pool.query(
            `INSERT INTO notes (user_id, title, type, content, summary, key_points)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, title, type, content || '', summary || '', JSON.stringify(keyPoints || [])]
        );

        const [rows] = await pool.query('SELECT * FROM notes WHERE id = ?', [result.insertId]);

        if (Array.isArray(sourceIds) && sourceIds.length > 0) {
            // Only the caller's own sources may be linked — otherwise a note
            // could be used to read someone else's uploaded document.
            const [owned] = await pool.query(
                'SELECT id FROM note_sources WHERE user_id = ? AND id IN (?)',
                [userId, sourceIds.slice(0, 100)]
            );
            for (const { id: sourceId } of owned) {
                await pool.query(
                    'INSERT IGNORE INTO note_source_links (note_id, source_id) VALUES (?, ?)',
                    [result.insertId, sourceId]
                );
            }
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('[API] Create note error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/users/:userId/notes', async (req, res) => {
    if (String(req.params.userId) !== String(req.user.id)) {
        return res.status(403).json({ error: 'You do not have access to this resource', code: 'forbidden' });
    }
    try {
        const [rows] = await pool.query(
            `SELECT n.*,
                (SELECT COUNT(*) FROM note_source_links WHERE note_id = n.id) as source_count
             FROM notes n
             WHERE n.user_id = ?
             ORDER BY n.updated_at DESC`,
            [req.user.id]
        );

        const parsedRows = rows.map(row => ({
            ...row,
            key_points: typeof row.key_points === 'string' ? JSON.parse(row.key_points || '[]') : row.key_points
        }));

        res.json(parsedRows);
    } catch (err) {
        console.error('[API] Get notes error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/notes/:id', async (req, res) => {
    try {
        const [noteRows] = await pool.query('SELECT * FROM notes WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (noteRows.length === 0) return res.status(404).json({ error: 'Note not found' });

        const note = noteRows[0];

        const [sourceRows] = await pool.query(`
            SELECT ns.* FROM note_sources ns
            JOIN note_source_links nsl ON ns.id = nsl.source_id
            WHERE nsl.note_id = ?
            ORDER BY ns.created_at ASC
        `, [req.params.id]);

        res.json({
            ...note,
            key_points: typeof note.key_points === 'string' ? JSON.parse(note.key_points || '[]') : note.key_points,
            sources: sourceRows
        });
    } catch (err) {
        console.error('[API] Get note error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/notes/:id', async (req, res) => {
    try {
        log('Notes', `Delete note ${req.params.id} user=${req.user.id}`);
        if (!(await ownsNote(req.user.id, req.params.id))) return res.status(404).json({ error: 'Note not found' });
        // Sources used only by this note go too (their embeddings cascade),
        // so deleted material can no longer surface in RAG retrieval.
        const [linked] = await pool.query(
            `SELECT l.source_id FROM note_source_links l
             JOIN note_sources s ON s.id = l.source_id AND s.user_id = ?
             WHERE l.note_id = ?
               AND NOT EXISTS (SELECT 1 FROM note_source_links o WHERE o.source_id = l.source_id AND o.note_id <> l.note_id)`,
            [req.user.id, req.params.id]
        );
        await pool.query('DELETE FROM notes WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        const orphanIds = linked.map((r) => r.source_id);
        if (orphanIds.length) {
            await pool.query('DELETE FROM note_embeddings WHERE source_id IN (?)', [orphanIds]);
            await pool.query('DELETE FROM note_sources WHERE id IN (?) AND user_id = ?', [orphanIds, req.user.id]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[API] Delete note error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/notes/:id', async (req, res) => {
    try {
        const { title, content, summary, keyPoints } = req.body || {};
        // Only update the fields that were sent; omitted ones stay as they are.
        const sets = [];
        const vals = [];
        if (typeof title === 'string' && title.trim()) { sets.push('title = ?'); vals.push(title.trim().slice(0, 255)); }
        if (typeof content === 'string') { sets.push('content = ?'); vals.push(content); }
        if (typeof summary === 'string') { sets.push('summary = ?'); vals.push(summary); }
        if (Array.isArray(keyPoints)) { sets.push('key_points = ?'); vals.push(JSON.stringify(keyPoints)); }
        if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

        const [result] = await pool.query(
            `UPDATE notes SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
            [...vals, req.params.id, req.user.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Note not found' });

        const [rows] = await pool.query('SELECT * FROM notes WHERE id = ?', [req.params.id]);
        res.json(rows[0]);
    } catch (err) {
        console.error('[API] Update note error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
