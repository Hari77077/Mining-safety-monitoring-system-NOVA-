/* ========================================
   NOVA — Shared JavaScript
   WebSocket Connection + Data Store + Utilities
   ======================================== */

const NOVA = (() => {
    // --- SHARED UTILS ---
    const updates = {
        temp: 0,
        humidity: 0,
        methane: 0,
        co: 0,
        vibration: 0,
        dust: 0
    };

    // --- VOICE ALERT SYSTEM (JARVIS STYLE) ---
    let lastSpoken = 0;
    function speakAlert(message) {
        // Prevent spamming (throttle 10s)
        const now = Date.now();
        if (now - lastSpoken < 10000) return;

        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(message);
            // Select a cool voice if available
            const voices = window.speechSynthesis.getVoices();
            const maleVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Male'));
            if (maleVoice) utterance.voice = maleVoice;

            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
            lastSpoken = now;
        }
    }

    // ---- State ----
    let socket = null;
    let latestData = null;
    const listeners = [];

    // ---- WebSocket ----
    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            updateConnectionUI(true);
            addLog('WebSocket connected', 'info');
        };

        socket.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                if (packet.node_id) {
                    latestData = packet;
                    listeners.forEach(fn => fn(packet));
                } else if (packet.type === 'alert' || packet.type === 'message') {
                    addLog(`${packet.type.toUpperCase()}: ${packet.content}`, 'alert');
                }
            } catch (e) {
                console.error('Parse error:', e);
            }
        };

        socket.onclose = () => {
            updateConnectionUI(false);
            addLog('Connection lost. Reconnecting in 3s...', 'warn');
            setTimeout(connect, 3000);
        };

        socket.onerror = () => {
            addLog('WebSocket error', 'alert');
        };
    }

    function send(data) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(typeof data === 'string' ? data : JSON.stringify(data));
        }
    }

    // ---- Connection UI ----
    function updateConnectionUI(online) {
        const dot = document.querySelector('.sidebar-status .dot');
        const text = document.querySelector('.sidebar-status .status-label');
        if (dot) dot.className = online ? 'dot online' : 'dot';
        if (text) text.textContent = online ? 'Connected' : 'Disconnected';
    }

    // ---- Listeners ----
    function onData(callback) {
        listeners.push(callback);
    }

    function getLatest() {
        return latestData;
    }

    // ---- Logging ----
    function addLog(msg, type = 'system') {
        const consoles = document.querySelectorAll('.console-box');
        consoles.forEach(el => {
            const entry = document.createElement('div');
            const time = new Date().toLocaleTimeString();
            entry.className = `console-entry ${type}`;
            entry.textContent = `[${time}] ${msg}`;
            el.appendChild(entry);
            el.scrollTop = el.scrollHeight;
        });
    }

    // ---- Chart Helper ----
    function createLineChart(canvasId, color, maxPoints = 60) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const data = [];

        function push(value) {
            data.push(value);
            if (data.length > maxPoints) data.shift();
            draw();
        }

        function draw() {
            const w = canvas.width = canvas.offsetWidth;
            const h = canvas.height = canvas.offsetHeight;
            ctx.clearRect(0, 0, w, h);

            if (data.length < 2) return;

            const max = Math.max(...data, 1);
            const min = Math.min(...data, 0);
            const range = max - min || 1;

            // Grid lines
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            for (let i = 1; i <= 4; i++) {
                const yy = (h / 5) * i;
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.moveTo(0, yy);
                ctx.lineTo(w, yy);
                ctx.stroke();
            }
            ctx.setLineDash([]);

            // Color indicator dot at top center
            ctx.beginPath();
            ctx.arc(w / 2, 8, 4, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Data line
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';

            for (let i = 0; i < data.length; i++) {
                const x = (i / (maxPoints - 1)) * w;
                const y = h - ((data[i] - min) / range) * (h - 20) - 10;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Glow
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Fill gradient
            const lastX = ((data.length - 1) / (maxPoints - 1)) * w;
            ctx.lineTo(lastX, h);
            ctx.lineTo(0, h);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, color.replace(')', ', 0.15)').replace('rgb', 'rgba'));
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fill();
        }

        return { push, data };
    }

    // ---- Navigation highlight ----
    function initNav() {
        const current = window.location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.nav-links a').forEach(link => {
            const href = link.getAttribute('href');
            if (href === current || (current === '' && href === 'index.html')) {
                link.classList.add('active');
            }
        });
    }

    // ---- Format helpers ----
    function fmt(val, decimals = 1) {
        return val != null ? Number(val).toFixed(decimals) : '--';
    }

    function statusClass(status) {
        const map = { SAFE: 'safe', WARNING: 'moderate', MODERATE: 'moderate', DANGER: 'danger', CRITICAL: 'extreme', 'EXTREME DANGER': 'extreme' };
        return map[status] || 'safe';
    }

    // ---- Init ----
    document.addEventListener('DOMContentLoaded', () => {
        initNav();
        connect();
    });

    return { onData, getLatest, send, addLog, createLineChart, fmt, statusClass };
})();
