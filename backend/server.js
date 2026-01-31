const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const { connectDB } = require('./config/database');
const { ensureConnection: ensureRedisConnection, redisClient } = require('./config/redis');
const { bootstrapJobEmailScheduler } = require('./services/jobEmailScheduler');
const jobRoutes = require('./routes/jobRoutes');
const profileRoutes = require('./routes/profileRoutes');
const authRoutes = require('./routes/authRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// CORS middleware - allow credentials for cookies
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
  
    'http://localhost:3000',
  ];
  
  // For credentials, we must specify exact origin, not '*'
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else if (origin) {
    // Allow other origins but without credentials
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    // No origin header (e.g., Postman, curl)
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/profile', profileRoutes);

// Connect to MongoDB and start server
async function startServer() {
  const redisReady = await ensureRedisConnection();
  if (!redisReady) {
    console.warn('[Server] Continuing without Redis cache (connection failed).');
  }

  await connectDB();

  await bootstrapJobEmailScheduler();

  const server = app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    console.log('\n[Server] Shutting down...');
    server.close(() => {
      console.log('[Server] HTTP server closed');
    });

    if (redisClient?.isOpen) {
      try {
        await redisClient.quit();
        console.log('[Redis] Connection closed');
      } catch (err) {
        console.error('[Redis] Error closing connection:', err.message);
      }
    }

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});

