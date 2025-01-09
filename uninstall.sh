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

# Installation directory
INSTALL_DIR="/opt/linux-network-monitor"

# Detect init system
INIT_SYSTEM=$(detect_init_system)
echo "Detected init system: $INIT_SYSTEM"

# Stop and remove service based on init system
case $INIT_SYSTEM in
    "systemd")
        echo "Stopping systemd service..."
        systemctl stop linux-network-monitor.service
        echo "Disabling systemd service..."
        systemctl disable linux-network-monitor.service
        echo "Removing systemd service..."
        rm -f /etc/systemd/system/linux-network-monitor.service
        systemctl daemon-reload
        ;;
    "initd")
        echo "Stopping init.d service..."
        service linux-network-monitor stop
        echo "Removing init.d service..."
        update-rc.d -f linux-network-monitor remove
        rm -f /etc/init.d/linux-network-monitor
        ;;
    "openrc")
        echo "Stopping OpenRC service..."
        rc-service linux-network-monitor stop
        echo "Removing OpenRC service..."
        rc-update del linux-network-monitor default
        rm -f /etc/init.d/linux-network-monitor
        ;;
    *)
        echo "Warning: Unknown init system. No service configuration removed."
        ;;
esac

echo "Removing installation directory..."
rm -rf "$INSTALL_DIR"

echo ""
echo "Uninstallation complete!"
echo "The Linux Network Monitor has been removed from your system." 