import straceParser from './strace-parser.js';
import psList from 'ps-list';
import express from 'express';
import expressWs from 'express-ws';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configure dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// Check if running as root
if (process.getuid && process.getuid() !== 0) {
    console.error('This program must be run as root');
    process.exit(1);
}

// Create Express app and add WebSocket support
const app = express();
const wsInstance = expressWs(app);

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Track all connected websocket clients
const clients = new Set();
let currentParsers = new Map(); // Map to store multiple parsers

// Function to stop all parsers and clear the map
function stopAllParsers() {
    console.log('Stopping all strace processes - no clients connected');
    currentParsers.forEach(parser => parser.stopMonitoring());
    currentParsers.clear();
}

// Cache for program icons
const iconCache = new Map();

// Function to find program icon
async function findProgramIcon(programName) {
    if (iconCache.has(programName)) {
        return iconCache.get(programName);
    }

    try {
        // Common icon locations
        const iconLocations = [
            '/usr/share/icons',
            '/usr/share/pixmaps',
            '/usr/local/share/icons',
            '~/.local/share/icons'
        ];

        // Search for icons in common locations
        for (const location of iconLocations) {
            const { stdout } = await execAsync(`find ${location} -iname "*${programName}*.png" -o -iname "*${programName}*.svg" 2>/dev/null | head -n 1`);
            if (stdout.trim()) {
                iconCache.set(programName, stdout.trim());
                return stdout.trim();
            }
        }

        // If no specific icon found, try to find a generic application icon
        const { stdout } = await execAsync('find /usr/share/icons -name "application-x-executable.png" 2>/dev/null | head -n 1');
        const defaultIcon = stdout.trim() || '/usr/share/icons/hicolor/48x48/apps/application-x-executable.png';
        iconCache.set(programName, defaultIcon);
        return defaultIcon;
    } catch (error) {
        console.error('Error finding icon:', error);
        return null;
    }
}

// Serve static files from public directory
app.use(express.static('public'));

// Main route
app.get('/', (req, res) => {
    res.render('layouts/main');
});

// API endpoint to get program icon
app.get('/program-icon/:name', async (req, res) => {
    const programName = req.params.name;
    try {
        const iconPath = await findProgramIcon(programName);
        if (iconPath) {
            res.sendFile(iconPath);
        } else {
            res.status(404).send('Icon not found');
        }
    } catch (error) {
        console.error('Error serving icon:', error);
        res.status(500).send('Error serving icon');
    }
});

// API endpoint to get list of processes grouped by name
app.get('/processes', async (req, res) => {
    const processes = await psList();
    const groupedProcesses = processes.reduce((acc, proc) => {
        if (!acc[proc.name]) {
            acc[proc.name] = {
                name: proc.name,
                pids: []
            };
        }
        acc[proc.name].pids.push(proc.pid);
        return acc;
    }, {});
    res.json(Object.values(groupedProcesses));
});

// WebSocket endpoint
app.ws('/ws', (ws, req) => {
    clients.add(ws);
    console.log(`Client connected. Total clients: ${clients.size}`);
    
    ws.on('message', async (msg) => {
        const data = JSON.parse(msg);
        if (data.type === 'monitor' && data.pids) {
            // Stop existing parsers if any
            currentParsers.forEach(parser => parser.stopMonitoring());
            currentParsers.clear();
            
            // Start new parsers for each PID
            data.pids.forEach(pid => {
                const parser = new straceParser();
                parser.startMonitoring(pid);
                currentParsers.set(pid, parser);
            });
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`Client disconnected. Total clients: ${clients.size}`);
        
        // If no clients are connected, stop all parsers
        if (clients.size === 0) {
            stopAllParsers();
        }
    });

    // Handle errors to prevent crashes
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
        
        // If no clients are connected, stop all parsers
        if (clients.size === 0) {
            stopAllParsers();
        }
    });
});

// Start the server
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Broadcast connection updates to all connected clients
const UPDATE_INTERVAL = process.env.UPDATE_INTERVAL || 1000;
setInterval(() => {
    // Only process and send updates if there are clients connected
    if (clients.size > 0 && currentParsers.size > 0) {
        // Combine connections from all parsers
        const allConnections = Array.from(currentParsers.values()).reduce((acc, parser) => {
            return acc.concat(parser.getConnections());
        }, []);

        clients.forEach(client => {
            if (client.readyState === 1) { // 1 = OPEN
                client.send(JSON.stringify(allConnections));
            }
        });
    }
}, UPDATE_INTERVAL);

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down...');
    stopAllParsers();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down...');
    stopAllParsers();
    process.exit(0);
});
