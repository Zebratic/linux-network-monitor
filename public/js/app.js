$(document).ready(function() {
    let ws;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 1000; // Start with 1 second delay
    let selectedPids = []; // Store currently monitored PIDs
    
    const $connectionsDiv = $('#connections');
    const $processListDiv = $('#processList');
    const $searchInput = $('#search');
    const $showLocalCheckbox = $('#showLocal');
    let processes = [];
    let connectionElements = new Map();
    let allConnections = [];
    let copyFormat = "{IP}:{PORT}"; // Default copy format

    // Add keyboard navigation variables
    let currentHighlightIndex = -1;
    let visibleProcesses = [];

    // Add settings functionality
    let updateInterval = 1000; // Default value, will be updated from server
    let connectionTimeout = 5; // Default value in seconds, will be updated from server

    // Add variable to store selected process name
    let selectedProcessName = null;

    function formatRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 3) {
            return 'Now';
        }
        if (diffInSeconds < 60) {
            return `${diffInSeconds} seconds ago`;
        }
        if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        }
        if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} day${days > 1 ? 's' : ''} ago`;
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
        const now = new Date();
        const lastSeen = new Date(conn.lastSeen);
        const timeSinceLastSeen = (now - lastSeen) / 1000;
        const timeoutPercentage = (timeSinceLastSeen / connectionTimeout) * 100;
        
        const $element = $(`
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
                <div class="table-cell time-cell" data-timestamp="${conn.lastSeen}">
                    ${formatRelativeTime(conn.lastSeen)}
                </div>
                <div class="table-cell packets-cell">
                    <span class="packet-count">${conn.packets}</span> packets
                </div>
                <div class="table-cell actions-cell">
                    <button class="copy-button" title="Copy: ${copyFormat}">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>
        `);
        
        // Set initial color based on time since last seen
        const intensity = Math.min(timeoutPercentage * 0.2, 20); // Max 20% red tint
        if (intensity > 0) {
            $element.css('background-color', `rgba(255, 0, 0, ${intensity / 100})`);
        }

        // Add click handler for copy button
        $element.find('.copy-button').on('click', function() {
            const textToCopy = copyFormat
                .replace(/{IP}/g, conn.remoteAddress || conn.ip)
                .replace(/{PORT}/g, conn.remotePort || conn.port)
                .replace(/{PID}/g, conn.pid)
                .replace(/{PROGRAM}/g, selectedProcessName || '');

            navigator.clipboard.writeText(textToCopy).then(() => {
                // Show success feedback with the copied text
                const $button = $(this);
                const $icon = $button.find('i');
                $button.attr('title', `Copied: ${textToCopy}`);
                $icon.removeClass('fa-copy').addClass('fa-check');
                
                setTimeout(() => {
                    $icon.removeClass('fa-check').addClass('fa-copy');
                    $button.attr('title', `Copy: ${copyFormat}`);
                }, 1000);
            }).catch(() => {
                // Show error feedback
                const $button = $(this);
                const $icon = $button.find('i');
                $button.attr('title', 'Failed to copy');
                $icon.removeClass('fa-copy').addClass('fa-times');
                
                setTimeout(() => {
                    $icon.removeClass('fa-times').addClass('fa-copy');
                    $button.attr('title', `Copy: ${copyFormat}`);
                }, 1000);
            });
        });
        
        return $element;
    }

    function formatCopyText(conn) {
        return copyFormat
            .replace(/{IP}/g, conn.remoteAddress || conn.ip)
            .replace(/{PORT}/g, conn.remotePort || conn.port)
            .replace(/{PID}/g, conn.pid)
            .replace(/{PROGRAM}/g, selectedProcessName || '');
    }

    function updateConnectionElement($element, conn) {
        // Only update the dynamic fields
        const now = new Date();
        const lastSeen = new Date(conn.lastSeen);
        const timeSinceLastSeen = (now - lastSeen) / 1000; // Convert to seconds
        const timeoutPercentage = (timeSinceLastSeen / connectionTimeout) * 100;
        
        // Update the time cell
        $element.find('.time-cell')
            .attr('data-timestamp', conn.lastSeen)
            .text(formatRelativeTime(conn.lastSeen));
        
        // Update packets count
        $element.find('.packet-count').text(conn.packets);
        
        // Update the row color based on time since last seen
        const intensity = Math.min(timeoutPercentage * 0.2, 20); // Max 20% red tint
        if (intensity > 0) {
            $element.css('background-color', `rgba(255, 0, 0, ${intensity / 100})`);
        } else {
            $element.css('background-color', '');
        }
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
        selectedProcessName = proc.name;  // Store the selected process name
        // Save to localStorage
        localStorage.setItem('selectedProcessName', proc.name);
        
        $processListDiv.find('.process-item').removeClass('selected');
        $processListDiv.find(`.process-item[data-name="${proc.name}"]`).addClass('selected');
        
        // Update process icon in search bar
        $('.selected-process-icon').attr({
            src: `/program-icon/${proc.name}`,
            alt: proc.name,
            onerror: "this.src='/program-icon/default'"
        });
        
        // Update search input with process name
        $searchInput.val(proc.name);
        
        // Update process info
        updateProcessInfo(proc);
        
        // Clear and prepare connections display
        connectionElements.clear();
        $connectionsDiv.empty();
        
        // Store selected PIDs
        selectedPids = proc.pids;
        
        // Start monitoring
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'monitor',
                pids: selectedPids
            }));
        }
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

    function connectWebSocket() {
        ws = new WebSocket(`ws://${window.location.host}/ws`);

        ws.onopen = () => {
            console.log('WebSocket connected');
            reconnectAttempts = 0;
            $connectionsDiv.find('.no-connections').remove();
            
            // Fetch processes when connected
            fetchProcesses().then(() => {
                // After processes are fetched, restore the selected process if any
                const savedProcessName = localStorage.getItem('selectedProcessName');
                if (savedProcessName) {
                    const proc = processes.find(p => p.name === savedProcessName);
                    if (proc) {
                        selectProcess(proc);
                    } else {
                        // If the process no longer exists, clear the saved selection
                        localStorage.removeItem('selectedProcessName');
                    }
                }
            });
        };

        ws.onmessage = (event) => {
            allConnections = JSON.parse(event.data);
            updateConnectionsDisplay();
        };

        ws.onclose = () => {
            console.log('WebSocket connection closed');
            
            // Show disconnected message but keep the process info visible
            $connectionsDiv.html('<div class="no-connections">Connection lost. Attempting to reconnect...</div>');
            
            // Attempt to reconnect
            if (reconnectAttempts < maxReconnectAttempts) {
                const delay = reconnectDelay * Math.pow(2, reconnectAttempts);
                console.log(`Reconnecting in ${delay}ms... (Attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
                
                setTimeout(() => {
                    reconnectAttempts++;
                    connectWebSocket();
                }, delay);
            } else {
                $connectionsDiv.html('<div class="no-connections">Connection failed. Please refresh the page to try again.</div>');
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    // Remove the duplicate click handler and merge it with the existing selectProcess function
    $(document).on('click', '.process-item', function() {
        const processName = $(this).data('name');
        const proc = processes.find(p => p.name === processName);
        if (proc) {
            selectProcess(proc);
            // Close the process list
            $('#processes').removeClass('expanded');
            $searchInput.blur();
            // Update search input
            $searchInput.val(processName);
        }
    });

    // Initial connection
    connectWebSocket();

    // Add copy functionality
    $(document).on('click', '.copy-button', function() {
        const conn = JSON.parse($(this).data('connection'));
        const textToCopy = formatCopyText(conn);
        navigator.clipboard.writeText(textToCopy).then(() => {
            // Show a brief success indicator
            const $button = $(this);
            $button.find('i').removeClass('fa-copy').addClass('fa-check');
            setTimeout(() => {
                $button.find('i').removeClass('fa-check').addClass('fa-copy');
            }, 1000);
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

    // Add this to your initialization code
    $(document).ready(function() {
        // ... your existing init code ...
        updateSelectedProcessDisplay(null); // Initialize with no selection
        $('.selected-process-icon').on('error', function() {
            $(this).attr('src', '/program-icon/default');
        });
        
        // Fetch processes and restore selected process
        fetchProcesses().then(() => {
            // After processes are fetched, try to restore the selected process
            const savedProcessName = localStorage.getItem('selectedProcessName');
            if (savedProcessName) {
                const proc = processes.find(p => p.name === savedProcessName);
                if (proc) {
                    selectProcess(proc);
                }
            }
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

    // Settings modal handlers
    $('.settings-button').on('click', function() {
        $('#settings-modal').addClass('show');
        $('#updateInterval').val(updateInterval);
    });

    // Close modal when clicking backdrop or close button
    $('.close-modal, .modal').on('click', function(e) {
        if (e.target === this || $(this).hasClass('close-modal') || $(this).closest('.close-modal').length) {
            $('#settings-modal').removeClass('show');
        }
    });

    // Prevent modal content clicks from closing the modal
    $('.modal-content').on('click', function(e) {
        if (!$(e.target).hasClass('close-modal') && !$(e.target).closest('.close-modal').length) {
            e.stopPropagation();
        }
    });

    // Handle update interval changes
    $('.apply-interval').on('click', function() {
        const newInterval = parseInt($('#updateInterval').val());
        if (newInterval >= 100 && newInterval <= 10000) {
            updateInterval = newInterval;
            ws.send(JSON.stringify({
                type: 'updateInterval',
                interval: newInterval
            }));
            // Show success feedback
            const $button = $(this);
            const oldText = $button.text();
            $button.text('Applied!');
            setTimeout(() => {
                $button.text(oldText);
            }, 1000);
        }
    });

    // Handle connection timeout changes
    $('.apply-timeout').on('click', function() {
        const newTimeout = parseInt($('#connectionTimeout').val());
        if (newTimeout >= 1 && newTimeout <= 3600) {
            connectionTimeout = newTimeout;
            ws.send(JSON.stringify({
                type: 'connectionTimeout',
                timeout: newTimeout
            }));
            // Show success feedback
            const $button = $(this);
            const oldText = $button.text();
            $button.text('Applied!');
            setTimeout(() => {
                $button.text(oldText);
            }, 1000);
        }
    });

    // Get initial settings from server
    fetch('/settings')
        .then(response => response.json())
        .then(settings => {
            updateInterval = settings.updateInterval;
            connectionTimeout = settings.connectionTimeout;
            copyFormat = settings.copyFormat || "{IP}:{PORT}";
            $('#updateInterval').val(updateInterval);
            $('#connectionTimeout').val(connectionTimeout);
            $('#copyFormat').val(copyFormat);
        })
        .catch(error => console.error('Error fetching settings:', error));

    // Add settings handlers
    $('.apply-format').click(function() {
        const newFormat = $('#copyFormat').val().trim();
        if (newFormat) {
            copyFormat = newFormat;
            
            // Save to server
            fetch('/settings/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ copyFormat: copyFormat })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Show success indicator
                    const $button = $(this);
                    $button.text('✓');
                    setTimeout(() => {
                        $button.text('Apply');
                    }, 1000);
                } else {
                    alert('Failed to save copy format');
                }
            })
            .catch(() => {
                alert('Failed to save copy format');
            });
        }
    });

    // Add a timer to update relative times
    setInterval(() => {
        $('.time-cell').each(function() {
            const timestamp = $(this).attr('data-timestamp');
            if (timestamp) {
                $(this).text(formatRelativeTime(timestamp));
            }
        });
    }, 1000);
});