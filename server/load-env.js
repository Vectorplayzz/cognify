/**
 * Environment loader - loads .env and .env.local before any other imports
 * Must be imported first in index.js
 */
import dotenv from 'dotenv';

// Load .env first (if exists), then .env.local to override
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
