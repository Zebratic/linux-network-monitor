#!/bin/bash

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root"
    exit 1
fi

# Function to detect init system
detect_init_system() {
    if pidof systemd >/dev/null 2>&1; then
        echo "systemd"
    elif [ -f /etc/init.d ]; then
        echo "initd"
    elif [ -f /etc/openrc ]; then
        echo "openrc"
    else
        echo "unknown"
    fi
}

# Check for required commands
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required but not installed. Aborting." >&2; exit 1; }
command -v strace >/dev/null 2>&1 || { echo "strace is required but not installed. Aborting." >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git is required but not installed. Aborting." >&2; exit 1; }

# Installation directory
INSTALL_DIR="/opt/linux-network-monitor"
REPO_URL="https://github.com/zebratic/linux-network-monitor.git"

# Create installation directory
echo "Creating installation directory..."
mkdir -p "$INSTALL_DIR"

# Clone repository if not already present
if [ ! -d "$INSTALL_DIR/.git" ]; then
    echo "Cloning repository..."
    rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
else
    echo "Repository already exists, updating..."
    cd "$INSTALL_DIR"
    git pull
fi

# Change to installation directory
cd "$INSTALL_DIR"

# Install dependencies
echo "Installing dependencies..."
npm install --production

# Set permissions
echo "Setting permissions..."
chown -R root:root "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"

# Detect init system
INIT_SYSTEM=$(detect_init_system)
echo "Detected init system: $INIT_SYSTEM"

case $INIT_SYSTEM in
    "systemd")
        echo "Installing systemd service..."
        cp linux-network-monitor.service /etc/systemd/system/
        systemctl daemon-reload
        systemctl enable linux-network-monitor.service
        systemctl start linux-network-monitor.service
        echo "Service status:"
        systemctl status linux-network-monitor.service
        ;;
    "initd")
        echo "Installing init.d service..."
        cp linux-network-monitor.sh /etc/init.d/linux-network-monitor
        chmod +x /etc/init.d/linux-network-monitor
        update-rc.d linux-network-monitor defaults
        service linux-network-monitor start
        echo "Service status:"
        service linux-network-monitor status
        ;;
    "openrc")
        echo "Installing OpenRC service..."
        cp linux-network-monitor.openrc /etc/init.d/linux-network-monitor
        chmod +x /etc/init.d/linux-network-monitor
        rc-update add linux-network-monitor default
        rc-service linux-network-monitor start
        echo "Service status:"
        rc-service linux-network-monitor status
        ;;
    *)
        echo "Warning: Unknown init system. Service not installed automatically."
        echo "Please manually configure the service for your system."
        echo "The application is installed in $INSTALL_DIR"
        echo "You can start it manually with: node $INSTALL_DIR/index.js"
        ;;
esac

echo ""
echo "Installation complete!"
echo "The service should be running on http://localhost:9000"
echo ""
echo "Configuration file location:"
echo "  $INSTALL_DIR/config.json"
echo ""
case $INIT_SYSTEM in
    "systemd")
        echo "You can manage the service with:"
        echo "  systemctl start linux-network-monitor"
        echo "  systemctl stop linux-network-monitor"
        echo "  systemctl restart linux-network-monitor"
        echo "  systemctl status linux-network-monitor"
        echo ""
        echo "View logs with:"
        echo "  journalctl -u linux-network-monitor -f"
        ;;
    "initd")
        echo "You can manage the service with:"
        echo "  service linux-network-monitor start"
        echo "  service linux-network-monitor stop"
        echo "  service linux-network-monitor restart"
        echo "  service linux-network-monitor status"
        ;;
    "openrc")
        echo "You can manage the service with:"
        echo "  rc-service linux-network-monitor start"
        echo "  rc-service linux-network-monitor stop"
        echo "  rc-service linux-network-monitor restart"
        echo "  rc-service linux-network-monitor status"
        ;;
esac 