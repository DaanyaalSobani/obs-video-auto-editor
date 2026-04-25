const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const AUTO_EDITOR_BIN = '/home/daanyaal/.local/bin/auto-editor';

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// Trust proxy for Tailscale
app.set('trust proxy', true);

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());

app.post('/upload', upload.single('video'), (req, res) => {
    res.json({ success: true, file: req.file.originalname });
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
    
    // Tag the file depending on the mode
    const suffix = mode === 'speed' ? 'speedup' : 'cut';
    const outputFilename = `${parsed.name}_${suffix}${parsed.ext}`;
    const outputPath = path.join(UPLOADS_DIR, outputFilename);

    let command = `${AUTO_EDITOR_BIN} "${inputPath}" -o "${outputPath}"`;
    if (mode === 'speed') {
        command += ` --when-silent speed:4`;
    } else {
        command += ` --margin 0.2s`;
    }

    console.log(`Running: ${command}`);
    
    // Auto-editor can take some time, execute asynchronously
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return res.status(500).json({ error: stderr || error.message });
        }
        res.json({ success: true, output: outputFilename });
    });
});

app.listen(port, () => console.log(`Auto-editor web UI running at http://localhost:${port}`));
