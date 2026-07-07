module.exports = {
  apps: [
    {
      name: 'hanamikoji-server',
      cwd: __dirname,
      script: 'packages/server/dist/index.js',
      env: {
        NODE_ENV: 'production',
        HOST: process.env.HOST || '127.0.0.1',
        PORT: process.env.PORT || 3001,
        CORS_ORIGIN: process.env.CORS_ORIGIN || 'https://your-project.pages.dev,https://www.example.com,https://example.com'
      },
      max_memory_restart: '512M',
      instances: 1,
      autorestart: true,
      watch: false
    }
  ]
};
