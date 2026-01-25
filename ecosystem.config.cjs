module.exports = {
  apps: [{
    name: 'telegram-bot',
    script: 'bot/index.js',
    cwd: '/home/henry/x',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
