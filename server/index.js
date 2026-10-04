/**
 * Cognify Backend API Server
 * Clean implementation with robust error handling and debug keeping
 */
import './load-env.js';
import express from 'express';
import cors from 'cors';
import { initTables } from './db.js';
import apiRoutes from './routes/api.js';
import pool from './db.js';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

const app = express();
// nginx terminates TLS and proxies to us; trust its X-Forwarded-For so
// per-IP rate limiting sees the real client instead of 127.0.0.1.
app.set('trust proxy', 'loopback');
const PORT = process.env.API_PORT || 3001;
// nginx on this host is the only intended client: binding loopback keeps the
// API off the public interface, so it is never reachable over plain HTTP
// (where session tokens would travel unencrypted) or around nginx's limits.
const HOST = process.env.API_HOST || '127.0.0.1';

// ── Colored logging helpers ──
const colors = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    white: '\x1b[37m',
};

function timestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

 // ── Logging helper with file persistence ──
function logServer(message, type = 'info') {
    const ts = timestamp();
    const prefix = `[${ts}] [SERVER ${type.toUpperCase()}]`;
    const fullMessage = `${prefix} ${message}`;
    
    if (type === 'error') console.error(fullMessage);
    else if (type === 'warn') console.warn(fullMessage);
    else console.log(fullMessage);
    
    // Write to persistent log file
    try {
        const logDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, `cognify-server-${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, fullMessage + '\n', 'utf-8');
    } catch (_) { /* ignore logging failures */ }
}

// ── Request logging middleware ──
app.use((req, res, next) => {
    const start = Date.now();
    const method = req.method;
    const url = req.originalUrl;

    logServer(`${method} ${url}`);

    const originalSend = res.send;
    res.send = function (body) {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const statusColor = status >= 400 ? colors.red : status >= 300 ? colors.yellow : colors.green;

        console.log(
            `${colors.dim}${timestamp()}${colors.reset} ${statusColor}← ${status}${colors.reset} ${method} ${url} ${colors.dim}${duration}ms${colors.reset}`
        );

        return originalSend.call(this, body);
    };

    next();
});

// Middleware
// In production only the deployed site may call the API; in development any
// origin is allowed so local tooling keeps working.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
    .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        // Same-origin and non-browser clients send no Origin header.
        if (!origin) return callback(null, true);
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        logServer(`Blocked cross-origin request from ${origin}`, 'warn');
        return callback(null, false);
    },
}));
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Fatal error handler ──
let isExiting = false;

function handleFatalError(error, context) {
    if (isExiting) return;
    isExiting = true;

    const errorDetails = `
${'='.repeat(60)}
${colors.red} FATAL ERROR ${colors.reset}
Context: ${context}
Time: ${new Date().toISOString()}
Message: ${error.message}
Code: ${error.code || 'N/A'}
Stack: ${error.stack}
${'='.repeat(60)}
    `;
    
    logServer(errorDetails, 'error');
    console.error(errorDetails);
    
    // Keep terminal open for debugging — pause before exit
    const doExit = () => {
        logServer('Exiting in 3 seconds...', 'info');
        setTimeout(() => process.exit(1), 3000);
    };

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
        // Fallback: exit after timeout even without keypress
        setTimeout(() => {
            if (!rl.closed) {
                rl.close();
                process.exit(1);
            }
        }, 3000);
    } else {
        doExit();
    }
}

// ── Initialize database and start server with comprehensive error handling ──
async function startServer() {
    logServer('=== Cognify API Server Starting ===');
    logServer(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logServer(`Port: ${PORT}`);
    logServer(`Database Host: ${process.env.DB_HOST}:${process.env.DB_PORT} (MySQL)`);

    try {
        // Step 1: Validate environment
        logServer('Step 1: Validating environment...');
        if (!process.env.API_PORT) {
            logServer('API_PORT not set, using default: 3001', 'warn');
        }

        // Step 2: Initialize database
        logServer('Step 2: Initializing database connection...');
        await initTables();
        logServer('✓ Database initialized successfully');
        
        // Step 3: Start server
        logServer('Step 3: Starting HTTP server...');
        const server = app.listen(PORT, HOST, () => {
            const banner = `
${colors.green}╔═══════════════════════════════════════════════╗${colors.reset}
${colors.green}║${colors.reset}   🧠 Cognify API Server is RUNNING           ${colors.green}║${colors.reset}
${colors.green}║${colors.reset}   ${colors.white}http://localhost:${PORT}${colors.reset}                     ${colors.green}║${colors.reset}
${colors.green}║${colors.reset}   Health: ${colors.cyan}/health${colors.reset}  API: ${colors.cyan}/api/*${colors.reset}                ${colors.green}║${colors.reset}
${colors.green}╚═══════════════════════════════════════════════╝${colors.reset}
            `;
            console.log(banner);
            logServer(`Server listening on port ${PORT}`);
        });

        // Handle server errors
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logServer(`Port ${PORT} is already in use. Try a different port.`, 'error');
                handleFatalError(new Error(`Port ${PORT} in use`), 'Port binding');
            } else {
                logServer(`Server error: ${err.message}`, 'error');
                handleFatalError(err, 'Server start');
            }
        });

         // Graceful shutdown handler
         const gracefulShutdown = async (signal) => {
             logServer(`${signal} received, shutting down gracefully...`);
             server.close(() => {
                 logServer('HTTP server closed');
                 // Close database pool (mysql2/promise pool.end returns Promise)
                 pool.end()
                     .then(() => {
                         logServer('Database pool closed');
                         process.exit(0);
                     })
                     .catch((err) => {
                         logServer(`Error closing pool: ${err.message}`, 'error');
                         process.exit(1);
                     });
             });
         };
        
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

    } catch (error) {
        handleFatalError(error, 'Startup sequence');
    }
}

// Start the server
startServer().catch(err => {
    // Catch any unhandled promise rejections from startServer
    handleFatalError(err, 'Unhandled startup error');
});

// ── Global error handlers ──
process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logServer(`Unhandled Rejection: ${err.message}`, 'error');
    logServer(`Stack: ${err.stack}`, 'error');
    handleFatalError(err, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (error) => {
    logServer(`Uncaught Exception: ${error.message}`, 'error');
    logServer(`Stack: ${error.stack}`, 'error');
    handleFatalError(error, 'Uncaught Exception');
});
