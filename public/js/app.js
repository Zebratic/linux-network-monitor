$(document).ready(function() {
    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    const $connectionsDiv = $('#connections');
    const $processListDiv = $('#processList');
    const $searchInput = $('#search');
    const $currentProcessDiv = $('#currentProcess');
    let processes = [];
    let connectionElements = new Map();

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    function getConnectionKey(conn) {
        return `${conn.remoteAddress || conn.ip}:${conn.remotePort || conn.port}`;
    }

    function createConnectionElement(conn) {
        const ipPort = `${conn.remoteAddress || conn.ip} ${conn.remotePort || conn.port}`;
        return $(`
            <div class="connection">
                <div class="connection-header">
                    Connection Details
                    <button class="copy-button" data-value="${ipPort}">Copy</button>
                </div>
                <div class="connection-detail">
                    <span class="connection-label">IP:</span>
                    <span class="connection-value">${conn.remoteAddress || conn.ip}</span>
                </div>
                <div class="connection-detail">
                    <span class="connection-label">Port:</span>
                    <span class="connection-value">${conn.remotePort || conn.port}</span>
                </div>
                <div class="connection-detail">
                    <span class="connection-label">Process ID:</span>
                    <span class="connection-value">${conn.pid}</span>
                </div>
                <div class="connection-detail">
                    <span class="connection-label">Last Seen:</span>
                    <span class="connection-value last-seen">${formatDate(conn.lastSeen)}</span>
                </div>
                <div class="packets">
                    <span class="packet-count">${conn.packets}</span> packets
                </div>
            </div>
        `);
    }

    function updateConnectionElement($element, conn) {
        const ipPort = `${conn.remoteAddress || conn.ip} ${conn.remotePort || conn.port}`;
        $element.find('.last-seen').text(formatDate(conn.lastSeen));
        $element.find('.packet-count').text(conn.packets);
        $element.find('.copy-button').data('value', ipPort);
        $element.find('.connection-ip-port .connection-value').text(ipPort);
    }

    async function fetchProcesses() {
        try {
            const response = await $.get('/processes');
            processes = response;
            displayProcesses(processes);
        } catch (error) {
            console.error('Error fetching processes:', error);
        }
    }

    function displayProcesses(processesToShow) {
        $processListDiv.empty();
        processesToShow.forEach(proc => {
            const $processItem = $(`
                <div class="process-item">
                    <img src="/program-icon/${proc.name}" alt="${proc.name}" class="process-icon" onerror="this.src='/program-icon/default'">
                    <div class="process-info">
                        <div class="process-name">${proc.name}</div>
                        <div class="process-pids">${proc.pids.length} instance${proc.pids.length !== 1 ? 's' : ''}</div>
                    </div>
                </div>
            `);
            $processItem.on('click', () => selectProcess(proc));
            $processListDiv.append($processItem);
        });
    }

    function selectProcess(proc) {
        $currentProcessDiv.html(`
            <img src="/program-icon/${proc.name}" alt="${proc.name}" onerror="this.src='/program-icon/default'">
            <span>Monitoring: ${proc.name} (${proc.pids.length} instance${proc.pids.length !== 1 ? 's' : ''})</span>
        `);
        connectionElements.clear();
        $connectionsDiv.empty();
        ws.send(JSON.stringify({
            type: 'monitor',
            pids: proc.pids
        }));
    }

    $searchInput.on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        const filteredProcesses = processes.filter(proc => 
            proc.name.toLowerCase().includes(searchTerm)
        );
        displayProcesses(filteredProcesses);
    });

    ws.onmessage = (event) => {
        const connections = JSON.parse(event.data);
        const currentKeys = new Set();

        connections.forEach(conn => {
            const key = getConnectionKey(conn);
            currentKeys.add(key);

            if (connectionElements.has(key)) {
                updateConnectionElement(connectionElements.get(key), conn);
            } else {
                const $element = createConnectionElement(conn);
                connectionElements.set(key, $element);
                $connectionsDiv.append($element);
            }
        });

        connectionElements.forEach((element, key) => {
            if (!currentKeys.has(key)) {
                element.remove();
                connectionElements.delete(key);
            }
        });
    };

    ws.onclose = () => {
        console.log('WebSocket connection closed');
        $currentProcessDiv.text('WebSocket connection closed');
    };

    fetchProcesses();

    // Add copy functionality
    $(document).on('click', '.copy-button', function() {
        const textToCopy = $(this).data('value');
        navigator.clipboard.writeText(textToCopy).then(() => {
            let oldText = $(this).text();
            const $button = $(this);
            $button.text('Copied!');
            setTimeout(() => {
                $button.text(oldText);
            }, 1000);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    });
});