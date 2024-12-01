module.exports = {
    apps: [{
      name: 'linux-network-monitor',
      script: './index.js',
      node_args: '',
      instances: 1,
      autorestart: true,
      watch: true,
      ignore_watch: [],
      max_memory_restart: '1G',
    }],
  };
  