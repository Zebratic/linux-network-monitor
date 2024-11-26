import straceParser from './strace-parser.js';
import psList from 'ps-list';
import express from 'express';
import expressWs from 'express-ws';

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

// Serve static files from public directory
app.use(express.static('public'));

// WebSocket endpoint
app.ws('/ws', (ws, req) => {
    clients.add(ws);
    
    ws.on('close', () => {
        clients.delete(ws);
    });
});

// Start the server
const PORT = 9000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// wait 1 second before starting the parser
setTimeout(async () => {
    const parser = new straceParser();

    let processes = await psList();
    // find the process that match "vesktop"
    let process = processes.find(p => p.name.includes('Socket'));
    console.log(process);
    if (!process) {
        console.error('No process found');
        return;
    }

    parser.startMonitoring(process.pid);

    // Broadcast connection updates to all connected clients
    setInterval(() => {
        const connections = parser.getConnections();
        clients.forEach(client => {
            if (client.readyState === 1) { // 1 = OPEN
                client.send(JSON.stringify(connections));
            }
        });
    }, 1000);

}, 1000);
