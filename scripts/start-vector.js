#!/usr/bin/env node

/**
 * Auto-start script for Vector DB service (Node.js)
 * - Checks that express/cors are installed (from project root)
 * - Starts Express server (index.js) on port 8000
 * - Waits for /health to return 200
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const vectorDir = path.join(projectRoot, 'vector-service');

function log(msg, type = 'info') {
  const colors = { info: '\x1b[36m', success: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
  const reset = '\x1b[0m';
  console.log(`${colors[type] || colors.info}[Vector]${reset} ${msg}`);
}

function checkVectorReady(port = 8000, maxAttempts = 90) {
  return new Promise((resolve) => {
    let attempts = 0;
    const tryConnect = () => {
      attempts++;
      http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          log(`Vector service ready on http://127.0.0.1:${port}`, 'success');
          resolve(true);
        } else {
          if (attempts < maxAttempts) setTimeout(tryConnect, 1000);
          else {
            log(`Health check returned ${res.statusCode}, giving up after ${maxAttempts}s`, 'error');
            resolve(false);
          }
        }
      }).on('error', (err) => {
        if (attempts < maxAttempts) {
          if (attempts === 1) log('Waiting for vector service to become healthy...', 'info');
          setTimeout(tryConnect, 1000);
        } else {
          log(`Vector service did not respond after ${maxAttempts}s: ${err.message}`, 'error');
          resolve(false);
        }
      });
    };
    setTimeout(tryConnect, 2000); // wait 2s for Express to start
  });
}

function nodeCommand() {
  const candidates = process.platform === 'win32' ? ['node', 'nodejs'] : ['node'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch { continue; }
  }
  return null;
}

async function startVectorService() {
  log('Starting vector service (Node.js)...', 'info');

  const node = nodeCommand();
  if (!node) {
    log('❌ Node.js not found. Install from https://nodejs.org', 'error');
    process.exit(1);
  }
  log(`✓ Using Node: ${node}`, 'info');

  // Verify project npm install was run (express/cors should be in root node_modules)
  const rootNodeModules = path.join(projectRoot, 'node_modules', 'express');
  if (!fs.existsSync(rootNodeModules)) {
    log('❌ Missing node_modules. Run "npm install" in the project root first.', 'error');
    process.exit(1);
  }
  log('✓ Dependencies verified (using root node_modules)', 'info');

  // Ensure DB directory exists
  const dbDir = path.join(vectorDir, 'chroma_db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    log('✓ Created chroma_db directory', 'info');
  }

  // Start Express server
  const child = spawn(node, ['index.js'], {
    cwd: vectorDir,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
  });

  let serverSeen = false;
  child.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg.includes('Server running')) {
      if (!serverSeen) {
        serverSeen = true;
        log('✓ Express server started — waiting for /health...', 'info');
      }
    }
    console.log(`[Vector] ${msg}`);
  });

  child.stderr.on('data', (data) => {
    console.error(`[Vector-ERR] ${data.toString().trim()}`);
  });

  child.on('error', (err) => {
    log(`❌ Failed to start vector service: ${err.message}`, 'error');
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      log(`Vector service exited with code ${code}`, 'error');
    }
    process.exit(code || 0);
  });

  // Wait for readiness
  const ready = await checkVectorReady(8000, 60);
  if (!ready) {
    log('❌ Vector service failed health check. Check logs above.', 'error');
    process.exit(1);
  }

  log('✅ Vector service is fully ready', 'success');
  return child;
}

// Main
(async () => {
  const child = await startVectorService();

  const shutdown = () => {
    log('Shutting down vector service...', 'info');
    child.kill('SIGTERM');
    setTimeout(() => process.exit(), 500);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', shutdown);
  process.on('uncaughtException', (err) => {
    console.error('Uncaught:', err);
    shutdown();
  });
})();