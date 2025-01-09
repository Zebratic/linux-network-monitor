import { exec } from 'child_process';

export default class StraceParser {
    constructor(timeout = 5) {
        this.connections = new Map();
        this.process = null;
        this.timeout = timeout * 1000; // Convert to milliseconds
        this.cleanupInterval = null;
        this.monitoredPid = null;
    }

    // Function to start monitoring a process
    async startMonitoring(pid) {
        console.log(`Starting monitoring for PID ${pid}`);
        this.monitoredPid = pid;

        // Stop any existing strace process
        if (this.process) {
            this.process.kill();
            console.log('Stopped the previous strace process.');
            this.process = null;
        }

        // Clear existing connections when starting new monitor
        this.connections.clear();

        // Start the strace process
        this.startStraceProcess();

        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, conn] of this.connections.entries()) {
                if (now - new Date(conn.lastSeen).getTime() > this.timeout) {
                    this.connections.delete(key);
                }
            }
        }, 1000); // Check every second
    }

    // Function to start the strace process
    startStraceProcess() {
        this.process = exec(`sudo strace -p ${this.monitoredPid} -f -e trace=network -s 1`);

        this.process.stdout.on('data', async (data) => {
            await this.parseOutput(data);
        });

        this.process.stderr.on('data', async (data) => {
            await this.parseOutput(data);
        });

        this.process.on('close', (code) => {
            //console.log(`Strace process exited with code ${code}`);
            this.process = null;
            
            // Restart if process was killed unexpectedly
            if (code === null && this.monitoredPid) {
                //console.log(`Restarting strace for PID ${this.monitoredPid}`);
                this.startStraceProcess();
            }
        });
    }

    // Function to stop monitoring
    stopMonitoring() {
        if (this.process) {
            this.process.kill();
            this.process = null;
            this.monitoredPid = null;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        this.connections.clear();
    }

    // Function to parse strace output
    parseOutput(output) {
        const lines = output.split('\n');

        lines.forEach(line => {
            const pidRegex = /\[pid\s+(\d+)\]/;
            const ipRegex = /inet_addr\("(\d+\.\d+\.\d+\.\d+)"\)/;
            const portRegex = /htons\((\d+)\)/;

            const pidMatch = line.match(pidRegex);
            const ipMatch = line.match(ipRegex);
            const portMatch = line.match(portRegex);

            if (pidMatch && ipMatch && portMatch) {
                const pid = pidMatch[1];
                const ip = ipMatch[1];
                const port = portMatch[1];

                this.addConnection(pid, ip, port);
            }
        });
    }

    // Function to add a connection to the list
    addConnection(pid, ip, port) {
        const key = `${ip}:${port}`;
        const existing = this.connections.get(key);

        if (!existing) {
            const connection = {
                pid: pid,
                ip: ip,
                port: port,
                lastSeen: new Date(),
                packets: 1
            };
            this.connections.set(key, connection);
            console.log(`New connection: ${connection.ip}:${connection.port} (PID: ${connection.pid})`);
        } else {
            existing.lastSeen = new Date();
            existing.packets++;
            this.connections.set(key, existing);
        }
    }

    // Function to get all connections
    getConnections() {
        // Filter out old connections before returning
        const now = Date.now();
        for (const [key, conn] of this.connections.entries()) {
            if (now - new Date(conn.lastSeen).getTime() > this.timeout) {
                this.connections.delete(key);
            }
        }
        return Array.from(this.connections.values());
    }

    // Function to get the current monitored PID
    getMonitoredPid() {
        return this.monitoredPid;
    }

    setTimeout(timeout) {
        this.timeout = timeout * 1000; // Convert to milliseconds
    }
}
