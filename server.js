
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
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY || '');

app.post('/api/proxy', async (req, res) => {
    try {
        const { model, contents, config } = req.body;

        if (!model || !contents) {
            return res.status(400).json({ error: 'Missing model or contents' });
        }

        const aiModel = genAI.getGenerativeModel({ model });
        const result = await aiModel.generateContent(config ? { contents, ...config } : contents);
        const response = await result.response;

        // Attempt to extract text if available
        let text = '';
        try { text = response.text(); } catch (e) { }

        res.json({
            text,
            candidates: response.candidates
        });
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Gemini Proxy Server running on http://localhost:${PORT}`);
});
