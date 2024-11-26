import { exec } from 'child_process';

class StraceParser {
    constructor() {
        this.connections = [];
        this.currentStraceProcess = null;
        this.monitoredPid = null;
    }

    // Function to start monitoring a process
    async startMonitoring(pid) {
        this.monitoredPid = pid;

        // Stop any existing strace process
        if (this.currentStraceProcess) {
            this.currentStraceProcess.kill();
            console.log('Stopped the previous strace process.');
            this.currentStraceProcess = null;
        }

        // Clear existing connections when starting new monitor
        this.clearConnections();

        // Start the strace process
        this.startStraceProcess();

        // remove stale connections every 1 second
        setInterval(() => {
            this.removeStaleConnections();
        }, 1000);
    }

    // Function to start the strace process
    startStraceProcess() {
        this.currentStraceProcess = exec(`sudo strace -p ${this.monitoredPid} -f -e trace=network -s 1`);

        this.currentStraceProcess.stdout.on('data', async (data) => {
            await this.parseOutput(data);
        });

        this.currentStraceProcess.stderr.on('data', async (data) => {
            await this.parseOutput(data);
        });

        this.currentStraceProcess.on('close', (code) => {
            console.log(`Strace process exited with code ${code}`);
            this.currentStraceProcess = null;
            
            // Restart if process was killed unexpectedly
            if (code === null && this.monitoredPid) {
                console.log(`Restarting strace for PID ${this.monitoredPid}`);
                this.startStraceProcess();
            }
        });
    }

    // Function to stop monitoring
    stopMonitoring() {
        if (this.currentStraceProcess) {
            this.currentStraceProcess.kill();
            this.currentStraceProcess = null;
        }
        this.monitoredPid = null;
        this.clearConnections();
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
        const exists = this.connections.find(c => c.ip == ip && c.port == port);

        if (!exists) {
            const connection = {
                pid: pid,
                ip: ip,
                port: port,
                lastSeen: new Date(),
                packets: 1
            };
            this.connections.push(connection);
            console.log(`New connection: ${connection.ip}:${connection.port} (PID: ${connection.pid})`);
        } else {
            exists.lastSeen = new Date();
            exists.packets++;
        }
    }

    // Function to get all connections
    getConnections() {
        return this.connections;
    }

    // Function to clear connections
    clearConnections() {
        this.connections = [];
    }

    // Function to remove stale connections
    removeStaleConnections(timeout = 5000) {
        const now = new Date();
        this.connections = this.connections.filter(conn => {
            const age = now - conn.lastSeen;
            return age <= timeout;
        });
    }

    // Function to get the current monitored PID
    getMonitoredPid() {
        return this.monitoredPid;
    }
}

export default StraceParser;
