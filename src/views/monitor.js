const { exec } = require('child_process');

let allConnections = [];
let currentStraceProcess = null; // Variable to store the current strace process

// Function to update the connection list for the selected PID
async function monitorProcess(pid) {
    // Stop the current strace process if it exists
    if (currentStraceProcess) {
        currentStraceProcess.kill(); // Terminate the ongoing strace process
        console.log('Stopped the previous strace process.');
    }

    // Clear the connection list
    const connectionList = $('#connection-list').find('tbody')[0];
    connectionList.innerHTML = ''; // Clear existing connections
    const noConnectionRow = connectionList.insertRow();
    noConnectionRow.innerHTML = '<td colspan="3">Loading...</td>'; // Reset message

    // Start strace to monitor connections continuously
    console.log(`Starting strace for PID ${pid}`);
    currentStraceProcess = exec(`sudo strace -p ${pid} -f -e trace=network -s 1`); // Store the new strace process
    currentStraceProcess.stdout.on('data', async (data) => {
        await processStraceOutput(data);
    });

    currentStraceProcess.stderr.on('data', async (data) => {
        await processStraceOutput(data);
    });

    currentStraceProcess.on('close', (code) => {
        console.log(`Strace process exited with code ${code}`);
        currentStraceProcess = null; // Clear the reference when the process exits
        updateConnectionList(); // Update the connection list
    });
}

// Function to process strace output
async function processStraceOutput(output) {
    const connectionList = $('#connection-list').find('tbody')[0]; // Define connectionList here

    // Parse the output and extract IP and port
    const lines = output.split('\n');

    lines.forEach(line => {
        // [pid  3275]
        const pidRegex = /\[pid\s+(\d+)\]/;
        const ipRegex = /inet_addr\("(\d+\.\d+\.\d+\.\d+)"\)/;
        const portRegex = /htons\((\d+)\)/;

        // Matches
        const pidMatch = line.match(pidRegex);
        const ipMatch = line.match(ipRegex);
        const portMatch = line.match(portRegex);

        if (pidMatch && ipMatch && portMatch) {
            try {
                const exists = allConnections.find(c => c.ip === ipMatch[1] && c.port === portMatch[1]);

                if (!exists) {
                    var pid = pidMatch[1];
                    var ip = ipMatch[1];
                    var port = portMatch[1];

                    var connection = {
                        pid: pid,
                        ip: ip,
                        port: port,
                        lastSeen: new Date(),
                        packets: 1
                    };
                    allConnections.push(connection);
                    console.log(`New connection: ${connection.ip}:${connection.port} (PID: ${connection.pid})`);
                } else {
                    exists.lastSeen = new Date();
                    exists.packets++;
                }
            } catch (e) {
                console.error(`Error processing line: ${line}, ${e}`);
            }
        }
    });
}

// Function to update the connection list
function updateConnectionList() {
    const connectionList = $('#connection-list').find('tbody')[0];
    const fragment = document.createDocumentFragment(); // Create a document fragment to minimize reflows

    // Sort connections by IP address
    allConnections.sort((a, b) => a.ip.localeCompare(b.ip));

    // Clear the existing rows
    connectionList.innerHTML = '';

    // Update the connection list
    allConnections.forEach(connection => {
        const row = document.createElement('tr'); // Create a new row element
        const isStale = (new Date() - connection.lastSeen) > 5000; // Check if lastSeen is more than 5 seconds ago
        row.innerHTML = `<td class="${isStale ? 'disappeared' : ''}">${connection.ip}</td><td>${connection.port}</td><td>${connection.packets}</td>`;
        fragment.appendChild(row); // Append the row to the fragment
    });

    connectionList.appendChild(fragment); // Append the fragment to the connection list in one go
}

// Update the connection list every 500ms
setInterval(updateConnectionList, 500); 