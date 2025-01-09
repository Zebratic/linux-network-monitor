$(document).ready(function() {
    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    const $connectionsDiv = $('#connections');
    const $processListDiv = $('#processList');
    const $searchInput = $('#search');
    const $showLocalCheckbox = $('#showLocal');
    let processes = [];
    let connectionElements = new Map();
    let allConnections = [];

    // Add keyboard navigation variables
    let currentHighlightIndex = -1;
    let visibleProcesses = [];

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    function getConnectionKey(conn) {
        return `${conn.remoteAddress || conn.ip}:${conn.remotePort || conn.port}`;
    }

    function createConnectionsTable() {
        return $(`
            <div class="connections-table">
                <div class="table-header">
                    <div class="header-cell">Remote IP</div>
                    <div class="header-cell">Port</div>
                    <div class="header-cell">PID</div>
                    <div class="header-cell">Last Seen</div>
                    <div class="header-cell">Packets</div>
                    <div class="header-cell"></div>
                </div>
                <div class="table-body"></div>
            </div>
        `);
    }

    function createConnectionElement(conn) {
        const ipPort = `${conn.remoteAddress || conn.ip} ${conn.remotePort || conn.port}`;
        return $(`
            <div class="table-row" data-key="${getConnectionKey(conn)}">
                <div class="table-cell ip-cell selectable">
                    ${conn.remoteAddress || conn.ip}
                </div>
                <div class="table-cell port-cell selectable">
                    ${conn.remotePort || conn.port}
                </div>
                <div class="table-cell pid-cell selectable">
                    ${conn.pid}
                </div>
                <div class="table-cell time-cell">
                    ${formatDate(conn.lastSeen)}
                </div>
                <div class="table-cell packets-cell">
                    <span class="packet-count">${conn.packets}</span> packets
                </div>
                <div class="table-cell actions-cell">
                    <button class="copy-button" data-value="${ipPort}" title="Copy IP:Port">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>
        `);
    }

    function updateConnectionElement($element, conn) {
        // Only update the dynamic fields
        $element.find('.time-cell').text(formatDate(conn.lastSeen));
        $element.find('.packet-count').text(conn.packets);
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
        visibleProcesses = processesToShow.sort((a, b) => a.name.localeCompare(b.name));
        currentHighlightIndex = -1;
        
        visibleProcesses.forEach((proc, index) => {
            const $processItem = $(`
                <div class="process-item" data-name="${proc.name}" data-index="${index}">
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

    function formatMemory(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    function updateProcessInfo(proc) {
        const $processInfo = $('#processInfo');
        
        // Update process icon
        $processInfo.find('.process-icon-large').attr({
            src: `/program-icon/${proc.name}`,
            alt: proc.name,
            onerror: "this.src='/program-icon/default'"
        });

        // Update process name and status
        $processInfo.find('.process-name').text(proc.name);
        $processInfo.find('.process-status').text(
            `${proc.pids.length} running instance${proc.pids.length !== 1 ? 's' : ''}`
        );

        // Update PIDs
        const pidsHtml = proc.pids.map(pid => 
            `<span class="pid-tag">${pid}</span>`
        ).join('');
        $processInfo.find('.pids-list').html(pidsHtml);

        // Update other info
        $processInfo.find('.user-name').text(proc.user);
        $processInfo.find('.command-line').text(proc.cmd || 'Unknown');
        $processInfo.find('.memory-usage').text(formatMemory(proc.memory));

        // Show the info box
        $processInfo.show();
    }

    function selectProcess(proc) {
        $processListDiv.find('.process-item').removeClass('selected');
        $processListDiv.find(`.process-item[data-name="${proc.name}"]`).addClass('selected');
        
        // Update process icon in search bar
        $('.selected-process-icon').attr({
            src: `/program-icon/${proc.name}`,
            alt: proc.name,
            onerror: "this.src='/program-icon/default'"
        });
        
        // Update process info
        updateProcessInfo(proc);
        
        // Clear and prepare connections display
        connectionElements.clear();
        $connectionsDiv.empty();
        
        // Start monitoring
        ws.send(JSON.stringify({
            type: 'monitor',
            pids: proc.pids
        }));
    }

    function highlightProcess(index) {
        if (index < 0 || index >= visibleProcesses.length) return;
        
        $('.process-item').removeClass('highlighted');
        $(`.process-item[data-index="${index}"]`).addClass('highlighted');
        
        // Ensure the highlighted item is visible
        const $highlighted = $(`.process-item[data-index="${index}"]`);
        if ($highlighted.length) {
            const container = $processListDiv[0];
            const item = $highlighted[0];
            
            const containerHeight = container.clientHeight;
            const itemTop = item.offsetTop;
            const itemHeight = item.clientHeight;
            
            if (itemTop < container.scrollTop) {
                container.scrollTop = itemTop;
            } else if (itemTop + itemHeight > container.scrollTop + containerHeight) {
                container.scrollTop = itemTop + itemHeight - containerHeight;
            }
        }
    }

    // Add keyboard event handlers
    $searchInput.on('keydown', function(e) {
        const key = e.key;
        
        switch (key) {
            case 'ArrowDown':
                e.preventDefault();
                if (currentHighlightIndex < visibleProcesses.length - 1) {
                    currentHighlightIndex++;
                    highlightProcess(currentHighlightIndex);
                }
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                if (currentHighlightIndex > 0) {
                    currentHighlightIndex--;
                    highlightProcess(currentHighlightIndex);
                }
                break;
                
            case 'Enter':
                e.preventDefault();
                if (currentHighlightIndex >= 0 && currentHighlightIndex < visibleProcesses.length) {
                    const selectedProcess = visibleProcesses[currentHighlightIndex];
                    selectProcess(selectedProcess);
                    // Close the process list
                    $('#processes').removeClass('expanded');
                    $(this).blur();
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                $('#processes').removeClass('expanded');
                $(this).blur();
                break;
        }
    });

    $searchInput.on('focus', function() {
        $('#processes').addClass('expanded');
    });

    // Handle clicking outside to close
    $(document).on('click', function(e) {
        if (!$(e.target).closest('#processes').length) {
            $('#processes').removeClass('expanded');
        }
    });

    // Prevent process list from closing when clicking inside it
    $('#processes').on('click', function(e) {
        e.stopPropagation();
    });

    // Update search input handler
    $searchInput.on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        const filteredProcesses = processes.filter(proc => 
            proc.name.toLowerCase().includes(searchTerm) || 
            proc.pids.some(pid => pid.toString().includes(searchTerm))
        );
        displayProcesses(filteredProcesses);
        
        // Reset highlight on search
        currentHighlightIndex = filteredProcesses.length > 0 ? 0 : -1;
        highlightProcess(currentHighlightIndex);
    });

    function isLocalAddress(ip) {
        return ip.startsWith('127.') || 
               ip.startsWith('10.') || 
               ip.startsWith('192.168.') ||
               ip.startsWith('169.254.') ||
               ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31;
    }

    function updateConnectionsDisplay() {
        const filteredConnections = $showLocalCheckbox.prop('checked') 
            ? allConnections 
            : allConnections.filter(conn => !isLocalAddress(conn.remoteAddress || conn.ip));

        const currentProcessName = $processListDiv.find('.process-item.selected').data('name');
        
        // Create table if it doesn't exist
        if ($connectionsDiv.find('.connections-table').length === 0) {
            $connectionsDiv.empty().append(createConnectionsTable());
        }
        
        const $tableBody = $connectionsDiv.find('.table-body');
        
        if (filteredConnections.length === 0) {
            $connectionsDiv.html(`<div class="no-connections">No Active Connections for ${currentProcessName}</div>`);
            return;
        }

        // Create a map of existing connections
        const existingConnections = new Map();
        $tableBody.find('.table-row').each(function() {
            existingConnections.set($(this).data('key'), $(this));
        });

        // Process each connection
        filteredConnections.forEach(conn => {
            const key = getConnectionKey(conn);
            const $existing = existingConnections.get(key);

            if ($existing) {
                // Update existing connection
                updateConnectionElement($existing, conn);
                existingConnections.delete(key);
            } else {
                // Add new connection
                const $element = createConnectionElement(conn);
                $tableBody.append($element);
            }
        });

        // Remove connections that no longer exist
        existingConnections.forEach($element => {
            $element.remove();
        });
    }

    $showLocalCheckbox.on('change', updateConnectionsDisplay);

    ws.onmessage = (event) => {
        allConnections = JSON.parse(event.data);
        updateConnectionsDisplay();
    };

    ws.onclose = () => {
        console.log('WebSocket connection closed');
        $('#processInfo').hide();
        $processListDiv.empty();
        processes = [];
        displayProcesses(processes);
        $connectionsDiv.html('<div class="no-connections">WebSocket connection closed</div>');
    };

    fetchProcesses();

    // Add copy functionality
    $(document).on('click', '.copy-button', function() {
        const textToCopy = $(this).data('value');
        navigator.clipboard.writeText(textToCopy).then(() => {
            let oldContent = $(this).html();
            const $button = $(this);
            $button.html('<i class="fas fa-check"></i>');
            setTimeout(() => {
                $button.html(oldContent);
            }, 1000);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    });

    function updateSelectedProcessDisplay(process) {
        const display = $('.selected-process-display');
        if (process) {
            const icon = process.icon ? `<img src="${process.icon}" alt="${process.name}">` : '';
            display.html(`${icon}<span>${process.name}</span>`);
            display.css('color', 'var(--text-primary)');
        } else {
            display.html('<span>No process selected</span>');
        }
    }

    // Update your existing process click handler
    $(document).on('click', '.process-item', function() {
        $('.process-item').removeClass('selected');
        $(this).addClass('selected');
        
        const processId = $(this).data('id');
        const processName = $(this).find('.process-name').text();
        const processIcon = $(this).find('.process-icon').attr('src');

        // autocompleted search
        $searchInput.val(processName);
        
        updateSelectedProcessDisplay({
            name: processName,
            icon: processIcon
        });
    });

    // Add this to your initialization code
    $(document).ready(function() {
        // ... your existing init code ...
        updateSelectedProcessDisplay(null); // Initialize with no selection
        $('.selected-process-icon').on('error', function() {
            $(this).attr('src', '/program-icon/default');
        });
    });

    // Add keypress handler for automatic search focus
    $(document).on('keypress', function(e) {
        // Ignore if we're in an input field or if we pressed a special key
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }
        
        // Only handle alphanumeric keys and common symbols
        if (e.key.length === 1 && /[\w\s-_.]/.test(e.key)) {
            $searchInput.focus().val(e.key);
            $('#processes').addClass('expanded');
            
            // Trigger the search
            const searchTerm = e.key.toLowerCase();
            const filteredProcesses = processes.filter(proc => 
                proc.name.toLowerCase().includes(searchTerm) || 
                proc.pids.some(pid => pid.toString().includes(searchTerm))
            );
            displayProcesses(filteredProcesses);
            
            // Reset highlight on search
            currentHighlightIndex = filteredProcesses.length > 0 ? 0 : -1;
            highlightProcess(currentHighlightIndex);
        }
    });
});