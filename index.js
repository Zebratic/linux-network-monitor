import straceParser from './strace-parser.js';
import psList from 'ps-list';
import express from 'express';
import expressWs from 'express-ws';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

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

// Track all connected websocket clients
const clients = new Set();
let currentParsers = new Map(); // Map to store multiple parsers

// Serve static files from public directory
app.use(express.static('public'));

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
    if (currentParsers.size > 0) {
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
