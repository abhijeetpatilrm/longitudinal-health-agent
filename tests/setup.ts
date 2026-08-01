// tests/setup.ts
process.env['NODE_ENV'] = 'test';
process.env['AI_PROVIDER'] = 'offline';
process.env['JWT_SECRET'] = 'test-secret';
process.env['MONGODB_URI'] = 'mongodb://localhost:27017/test-db';
process.env['RATE_LIMIT_WINDOW_MS'] = '60000';
process.env['RATE_LIMIT_MAX'] = '10000';
