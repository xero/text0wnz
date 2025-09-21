import { parseArgs } from './config.js';
import { startServer } from './server.js';
import text0wnz from './text0wnz.js';

// Parse command line arguments
const config = parseArgs();

// Initialize text0wnz
text0wnz.initialize(config);

// Start backend server
startServer(config);
