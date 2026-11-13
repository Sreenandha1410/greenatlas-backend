require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./config/db');

const app = express();

// Disable Express fingerprint header
app.disable('x-powered-by');

// Behind reverse proxy (Nginx / Cloudflare) to extract the real client IP
app.set('trust proxy', 1);

// Security HTTP headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const allowedOrigins = [
  'https://sonagreenatlas.in',
  'https://www.sonagreenatlas.in',
  'https://sona-greenatlas.vercel.app',
  'http://localhost:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    const frontendUrl = process.env.FRONTEND_URL;
    if (
      !origin ||
      origin.endsWith('.vercel.app') ||              // <-- Allows ALL Vercel preview & main deploys
      allowedOrigins.includes(origin) ||            // <-- Allows your custom domains & localhost
      (frontendUrl && origin === frontendUrl)
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check (Exempt from rate limiting for monitoring tools & uptime checks)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Green Atlas backend is running'
  });
});

// Global API Rate Limiting: 300 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api', globalLimiter);

// Routes
app.use('/api/trees',   require('./routes/trees'));
app.use('/api/species', require('./routes/species'));
app.use('/api/areas',   require('./routes/areas'));
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/complaints', require('./routes/complaints'));

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });
