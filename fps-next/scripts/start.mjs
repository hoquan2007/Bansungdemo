// Cross-platform production entrypoint: works in Windows PowerShell/cmd and Unix.
process.env.NODE_ENV = 'production';
await import('../server/index.js');
