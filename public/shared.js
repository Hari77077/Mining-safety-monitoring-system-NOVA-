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
    let voice = null;
    let audioUnlocked = false;

    // Load Voice Async
    function loadVoice() {
        const voices = window.speechSynthesis.getVoices();
        voice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Male')) || voices[0];
    }
    window.speechSynthesis.onvoiceschanged = loadVoice;
    setTimeout(loadVoice, 500); // Fallback

    // Unlock Audio on First Click
    document.addEventListener('click', () => {
        if (!audioUnlocked) {
            const temp = new SpeechSynthesisUtterance('');
            window.speechSynthesis.speak(temp);
            audioUnlocked = true;
            console.log('[Audio] System Unlocked');
        }
    }, { once: true });

    function speakAlert(message) {
        // Prevent spamming (throttle 10s)
        const now = Date.now();
        if (now - lastSpoken < 10000) return;

        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(message);
            if (!voice) loadVoice();
            if (voice) utterance.voice = voice;

            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            window.speechSynthesis.speak(utterance);
            lastSpoken = now;
            console.log(`[Voice] Speaking: "${message}"`);
        }
    }

    // ---- State ----
    let socket = null;
    let latestData = null;
    const listeners = [];
    const messageListeners = [];

    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

        socket.onopen = () => {
            console.log('[WS] Connected');
            updateConnectionUI(true);
        };

        socket.onclose = () => {
            console.log('[WS] Disconnected');
            updateConnectionUI(false);
            setTimeout(connect, 3000);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // Route Packet Type
                if (data.type === 'message') {
                    // It's a LoRa Message (Text)
                    messageListeners.forEach(cb => cb(data));
                } else {
                    // It's Sensor Data
                    latestData = data;
                    listeners.forEach(cb => cb(data));
                }
            } catch (e) {
                console.error('[WS] Parse error:', e);
            }
        };
    }

    // Workers List (Reset on reload as per request 'no workers at start')
    // To persist, uncomment localStorage load. 
    // let rawWorkers = JSON.parse(localStorage.getItem('nova_workers') || '[]');
    let rawWorkers = [];
    let workers = rawWorkers;
    localStorage.setItem('nova_workers', JSON.stringify(workers));

    function updateWorkerListUI() {
        // Find the worker list container (only exists on Dashboard)
        const listEl = document.getElementById('workerList');
        const countEl = document.getElementById('workerCount');

        if (countEl) countEl.textContent = workers.length;

        if (listEl) {
            listEl.innerHTML = '';
            if (workers.length === 0) {
                listEl.innerHTML = '<div class="empty-state">No workers detected</div>';
            } else {
                workers.forEach(w => {
                    const el = document.createElement('div');
                    el.className = 'worker-tag';
                    el.title = "Click to Manual Check-Out";
                    el.style.cursor = "pointer";
                    // Add Click Handler
                    el.onclick = () => manualCheckout(w.id);
                    el.innerHTML = `<span>👤 ${w.id}</span> <span class="time">${w.time}</span>`;
                    listEl.appendChild(el);
                });
            }
        }
    }

    function manualCheckout(id) {
        if (confirm(`Manually check out worker ${id}?`)) {
            const idx = workers.findIndex(w => w.id === id);
            if (idx >= 0) {
                workers.splice(idx, 1);
                localStorage.setItem('nova_workers', JSON.stringify(workers));
                updateWorkerListUI();
            }
        }
    }

    function handleRFID(rawTag) {
        if (!rawTag) return;
        const tag = String(rawTag).trim().toUpperCase(); // Force string, trim, UPPERCASE
        if (tag === "0" || tag === "" || tag === "NULL") return;

        console.log(`[RFID] Processing: "${tag}"`);

        // CHECK-IN / CHECK-OUT LOGIC
        const idx = workers.findIndex(w => w.id === tag);

        if (idx >= 0) {
            // Found -> Check Out
            workers.splice(idx, 1);
            const msg = `Worker ${tag} Checked OUT`;
            addLog(msg, 'info');
            console.log(`[RFID] ${msg}`);
            speakAlert(msg);
        } else {
            // Not Found -> Check In
            workers.push({ id: tag, time: new Date().toLocaleTimeString() });
            const msg = `Worker ${tag} Checked IN`;
            addLog(msg, 'info');
            console.log(`[RFID] ${msg}`);
            speakAlert(msg);
        }

        // Save & Update
        localStorage.setItem('nova_workers', JSON.stringify(workers));
        updateWorkerListUI();
    }

    // Time-Based Debounce with Persistence
    // We allow re-scanning the same tag after 5 seconds.
    // This fixes the "Stuck" issue if the firmware never sends "0".
    let lastProcessedTag = localStorage.getItem('nova_last_tag') || "";
    let lastProcessedTime = 0; // Start at 0 to detect "Fresh Load"

    function processRFID(tag) {
        if (!tag) return;
        const cleanTag = String(tag).trim().toUpperCase();
        if (cleanTag.length < 3) return;

        const now = Date.now();

        if (cleanTag === lastProcessedTag) {
            // Same Tag Logic

            // 1. If First Sight after Reload (Time is 0), IGNORE it (Ghost Fix)
            if (lastProcessedTime === 0) {
                console.log(`[RFID] Suppressing Ghost (Fresh Load): ${cleanTag}`);
                lastProcessedTime = now;
                return;
            }

            // 2. Debounce (Wait 3s to Toggle) - Reduced from 5s
            if (now - lastProcessedTime < 3000) {
                console.log(`[RFID] Debounce Blocked: ${cleanTag} (${Math.round((3000 - (now - lastProcessedTime)) / 100)}ms left)`);
                return;
            }
        }

        console.log(`[RFID] Processing Event: ${cleanTag}`);
        // Process New or Timed-Out Tag
        lastProcessedTag = cleanTag;
        lastProcessedTime = now;
        localStorage.setItem('nova_last_tag', cleanTag);

        handleRFID(cleanTag);
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

    function onMessage(callback) {
        messageListeners.push(callback);
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

            // Y-Axis Labels (Min/Max)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '10px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(max), w - 5, 12);
            ctx.fillText(Math.round(min), w - 5, h - 5);
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

    function clearWorkers() {
        workers = [];
        localStorage.removeItem('nova_workers');
        localStorage.removeItem('nova_last_tag');
        lastProcessedTag = "";
        lastProcessedTime = 0;
        updateWorkerListUI();
        addLog("System Reset: All workers cleared", "warning");
    }

    // ---- Init ----
    document.addEventListener('DOMContentLoaded', () => {
        initNav();
        connect();
        updateWorkerListUI(); // Load persisted list

        // Listen for data to trigger RFID check
        onData((d) => {
            if (d.rfid && d.rfid != "0000000000004000" && d.rfid != "0") processRFID(d.rfid);
        });
    });

    return { onData, onMessage, getLatest, send, addLog, speakAlert, createLineChart, fmt, statusClass, getWorkers: () => workers, clearWorkers };
})();
