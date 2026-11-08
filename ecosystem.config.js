module.exports = {
  apps: [
    {
      name: 'greenatlas-api',
      script: 'src/app.js',
      instances: 'max',       // Scales across all available CPU cores
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};