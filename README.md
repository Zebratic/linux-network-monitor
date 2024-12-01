# Linux Network Connection Monitor

A real-time network connection monitoring tool for Linux systems that allows you to track and visualize network connections for specific processes. The tool provides a web interface to select and monitor processes, displaying their active network connections with live updates.

## Features

- Real-time connection monitoring
- Process grouping and filtering
- Dark mode UI
- Live updates without page refresh
- Easy-to-use web interface
- Copy IP:Port functionality

## Prerequisites

- Linux operating system
- Node.js (v14 or higher)
- npm (Node Package Manager)
- Root access (required for monitoring network connections)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/zebratic/linux-network-monitor.git
cd linux-network-monitor
```

2. Install dependencies:
```bash
npm install
```

## Configuration

The application uses a `.env` file for configuration. Create or modify the `.env` file in the project root:

```env
PORT=9000
UPDATE_INTERVAL=250
```

Configuration options:
- `PORT`: The port number for the web server (default: 9000)
- `UPDATE_INTERVAL`: Update frequency in milliseconds (default: 250)

## Running the Application

The application requires root privileges to monitor network connections. Run it using:

```bash
sudo node index.js
```

Once started:
1. Open your web browser and navigate to `http://localhost:9000` (or your configured port)
2. Use the search box to find specific processes
3. Click on a process to start monitoring its network connections
4. The connections will be displayed in real-time with details such as:
   - IP address and port
   - Process ID
   - Last seen timestamp
   - Packet count

## Usage Tips

1. **Process Selection**:
   - Processes are grouped by name
   - Each process group shows the number of instances
   - Selecting a process group monitors all instances

2. **Connection Details**:
   - Hover over connection cards to see the copy button
   - Click the copy button to copy the IP:Port combination
   - Connection information updates in real-time

3. **Search Functionality**:
   - Use the search box to filter processes by name
   - Search is case-insensitive

## Security Note

This tool requires root privileges to function properly as it needs access to system-level network information. Always be cautious when running applications with root privileges and ensure you trust the source code.

## Troubleshooting

1. **"This program must be run as root" error**:
   - Run the application with sudo
   - Ensure you have root privileges

2. **No processes showing**:
   - Verify the application is running with root privileges
   - Check if ps-list is working properly

3. **No connections showing**:
   - Ensure the selected process has active network connections
   - Verify the UPDATE_INTERVAL in .env isn't too long