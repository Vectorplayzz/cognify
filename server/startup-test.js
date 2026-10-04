/**
 * Quick test: start the server briefly to verify no startup errors
 */
import('./server/index.js').then(() => {
    console.log('Server module loaded successfully (no startup errors)');
    process.exit(0);
}).catch(err => {
    console.error('FAILED to load server:', err);
    process.exit(1);
});

// Timeout after 3 seconds to prevent hanging
setTimeout(() => {
    console.log('Server loading timed out (may be waiting for connections)');
    process.exit(0);
}, 3000);
