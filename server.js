
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "frame-ancestors": ["'none'"], // Replaces X-Frame-Options
            "connect-src": ["'self'", "http://localhost:3001"],
        },
    },
    xssFilter: false, // Disables x-xss-protection as requested
}));

app.use(cors());
app.use(express.json());

// Content-Type & Cache Middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
});

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PROXY_AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN || '';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 60);
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const requestBuckets = new Map();

if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY is empty. Proxy requests will fail until it is configured.');
}

if (!PROXY_AUTH_TOKEN) {
    console.warn('PROXY_AUTH_TOKEN is empty. /api/proxy will return 503 until it is configured.');
}

const getClientIdentifier = (req) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
};

const authMiddleware = (req, res, next) => {
    if (!PROXY_AUTH_TOKEN) {
        return res.status(503).json({ error: 'Proxy auth token is not configured' });
    }

    const authorization = req.headers.authorization;
    const bearerToken = typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7).trim()
        : '';
    const headerToken = req.headers['x-proxy-token'];
    const providedToken = bearerToken || (typeof headerToken === 'string' ? headerToken.trim() : '');

    if (!providedToken || providedToken !== PROXY_AUTH_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

const rateLimitMiddleware = (req, res, next) => {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    const clientId = getClientIdentifier(req);
    const history = requestBuckets.get(clientId) || [];
    const recent = history.filter((ts) => ts > windowStart);

    if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
        const oldest = recent[0];
        const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
        res.setHeader('X-RateLimit-Remaining', '0');
        return res.status(429).json({ error: 'Too many requests' });
    }

    recent.push(now);
    requestBuckets.set(clientId, recent);
    res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_MAX_REQUESTS - recent.length)));
    next();
};

setInterval(() => {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    for (const [clientId, history] of requestBuckets.entries()) {
        const recent = history.filter((ts) => ts > windowStart);
        if (recent.length === 0) {
            requestBuckets.delete(clientId);
        } else {
            requestBuckets.set(clientId, recent);
        }
    }
}, RATE_LIMIT_WINDOW_MS).unref();

app.post('/api/proxy', authMiddleware, rateLimitMiddleware, async (req, res) => {
    try {
        const { model, contents, config } = req.body;

        if (!model || !contents) {
            return res.status(400).json({ error: 'Missing model or contents' });
        }

        const response = await genAI.models.generateContent({
            model,
            contents,
            ...(config ? { config } : {}),
        });

        // Attempt to extract text if available
        let text = '';
        try {
            text = typeof response.text === 'function' ? response.text() : (response.text || '');
        } catch (e) { }

        res.json({
            text,
            candidates: response.candidates
        });
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown proxy error' });
    }
});

app.listen(PORT, () => {
    console.log(`Gemini Proxy Server running on http://localhost:${PORT}`);
});
