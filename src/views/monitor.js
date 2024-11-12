const { exec } = require('child_process');

let allConnections = [];
let currentStraceProcess = null; // Variable to store the current strace process
let localRanges = ['192.168.', '10.0.0.', '172.16.0.', '127.0.0.1'];


// Function to update the connection list for the selected PID
async function monitorProcess(pid) {
    // Stop the current strace process if it exists
    selectedPID = pid;

    if (currentStraceProcess) {
        currentStraceProcess.kill(); // Terminate the ongoing strace process
        console.log('Stopped the previous strace process.');
        currentStraceProcess = null; // Clear the reference to prevent restart
    }

    // Clear the connection list
    const connectionList = $('#connection-list').find('tbody')[0];
    connectionList.innerHTML = ''; // Clear existing connections
    const noConnectionRow = connectionList.insertRow();
    noConnectionRow.innerHTML = '<td colspan="3">Loading...</td>'; // Reset message

    // Function to start strace
    const startStrace = () => {
        console.log(`Starting strace for PID ${pid} | Command: sudo strace -p ${pid} -f -e trace=network -s 1`);
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
            // Do not restart the strace process if it was stopped manually
        });
    };

    // Start the strace process
    startStrace();
}


async function pingTCP(ip, port) {
    return new Promise((resolve, reject) => {
        console.log(`TCP pinging ${ip}:${port}`);
        exec(`paping ${ip} -p ${port} -t 1`, (error, stdout, stderr) => {
            console.log(`TCP ping result: ${stdout}`);
            resolve(stdout);
        });
    });
}

async function pingICMP(ip) {
    return new Promise((resolve, reject) => {
        console.log(`ICMP pinging ${ip}`);
        exec(`ping -c 1 ${ip}`, (error, stdout, stderr) => {
            console.log(`ICMP ping result: ${stdout}`);
            resolve(stdout);
        });
    });
}


// Function to ping an IP address and return the result
async function pingIP(ip, port) {
    // first try TCP, if fails, try ICMP
    console.log(`Pinging ${ip}:${port}`);
    let ping = await pingTCP(ip, port);
    if (ping == 'N/A') {
        ping = await pingICMP(ip);
    }
    return ping;
}

// Function to process strace output
async function processStraceOutput(output) {
    try {
        const lines = output.split('\n');

        for (const line of lines) {
            const pidRegex = /\[pid\s+(\d+)\]/;
            const ipRegex = /inet_addr\("(\d+\.\d+\.\d+\.\d+)"\)/;
            const portRegex = /htons\((\d+)\)/;

            const pidMatch = line.match(pidRegex);
            const ipMatch = line.match(ipRegex);
            const portMatch = line.match(portRegex);

            if (pidMatch && ipMatch && portMatch) {
                const ip = ipMatch[1];
                const port = portMatch[1];

                const exists = allConnections.find(c => c.ip === ip && c.port === port);

                if (!exists) {
                    var connection = {
                        pid: selectedPID,
                        ip: ip,
                        port: port,
                        lastSeen: new Date(),
                        packets: 1,
                        ping: 'N/A',
                    };
                    allConnections.push(connection);
                    console.log(`New connection: ${connection.ip}:${connection.port} (PID: ${connection.pid})`);
                } else {
                    exists.lastSeen = new Date();
                    exists.packets++;
                }
            }
        }
    } catch (e) {
        console.error(`Error processing strace output: ${e}`);
    }
}

// Function to update the connection list for the selected PID
function updateConnectionListForPID(pid) {
    const connectionList = $('#connection-list').find('tbody')[0];
    const fragment = document.createDocumentFragment(); // Create a document fragment to minimize reflows

    // Get the checkbox state
    const hideLocalIps = document.getElementById('hide-local-ips').checked;

    // Clear the existing rows
    connectionList.innerHTML = '';

    // Update the connection list for the selected PID
    allConnections.forEach(connection => {
        // Check if the connection belongs to the selected PID
        if (connection.pid != pid) {
            return; // Skip connections not belonging to the selected PID
        }

        // Check if the IP is local and should be hidden
        if (hideLocalIps && localRanges.some(range => connection.ip.startsWith(range))) {
            return; // Skip local IPs
        }

        const row = document.createElement('tr'); // Create a new row element
        const isStale = (new Date() - connection.lastSeen) > 5000; // Check if lastSeen is more than 5 seconds ago
        row.innerHTML = `<td class="${isStale ? 'disappeared' : ''}">${connection.ip}</td><td>${connection.port}</td><td>${connection.packets}</td>`;
        fragment.appendChild(row); // Append the row to the fragment
    });

    connectionList.appendChild(fragment); // Append the fragment to the connection list in one go
}





// loop to update the connection list for the selected PID
setInterval(() => {
    updateConnectionListForPID(selectedPID);
}, 250);


// if hide-local-ips is checked, hide the local IPs
function updateConnectionList() {
    updateConnectionListForPID(selectedPID);
}




// seperate thread to update the ping of each connection, first try TCP ping, then ICMP ping
/*
setTimeout(() => {
    while (true) {
        // get displayed connections only
        const displayedConnections = $('#connection-list').find('tbody')[0].querySelectorAll('tr');
        const displayedConnectionsArray = Array.from(displayedConnections);

        displayedConnectionsArray.forEach(async connection => {
            const ip = connection.querySelector('td:nth-child(1)').textContent;
            const port = connection.querySelector('td:nth-child(2)').textContent;
            let ping = await pingIP(ip, port);
            console.log(JSON.stringify(ping));
            connection.ping = ping;
            console.log(`Ping for ${ip}:${port} is ${ping}`);
        });
    }
}, 1000);
*/