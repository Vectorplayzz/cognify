#!/usr/bin/env node
/**
 * Quick MySQL DB Connectivity Check
 * Run: node server/db-check.js
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local', override: true });

const config = {
  host: process.env.DB_HOST || 'mysql.us.stackcp.com',
  user: process.env.DB_USER || 'cognify-313931e669',
  password: process.env.DB_PASSWORD, // never hardcode: it must come from .env
  database: process.env.DB_NAME || 'cognify-313931e669',
  port: parseInt(process.env.DB_PORT, 10) || 43056,
};

console.log('🔍 Connecting to MySQL database...');
console.log(`   Host: ${config.host}`);
console.log(`   Port: ${config.port}`);
console.log(`   DB: ${config.database}`);
console.log(`   User: ${config.user}`);
console.log('');

const pool = mysql.createPool(config);

try {
    const conn = await pool.getConnection();
    console.log('✅ Connected successfully!');
    
    const [rows] = await conn.query('SELECT NOW() as time, VERSION() as ver');
    console.log(`   Server time: ${rows[0].time}`);
    console.log(`   MySQL version: ${rows[0].ver.substring(0, 50)}...`);
    
    conn.release();
    await pool.end();
    console.log('\n✓ Connection test complete');
} catch (err) {
    console.error('❌ Connection FAILED');
    console.error(`   Code: ${err.code}`);
    console.error(`   Message: ${err.message}`);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Verify credentials in server/db.js');
    console.error('  2. Check MySQL server is running on mysql.us.stackcp.com:43056');
    console.error('  3. Ensure your IP is whitelisted in hosting control panel');
    console.error('  4. Port 43056 should be open');
    console.error('  5. Verify database exists in StackCP dashboard\n');
    await pool.end();
    process.exit(1);
}
