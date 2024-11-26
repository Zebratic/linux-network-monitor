const { exec } = require('child_process');


function getProcesses() {
    let processes = [];

    exec('sudo lsof -nP -i', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing lsof: ${error.message}`);
            return;
        }
        if (stderr) {
            console.warn(`Warnings: ${stderr}`);
        }

        // Process the output
        const lines = stdout.trim().split('\n');
        const processMap = {};

        lines.slice(1).forEach(line => {
            const columns = line.split(/\s+/);
            const command = columns[0];
            const pid = columns[1];
            const user = columns[2];

            // If the command already exists in the map, add the PID to its list
            if (!processMap[command]) {
                processMap[command] = {
                    command: command,
                    pids: [pid],
                    user: user,
                };
            } else {
                if (!processMap[command].pids.includes(pid)) {
                    processMap[command].pids.push(pid);
                }
            }
        });
    
        // Convert the processMap to an array for easier logging
        processes = Object.values(processMap);
        console.log('Active processes:', processes);
        return processes;
    });
}

module.exports = {
    getProcesses
};