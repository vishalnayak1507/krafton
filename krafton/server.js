// FILE: server.js
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Create the WebSocket Server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

// --- GAME CONSTANTS ---
const MAP_SIZE = 600;
const PLAYER_SPEED = 5;
const COIN_RADIUS = 10;
const PLAYER_SIZE = 20;
const TICK_RATE = 30;   // Server updates 30 times per second
const LATENCY_MS = 200; // REQUIRED: 200ms simulated network delay

// --- GAME STATE ---
let players = {};
let coins = [];

// Helper: Spawn a coin at a random position
function spawnCoin() {
    coins.push({
        id: uuidv4(),
        x: Math.random() * (MAP_SIZE - 20) + 10,
        y: Math.random() * (MAP_SIZE - 20) + 10
    });
}

// Initialize the game with 5 coins
for (let i = 0; i < 5; i++) spawnCoin();

// --- CONNECTION HANDLING ---
wss.on('connection', (ws) => {
    const id = uuidv4();
    // Assign a random color to the new player
    const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
    
    // Initialize Player State (Server Authority)
    players[id] = { 
        x: 300, 
        y: 300, 
        score: 0, 
        color: color, 
        inputs: { left: false, right: false, up: false, down: false } 
    };

    // Send the ID to the client immediately so they know who they are
    ws.send(JSON.stringify({ type: 'init', id: id }));

    // Handle Incoming Messages (Client Intent)
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'input') {
                // Clients only send inputs (left/right/up/down), not position
                if (players[id]) {
                    players[id].inputs = data.inputs;
                }
            }
        } catch (e) {
            console.error("Invalid message received");
        }
    });

    // Handle Disconnect
    ws.on('close', () => {
        delete players[id];
    });
});

// --- SERVER GAME LOOP ---
setInterval(() => {
    // 1. Update Physics (Authoritative)
    for (const id in players) {
        const p = players[id];
        
        // Move player based on inputs
        if (p.inputs.left) p.x -= PLAYER_SPEED;
        if (p.inputs.right) p.x += PLAYER_SPEED;
        if (p.inputs.up) p.y -= PLAYER_SPEED;
        if (p.inputs.down) p.y += PLAYER_SPEED;

        // Keep player inside the map boundaries
        p.x = Math.max(0, Math.min(MAP_SIZE - PLAYER_SIZE, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE - PLAYER_SIZE, p.y));

        // 2. Collision Detection (Player vs Coins)
        for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            // Simple circle-box collision approximation (distance check)
            const dx = (p.x + PLAYER_SIZE/2) - c.x;
            const dy = (p.y + PLAYER_SIZE/2) - c.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < (PLAYER_SIZE/2 + COIN_RADIUS)) {
                // Collision detected: Increase score and respawn coin
                p.score += 1;
                coins.splice(i, 1);
                spawnCoin();
            }
        }
    }

    // 3. Create State Snapshot
    const stateSnapshot = {
        timestamp: Date.now(),
        players: players,
        coins: coins
    };

    // 4. Broadcast with ARTIFICIAL LATENCY
    // We delay sending the message by 200ms to meet the test requirement
    setTimeout(() => {
        const updateMsg = JSON.stringify({ type: 'update', state: stateSnapshot });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(updateMsg);
            }
        });
    }, LATENCY_MS);

}, 1000 / TICK_RATE);

console.log(`Server running on ws://localhost:8080 with ${LATENCY_MS}ms latency simulation.`);