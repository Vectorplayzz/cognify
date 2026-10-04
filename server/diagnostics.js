#!/usr/bin/env node
/**
 * Cognify Database Diagnostic Tool - MySQL Version
 * Tests connectivity using environment configuration
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local', override: true });

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    dim: '\x1b[2m',
};

function log(message, type = 'info') {
    const prefix = {
        info: `${colors.cyan}[INFO]${colors.reset}`,
        error: `${colors.red}[ERROR]${colors.reset}`,
        success: `${colors.green}[OK]${colors.reset}`,
        warn: `${colors.yellow}[WARN]${colors.reset}`,
    }[type];

    const timestamp = new Date().toISOString();
    console.log(`${colors.dim}${timestamp}${colors.reset} ${prefix} ${message}`);
}

function logSection(title) {
    console.log('\n' + '═'.repeat(60));
    console.log(`${colors.cyan}  ${title}${colors.reset}`);
    console.log('═'.repeat(60));
}

const DB_CONFIG = {
    host: process.env.DB_HOST || 'mysql.us.stackcp.com',
    user: process.env.DB_USER || 'cognify-313931e669',
    password: process.env.DB_PASSWORD, // never hardcode: it must come from .env
    database: process.env.DB_NAME || 'cognify-313931e669',
    port: parseInt(process.env.DB_PORT, 10) || 43056,
};

async function runDiagnostics() {
    logSection('Cognify MySQL Database Diagnostics');
    
    log(`Testing connection to:`);
    log(`  Host: ${DB_CONFIG.host}`);
    log(`  Port: ${DB_CONFIG.port}`);
    log(`  Database: ${DB_CONFIG.database}`);
    log(`  User: ${DB_CONFIG.user}`);
    console.log('');

    const pool = mysql.createPool({
        ...DB_CONFIG,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        connectTimeout: 10000,
    });

    let connection = null;
    
    try {
        log('Step 1: Acquiring connection...');
        connection = await pool.getConnection();
        log('✓ Connected to MySQL server', 'success');
        
        log('Step 2: Running simple query (SELECT NOW())...');
        const [rows] = await connection.query('SELECT NOW() as time, VERSION() as ver');
        log(`✓ Query succeeded. Server time: ${rows[0].time}`, 'success');
        log(`  MySQL version: ${rows[0].ver.substring(0, 50)}`);
        
        log('Step 3: Verifying database exists...');
        const [dbRows] = await connection.query(
            'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
            [DB_CONFIG.database]
        );
        if (dbRows.length > 0) {
            log(`✓ Database "${DB_CONFIG.database}" exists`, 'success');
        } else {
            log(`✗ Database "${DB_CONFIG.database}" NOT FOUND`, 'error');
            log(`  You may need to create it in your StackCP panel.`, 'warn');
        }
        
        log('Step 4: Checking user privileges...');
        try {
            const [privRows] = await connection.query(
                "SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES WHERE GRANTEE = CONCAT(\"'\", ?, \"'\", \"@'%'\") AND PRIVILEGE_TYPE = 'CREATE'",
                [DB_CONFIG.user]
            );
            // More permissive check: just try creating a test table
            await connection.query(`
                CREATE TABLE IF NOT EXISTS test_cognify_connection (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    test_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB
            `);
            log(`✓ User has sufficient privileges to create tables`, 'success');
            await connection.query('DROP TABLE IF EXISTS test_cognify_connection');
            log('✓ Cleanup successful', 'success');
        } catch (e) {
            log(`✗ Privilege check/table creation failed: ${e.message}`, 'error');
            log(`  This indicates insufficient database privileges.`, 'warn');
        }
        
        log('Step 5: Listing existing tables...');
        const [tables] = await connection.query(`
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = DATABASE()
            ORDER BY TABLE_NAME
        `);
        
        if (tables.length > 0) {
            log(`Found ${tables.length} tables:`, 'success');
            tables.forEach((row) => {
                console.log(`   • ${row.TABLE_NAME}`);
            });
        } else {
            log('No tables found yet - will be created on first server start', 'info');
        }
        
        log('Step 6: Checking connection pool...');
        log(`  Total connections: ${pool.totalConnections}`);
        log(`  Active connections: ${pool.activeConnections}`);
        log(`  Idle connections: ${pool.idleConnections}`);
        
        logSection('Diagnostics Complete ✓');
        log('All connectivity checks passed!', 'success');
        log('You can now run: npm run dev:be', 'info');
        console.log('');
        
    } catch (error) {
        logSection('Diagnostics FAILED ✗');
        log(`Error: ${error.message}`, 'error');
        log(`Code: ${error.code}`, 'error');
        if (error.stack) log(`Stack: ${error.stack}`, 'error');
        
        console.log('\n' + colors.yellow + 'Troubleshooting MySQL Connection:' + colors.reset);
        
        switch (error.code) {
            case 'ER_ACCESS_DENIED_ERROR':
                console.log('→ Access denied. Check username/password.');
                console.log(`  User: ${DB_CONFIG.user}`);
                console.log('  Verify credentials in server/db.js');
                break;
            case 'ECONNREFUSED':
                console.log('→ Connection refused.');
                console.log(`  Verify host: ${DB_CONFIG.host}`);
                console.log(`  Verify port: ${DB_CONFIG.port}`);
                console.log('  Check if MySQL server is running');
                break;
            case 'ETIMEDOUT':
                console.log('→ Connection timed out.');
                console.log('  Check network connectivity');
                console.log('  Firewall may be blocking port 43056');
                break;
            case 'ENOTFOUND':
                console.log('→ DNS lookup failed.');
                console.log(`  Check the hostname: ${DB_CONFIG.host}`);
                break;
            case 'ER_BAD_DB_ERROR':
                console.log('→ Database does not exist.');
                console.log(`  Create database "${DB_CONFIG.database}" in StackCP panel first`);
                break;
            default:
                console.log(`→ MySQL error (${error.code}). See details above.`);
        }
        
        console.log(`\n${colors.red}Recommended actions:${colors.reset}`);
        console.log(`  1. Verify database credentials in server/db.js`);
        console.log(`  2. Ensure MySQL server is running`);
        console.log(`  3. Confirm your IP is whitelisted (hosting control panel)`);
        console.log(`  4. Check port 43056 is accessible`);
        console.log(`  5. Verify database exists in StackCP dashboard\n`);
        
        if (process.platform === 'win32') {
            console.log(`${colors.yellow}Press any key to exit...${colors.reset}`);
            try {
                const readline = require('readline');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                rl.question('', () => {
                    rl.close();
                    process.exit(1);
                });
            } catch {
                setTimeout(() => process.exit(1), 30000);
            }
        } else {
            setTimeout(() => process.exit(1), 30000);
        }
        
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

runDiagnostics().catch(err => {
    console.error('Fatal error in diagnostic script:', err);
    process.exit(1);
});
