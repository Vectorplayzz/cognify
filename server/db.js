/**
 * Database connection and table initialization
 * Cognify Platform - MySQL Implementation
 * Uses environment variables for secure configuration
 */
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

// ── Logging helper ──
function logDb(message, type = 'info', verbose = false) {
    const timestamp = new Date().toISOString();
    const prefix = `[DB ${type.toUpperCase()} ${timestamp}]`;
    const fullMessage = `${prefix} ${message}`;

    // Always write to log file
    try {
        const logDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, `cognify-db-${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, fullMessage + '\n', 'utf-8');
    } catch (_) { /* ignore logging failures */ }

    // Console output only for warnings/errors OR if verbose=true
    if (type === 'error') console.error(fullMessage);
    else if (type === 'warn') console.warn(fullMessage);
    else if (verbose) console.log(fullMessage);
    // else: skip INFO-level console output to reduce noise
}

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

 if (missingVars.length > 0) {
     logDb(`═══════════════════════════════════════════════════════════`, 'error');
     logDb(`  ⚠️  MISSING ENVIRONMENT VARIABLES`, 'error');
     logDb(`═══════════════════════════════════════════════════════════`, 'error');
     missingVars.forEach(varName => {
         logDb(`  - ${varName}`, 'error');
     });
     logDb(`═══════════════════════════════════════════════════════════`, 'error');
     logDb(`  ✅ Create a .env file with the following variables:`, 'info');
     logDb(`     DB_HOST=mysql.us.stackcp.com`, 'info');
     logDb(`     DB_USER=cognify-313931e669`, 'info');
     logDb(`     DB_PASSWORD=<your database password>`, 'info');
     logDb(`     DB_NAME=cognify-313931e669`, 'info');
     logDb(`     DB_PORT=43056`, 'info');
     logDb(`═══════════════════════════════════════════════════════════`, 'error');
     
     // Keep terminal open for debugging
     if (process.platform === 'win32') {
         console.log('\nPress Enter to exit, or wait 3 seconds...');
         const rl = readline.createInterface({
             input: process.stdin,
             output: process.stdout,
         });
         rl.on('line', () => {
             rl.close();
             process.exit(1);
         });
         setTimeout(() => {
             if (!rl.closed) {
                 rl.close();
                 process.exit(1);
             }
         }, 3000);
     } else {
         setTimeout(() => process.exit(1), 3000);
     }
 }

// Create connection pool with environment variables
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT, 10),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    charset: 'utf8mb4',
    timezone: 'Z',
});

// Test connection on startup with retry logic
async function testConnection(retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const connection = await pool.getConnection();
            logDb('✓ Connected to MySQL server successfully');
            connection.release();
            return true;
        } catch (err) {
            if (i === retries - 1) {
                // Final attempt failed
                logDb(`═══════════════════════════════════════════════════════════`, 'error');
                logDb(`  ⚠️  DATABASE CONNECTION FAILED`, 'error');
                logDb(`═══════════════════════════════════════════════════════════`, 'error');
                logDb(``, 'error');
                logDb(`  Error : ${err.message}`, 'error');
                logDb(`  Code  : ${err.code}`, 'error');
                logDb(``, 'error');

                if (err.code === 'ER_ACCESS_DENIED_ERROR') {
                    logDb(`  🔒 CAUSE: Access denied for user '${process.env.DB_USER}'@'your-ip'`, 'error');
                    logDb(`  └─ Your IP is NOT whitelisted in StackCP MySQL settings`, 'error');
                    logDb(`  └─ OR Username/Password is incorrect`, 'error');
                    logDb(``, 'error');
                    logDb(`  ✅ REQUIRED ACTION:`, 'info');
                    logDb(`     1. Log into https://my.stackcp.net`, 'info');
                    logDb(`     2. MySQL Databases → Remote MySQL / Manage IP Access`, 'info');
                    logDb(`     3. Add your public IP to whitelist`, 'info');
                    logDb(`     4. Wait 2-5 minutes for changes to propagate`, 'info');
                    logDb(`     5. Rerun: npm run test:db`, 'info');
                } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
                    logDb(`  🔌 CAUSE: Cannot reach MySQL server`, 'error');
                    logDb(`  └─ Hostname/port may be incorrect or firewall blocks`, 'error');
                    logDb(``, 'error');
                    logDb(`  ✅ CHECK:`, 'info');
                    logDb(`     1. Host: ${process.env.DB_HOST} (correct)`, 'info');
                    logDb(`     2. Port: ${process.env.DB_PORT} (non-standard MySQL port)`, 'info');
                    logDb(`     3. Verify MySQL is enabled in StackCP panel`, 'info');
                } else if (err.code === 'ER_BAD_DB_ERROR') {
                    logDb(`  🗄️  CAUSE: Database '${process.env.DB_NAME}' does not exist`, 'error');
                    logDb(``, 'error');
                    logDb(`  ✅ CREATE DATABASE in StackCP → MySQL Databases`, 'info');
                }

                logDb(`═══════════════════════════════════════════════════════════`, 'error');
                throw err;
            }
            logDb(`Connection attempt ${i + 1} failed, retrying in ${delay}ms...`, 'warn');
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Run connection test
testConnection().catch((err) => {
    logDb(`═══════════════════════════════════════════════════════════`, 'error');
    logDb(`  ⚠️  STARTUP ABORTED — DATABASE CONNECTION FAILED`, 'error');
    logDb(`═══════════════════════════════════════════════════════════`, 'error');
    logDb(`  The server will NOT start until the database is reachable.`, 'error');
    logDb(`  Please fix the errors above and restart.`, 'error');
    logDb(`═══════════════════════════════════════════════════════════`, 'error');
    
    // Keep terminal open for debugging
    if (process.platform === 'win32') {
        console.log('\nPress Enter to exit, or wait 3 seconds...');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.on('line', () => {
            rl.close();
            process.exit(1);
        });
        setTimeout(() => {
            if (!rl.closed) {
                rl.close();
                process.exit(1);
            }
        }, 3000);
    } else {
        setTimeout(() => process.exit(1), 3000);
    }
});

/**
 * Robust query executor that handles all mysql2 response formats
 * Works correctly for SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, SET, etc.
 */
export async function executeQuery(connection, query, description) {
    try {
        // Only log to file, not console (too verbose) — errors will still be caught below
        logDb(`Executing: ${description}`, 'info', false);
        const response = await connection.query(query);

        // mysql2/promise returns different formats depending on query type:
        // - SELECT: [rows, fields]
        // - INSERT/UPDATE/DELETE: [result] (result has affectedRows, insertId, etc.)
        // - CREATE/ALTER/SET: [result] or sometimes just result object directly
        let result;

        if (Array.isArray(response)) {
            result = response[0];
        } else {
            result = response;
        }

        // Silent success — only log to file at verbose level
        const affectedRows = result?.affectedRows ?? result?.rowCount ?? 0;
        logDb(`✓ Completed: ${description} (${affectedRows} rows affected)`, 'info', false);
        return result;
    } catch (err) {
        logDb(`✗ Failed: ${description}`, 'error');
        logDb(`  Error: ${err.message} (code: ${err.code})`, 'error');
        throw err;
    }
}

/**
 * Create all tables if they don't exist
 * MySQL-compatible SQL with comprehensive error handling
 */
export async function initTables() {
    const start = Date.now();
    let connection = null;

    try {
        logDb('Attempting to acquire database connection...');
        connection = await pool.getConnection();
        logDb('Database connection acquired successfully');

        // Enable foreign key support for InnoDB
        await executeQuery(connection, 'SET FOREIGN_KEY_CHECKS = 0', 'Disable foreign key checks');

        // ── Table definitions ──
        const tables = [
            {
                sql: `CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                google_id VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                picture TEXT,
                xp INTEGER DEFAULT 0,
                streak INTEGER DEFAULT 0,
                rewards JSON DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'users'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS roadmaps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                client_id VARCHAR(255),
                topic VARCHAR(255) NOT NULL,
                levels JSON DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_topic (user_id, topic),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'roadmaps'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS user_progress (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                roadmap_id INT,
                completed_levels JSON DEFAULT '[]',
                quiz_results JSON DEFAULT '[]',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_roadmap (user_id, roadmap_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'user_progress'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS chat_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                title VARCHAR(255) DEFAULT 'New Chat',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_chat_sessions_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'chat_sessions'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS code_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                language VARCHAR(50) NOT NULL,
                code TEXT NOT NULL,
                stdin TEXT DEFAULT '',
                output TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'code_history'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS chat_rooms (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_by INT,
                invite_code VARCHAR(20) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'chat_rooms'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS room_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id INT,
                user_id INT,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_room_member (room_id, user_id),
                FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_room_members_room (room_id),
                INDEX idx_room_members_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'room_members'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS room_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id INT,
                user_id INT,
                sender_name VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'user',
                content TEXT NOT NULL,
                persona VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_room_messages_room (room_id),
                INDEX idx_room_messages_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'room_messages'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS level_content (
                id INT AUTO_INCREMENT PRIMARY KEY,
                roadmap_id INT,
                level_id VARCHAR(255) NOT NULL,
                theory_content TEXT DEFAULT '',
                subtopics JSON DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_roadmap_level (roadmap_id, level_id),
                FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
                INDEX idx_level_content_roadmap (roadmap_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'level_content'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS level_quizzes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                roadmap_id INT,
                level_id VARCHAR(255) NOT NULL,
                questions JSON DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_roadmap_quiz (roadmap_id, level_id),
                FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
                INDEX idx_level_quizzes_roadmap (roadmap_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'level_quizzes'
            },

            // RAG Notes tables
            {
                sql: `CREATE TABLE IF NOT EXISTS note_sources (
                id INT AUTO_INCREMENT PRIMARY KEY,
                note_id INT,
                user_id INT NULL,
                type VARCHAR(20) NOT NULL,
                title VARCHAR(255) NOT NULL,
                content LONGTEXT NOT NULL,
                metadata JSON DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
                INDEX idx_note_sources_note (note_id),
                INDEX idx_note_sources_type (type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'note_sources'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS notes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                type VARCHAR(20) NOT NULL,
                content LONGTEXT DEFAULT '',
                summary TEXT DEFAULT '',
                key_points JSON DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_notes_user (user_id),
                INDEX idx_notes_type (type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'notes'
            },

            {
                sql: `CREATE TABLE IF NOT EXISTS note_source_links (
                id INT AUTO_INCREMENT PRIMARY KEY,
                note_id INT NOT NULL,
                source_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
                FOREIGN KEY (source_id) REFERENCES note_sources(id) ON DELETE CASCADE,
                UNIQUE KEY unique_note_source (note_id, source_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'note_source_links'
            },

            // RAG vector store — chunk embeddings live in MySQL (no separate
            // vector service required). Each row is one chunk: its text, the
            // embedding (JSON float array), the model + dimension it was made
            // with (so we never compare incompatible vectors), and metadata.
            {
                sql: `CREATE TABLE IF NOT EXISTS note_embeddings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                doc_id VARCHAR(191) NOT NULL,
                source_id INT,
                note_id INT,
                user_id INT,
                content LONGTEXT NOT NULL,
                embedding LONGTEXT NOT NULL,
                embed_model VARCHAR(64) NOT NULL DEFAULT '',
                dim INT NOT NULL DEFAULT 0,
                metadata JSON DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_doc (doc_id),
                INDEX idx_note_embeddings_source (source_id),
                INDEX idx_note_embeddings_note (note_id),
                INDEX idx_note_embeddings_model (embed_model),
                FOREIGN KEY (source_id) REFERENCES note_sources(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, name: 'note_embeddings'
            },
        ];

        for (const table of tables) {
            try {
                await executeQuery(connection, table.sql, `CREATE TABLE ${table.name}`);
            } catch (err) {
                logDb(`⚠️  Error creating table ${table.name}: ${err.message}`, 'warn');
                // Log but continue — IF NOT EXISTS should prevent most errors
            }
        }

        // ── Chat messages table with migration logic ──
        logDb('=== Checking chat_messages table ===');
        try {
            const tableCheckRows = await executeQuery(connection, `
                SELECT COUNT(*) as count
                FROM information_schema.TABLES
                WHERE table_schema = DATABASE() AND table_name = 'chat_messages'
            `, 'Check chat_messages table existence');

            const tableExists = tableCheckRows[0].count > 0;

            if (!tableExists) {
                await executeQuery(connection, `
                    CREATE TABLE chat_messages (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT,
                        session_id INT,
                        role VARCHAR(20) NOT NULL,
                        content TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
                        INDEX idx_chat_messages_session (session_id),
                        INDEX idx_chat_messages_user (user_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                `, 'CREATE TABLE chat_messages');
            } else {
                logDb('chat_messages table exists, checking columns...');
                const colCheckRows = await executeQuery(connection, `
                    SELECT COUNT(*) as count
                    FROM information_schema.COLUMNS
                    WHERE table_schema = DATABASE()
                      AND table_name = 'chat_messages'
                      AND column_name = 'session_id'
                `, 'Check session_id column existence');

                const columnExists = colCheckRows[0].count > 0;
                if (!columnExists) {
                    logDb('Migrating chat_messages: adding session_id column...');
                    // Step 1: Add column nullable
                    await executeQuery(
                        connection,
                        'ALTER TABLE chat_messages ADD COLUMN session_id INT NULL',
                        'ALTER TABLE chat_messages ADD COLUMN session_id (nullable)'
                    );
                    // Step 2: Add FK constraint
                    await executeQuery(
                        connection,
                        'ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE',
                        'ALTER TABLE chat_messages ADD FOREIGN KEY (session_id)'
                    );
                    logDb('Migration complete: session_id column and FK added');
                } else {
                    logDb('session_id column already exists, no migration needed');
                }
            }
         } catch (err) {
             logDb(`Error in chat_messages handling: ${err.message}`, 'error');
             throw err;
         }

        // ── Level content / quizzes migrations ──
        logDb('=== Checking level_content and level_quizzes tables ===');
        try {
            // ---- level_content ----
            const lcExistsRows = await executeQuery(connection, `
                SELECT COUNT(*) as count
                FROM information_schema.TABLES
                WHERE table_schema = DATABASE() AND table_name = 'level_content'
            `, 'Check level_content table existence');

            if (lcExistsRows[0].count === 0) {
                logDb('level_content table missing — will be created by main loop', 'info');
            } else {
                // Ensure all required columns exist
                const requiredCols = [
                    { name: 'theory_content', type: 'TEXT', default: "DEFAULT ''" },
                    { name: 'subtopics', type: 'JSON', default: "DEFAULT '[]'" },
                    { name: 'updated_at', type: 'TIMESTAMP', default: 'DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
                ];
                for (const col of requiredCols) {
                    const colCheck = await executeQuery(connection, `
                        SELECT COUNT(*) as count
                        FROM information_schema.COLUMNS
                        WHERE table_schema = DATABASE()
                          AND table_name = 'level_content'
                          AND column_name = '${col.name}'
                    `, `Check level_content.${col.name} existence`);

                    if (colCheck[0].count === 0) {
                        logDb(`Migrating level_content: adding column ${col.name}...`);
                        await executeQuery(
                            connection,
                            `ALTER TABLE level_content ADD COLUMN ${col.name} ${col.type} ${col.default}`,
                            `ALTER TABLE level_content ADD ${col.name}`
                        );
                        logDb(`✓ Added column: ${col.name}`);
                    } else {
                        logDb(`✓ Column level_content.${col.name} exists`);
                    }
                }
            }

            // ---- level_quizzes ----
            const lqExistsRows = await executeQuery(connection, `
                SELECT COUNT(*) as count
                FROM information_schema.TABLES
                WHERE table_schema = DATABASE() AND table_name = 'level_quizzes'
            `, 'Check level_quizzes table existence');

            if (lqExistsRows[0].count === 0) {
                logDb('level_quizzes table missing — will be created by main loop', 'info');
            } else {
                const requiredCols = [
                    { name: 'questions', type: 'JSON', default: "DEFAULT '[]'" },
                    { name: 'updated_at', type: 'TIMESTAMP', default: 'DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
                ];
                for (const col of requiredCols) {
                    const colCheck = await executeQuery(connection, `
                        SELECT COUNT(*) as count
                        FROM information_schema.COLUMNS
                        WHERE table_schema = DATABASE()
                          AND table_name = 'level_quizzes'
                          AND column_name = '${col.name}'
                    `, `Check level_quizzes.${col.name} existence`);

                    if (colCheck[0].count === 0) {
                        logDb(`Migrating level_quizzes: adding column ${col.name}...`);
                        await executeQuery(
                            connection,
                            `ALTER TABLE level_quizzes ADD COLUMN ${col.name} ${col.type} ${col.default}`,
                            `ALTER TABLE level_quizzes ADD ${col.name}`
                        );
                        logDb(`✓ Added column: ${col.name}`);
                    } else {
                        logDb(`✓ Column level_quizzes.${col.name} exists`);
                    }
                }
            }
        } catch (err) {
            logDb(`Error in level_content/level_quizzes migration: ${err.message}`, 'error');
            throw err;
        }

        // ── Ownership / attribution migrations ──
        // Additive and idempotent: nullable columns, then backfill.
        logDb('=== Checking ownership and attribution columns ===');
        const addColumn = async (table, column, ddl) => {
            const rows = await executeQuery(connection, `
                SELECT COUNT(*) as count FROM information_schema.COLUMNS
                WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${column}'
            `, `Check ${table}.${column}`);
            if (rows[0].count > 0) return false;
            await executeQuery(connection, `ALTER TABLE ${table} ADD COLUMN ${ddl}`, `ALTER TABLE ${table} ADD ${column}`);
            logDb(`✓ Added column ${table}.${column}`);
            return true;
        };

        // note_sources had no owner, so a note could link — and so read —
        // another user's upload. Owner is derived from the note it belongs to.
        await addColumn('note_sources', 'user_id', 'user_id INT NULL AFTER note_id');
        await executeQuery(connection, `
            UPDATE note_sources ns JOIN notes n ON n.id = ns.note_id
            SET ns.user_id = n.user_id WHERE ns.user_id IS NULL
        `, 'Backfill note_sources.user_id from note_id');
        await executeQuery(connection, `
            UPDATE note_sources ns
            JOIN note_source_links l ON l.source_id = ns.id
            JOIN notes n ON n.id = l.note_id
            SET ns.user_id = n.user_id WHERE ns.user_id IS NULL
        `, 'Backfill note_sources.user_id from links');
        await executeQuery(connection, `
            UPDATE note_embeddings e JOIN note_sources ns ON ns.id = e.source_id
            SET e.user_id = ns.user_id WHERE e.user_id IS NULL AND ns.user_id IS NOT NULL
        `, 'Backfill note_embeddings.user_id');

        // Saved roadmaps keep where their content came from (roadmap.sh / AI).
        await addColumn('roadmaps', 'source', 'source JSON NULL');

        // ── Indexes ──
        logDb('=== Creating Indexes ===');
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_roadmaps_user ON roadmaps(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id)',
            // idx_chat_sessions_user is inline in CREATE TABLE — skipping
            // idx_chat_messages_session and idx_chat_user are inline in CREATE TABLE — skipping
            'CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id)',
            'CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_note_sources_user ON note_sources(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_note_embeddings_user ON note_embeddings(user_id)',
            // idx_room_messages_room is inline in CREATE TABLE — skipping
            // idx_level_content_roadmap and idx_level_quizzes_roadmap are inline — skipping
        ];

        for (const idx of indexes) {
            try {
                await executeQuery(connection, idx, idx.substring(0, 50) + '...');
            } catch (err) {
                // Ignore "index already exists" errors
                if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME' || err.code === 'ER_INDEX_EXISTS') {
                    logDb(`  ℹ Index already exists, skipping`, 'info');
                } else {
                    throw err;
                }
            }
        }

        // Re-enable foreign key checks
        await executeQuery(connection, 'SET FOREIGN_KEY_CHECKS = 1', 'Enable foreign key checks');

        const duration = Date.now() - start;
        logDb(`✅ Tables initialized successfully in ${duration}ms`);

    } catch (err) {
        logDb(`❌ FATAL: Database initialization failed: ${err.message}`, 'error');
        logDb(`Stack trace:\n${err.stack}`, 'error');
        logDb(`Code: ${err.code}`, 'error');
        throw err;
    } finally {
        if (connection) {
            connection.release();
            logDb('Database connection released');
        }
    }
}

export default pool;
