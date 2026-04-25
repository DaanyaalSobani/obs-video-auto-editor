const express = require('express');
const multer = require('multer');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Store progress logs per output filename
const progressMap = {};

const app = express();
const port = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const AUTO_EDITOR_BIN = process.env.AUTO_EDITOR_BIN || 'auto-editor';
const DEMO_MODE = process.env.DEMO_MODE === 'true';

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ 
    storage,
    limits: DEMO_MODE ? { fileSize: 50 * 1024 * 1024 } : undefined // 50MB limit in demo mode
});

const scheduleCleanup = (filePath) => {
    if (DEMO_MODE) {
        setTimeout(() => {
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, () => console.log(`[Demo] Auto-deleted ${filePath}`));
            }
        }, 10 * 60 * 1000); // 10 minutes
    }
};

const sweepOldUploads = () => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    fs.readdir(UPLOADS_DIR, (err, files) => {
        if (err) return console.error(`[Demo] Sweep readdir failed: ${err.message}`);
        files.filter(f => !f.startsWith('.')).forEach(f => {
            const filePath = path.join(UPLOADS_DIR, f);
            fs.stat(filePath, (statErr, stats) => {
                if (statErr || !stats.isFile()) return;
                if (stats.mtimeMs < cutoff) {
                    fs.unlink(filePath, () => console.log(`[Demo] Sweep deleted ${filePath}`));
                }
            });
        });
    });
};

// Trust proxy for Tailscale
app.set('trust proxy', true);

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());

app.post('/upload', upload.single('video'), (req, res) => {
    if (req.file) scheduleCleanup(req.file.path);
    res.json({ success: true, file: req.file ? req.file.originalname : '' });
});

app.get('/files', (req, res) => {
    fs.readdir(UPLOADS_DIR, (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ files: files.filter(f => !f.startsWith('.')) });
    });
});

app.post('/edit', (req, res) => {
    const { filename, mode } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename required' });

    const inputPath = path.join(UPLOADS_DIR, filename);
    const parsed = path.parse(filename);
    const suffix = mode === 'speed' ? 'speedup' : 'cut';
    const outputFilename = `${parsed.name}_${suffix}${parsed.ext}`;
    const outputPath = path.join(UPLOADS_DIR, outputFilename);

    const args = [inputPath, '-o', outputPath];
    if (mode === 'speed') {
        args.push('--when-silent', 'speed:4');
    } else {
        args.push('--margin', '0.2s');
    }

    console.log(`Running: ${AUTO_EDITOR_BIN} ${args.join(' ')}`);
    progressMap[outputFilename] = [];

    const proc = spawn(AUTO_EDITOR_BIN, args);

    const logLine = (line) => {
        console.log(line);
        if (progressMap[outputFilename]) progressMap[outputFilename].push(line);
    };

    proc.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(logLine));
    proc.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(logLine));

    // Respond immediately so the UI can start polling /progress
    res.json({ success: true, output: outputFilename, processing: true });

    proc.on('close', (code) => {
        if (code === 0) {
            scheduleCleanup(outputPath);
            if (progressMap[outputFilename]) progressMap[outputFilename].push('__DONE__');
        } else {
            if (progressMap[outputFilename]) progressMap[outputFilename].push('__ERROR__');
        }
    });
});

// SSE endpoint: streams progress lines for a given output filename
app.get('/progress/:filename', (req, res) => {
    const key = req.params.filename;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let index = 0;
    const interval = setInterval(() => {
        const lines = progressMap[key] || [];
        while (index < lines.length) {
            const line = lines[index++];
            if (line === '__DONE__') {
                res.write(`data: {"done":true}\n\n`);
                clearInterval(interval);
                delete progressMap[key];
                return res.end();
            }
            if (line === '__ERROR__') {
                res.write(`data: {"error":true}\n\n`);
                clearInterval(interval);
                delete progressMap[key];
                return res.end();
            }
            res.write(`data: ${JSON.stringify({ line })}\n\n`);
        }
    }, 500);

    req.on('close', () => clearInterval(interval));
});

// Error handler for Multer limits
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large for demo mode (50MB max).' });
    }
    res.status(500).json({ error: err.message });
});

app.listen(port, () => {
    console.log(`Auto-editor web UI running at http://localhost:${port}`);
    if (DEMO_MODE) {
        console.log(`Running in DEMO MODE: 50MB upload limit, 10m file auto-delete`);
        sweepOldUploads();
        setInterval(sweepOldUploads, 5 * 60 * 1000);
    }
});
