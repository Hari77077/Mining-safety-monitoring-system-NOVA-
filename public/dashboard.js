/* Dashboard Logic */

(function () {
    // Charts
    let coChart, ch4Chart, hazChart;

    // Workers tracking
    const workers = new Map();

    // Alarm state
    let lastStatus = 'SAFE';
    let audioCtx = null;

    document.addEventListener('DOMContentLoaded', () => {
        coChart = NOVA.createLineChart('airQualityChart', '#ef4444');
        // We'll overlay multiple lines on the same canvas manually
        initAirQualityChart();
        initLoRa();
    });

    // ---- Alert & Alarm System ----
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playAlarmBeep(type) {
        try {
            initAudio();
            const duration = type === 'extreme' ? 0.8 : 0.4;
            const freq = type === 'extreme' ? 880 : type === 'danger' ? 660 : 440;
            const repeats = type === 'extreme' ? 3 : type === 'danger' ? 2 : 1;

            for (let i = 0; i < repeats; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.type = 'square';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.15, audioCtx.currentTime + i * (duration + 0.15));
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * (duration + 0.15) + duration);

                osc.start(audioCtx.currentTime + i * (duration + 0.15));
                osc.stop(audioCtx.currentTime + i * (duration + 0.15) + duration);
            }
        } catch (e) {
            console.warn('Audio alert unavailable:', e);
        }
    }

    function flashScreen() {
        const overlay = document.createElement('div');
        overlay.className = 'alert-overlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('animationend', () => overlay.remove());
    }

    function showAlertToast(status, nodeId, details) {
        // Remove any existing toast
        document.querySelectorAll('.alert-toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = 'alert-toast';
        toast.innerHTML = `
            <span class="toast-icon">🚨</span>
            <div>
                <div class="toast-msg">${status} ALERT — Node ${nodeId}</div>
                <div class="toast-sub">${details}</div>
            </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5500);
    }

    function triggerAlarm(status, data) {
        const cls = NOVA.statusClass(status);
        if (cls === 'safe') return;

        flashScreen();
        playAlarmBeep(cls);

        const details = `CO: ${data.co_ppm || 0} ppm | CH₄: ${data.ch4_ppm || 0} ppm | Temp: ${data.temp || 0}°C`;
        showAlertToast(status, data.node_id || '--', details);
    }

    // ---- Multi-line Air Quality Chart ----
    const airData = { co: [], ch4: [], haz: [] };
    const MAX_POINTS = 60;

    function initAirQualityChart() {
        // Will be drawn on data update
    }

    function pushAirData(data) {
        airData.co.push(data.co_ppm || 0);
        airData.ch4.push(data.ch4_ppm || 0);
        airData.haz.push(data.hazardous_ppm || 0);

        if (airData.co.length > MAX_POINTS) airData.co.shift();
        if (airData.ch4.length > MAX_POINTS) airData.ch4.shift();
        if (airData.haz.length > MAX_POINTS) airData.haz.shift();

        drawAirChart();
    }

    function drawAirChart() {
        const canvas = document.getElementById('airQualityChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.offsetWidth;
        const h = canvas.height = canvas.offsetHeight;
        ctx.clearRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        for (let i = 1; i <= 4; i++) {
            ctx.beginPath();
            ctx.moveTo(0, (h / 5) * i);
            ctx.lineTo(w, (h / 5) * i);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        const allVals = [...airData.co, ...airData.ch4, ...airData.haz];
        const max = Math.max(...allVals, 10);

        drawLine(ctx, airData.co, w, h, max, '#ef4444');
        drawLine(ctx, airData.ch4, w, h, max, '#f97316');
        drawLine(ctx, airData.haz, w, h, max, '#a855f7');
    }

    function drawLine(ctx, data, w, h, max, color) {
        if (data.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';

        for (let i = 0; i < data.length; i++) {
            const x = (i / (MAX_POINTS - 1)) * w;
            const y = h - (data[i] / max) * (h - 20) - 10;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // ---- LoRa Messaging ----
    function initLoRa() {
        const sendBtn = document.getElementById('loraSend');
        const input = document.getElementById('loraInput');
        const log = document.getElementById('loraLog');

        if (sendBtn) {
            sendBtn.addEventListener('click', () => sendLoRa(input, log));
        }
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendLoRa(input, log);
            });
        }
    }

    function sendLoRa(input, log) {
        const msg = input.value.trim();
        if (!msg) return;

        NOVA.send({ type: 'message', node_id: 'control', content: msg });
        addLoRaEntry(log, `YOU: ${msg}`, 'info');
        input.value = '';
    }

    function addLoRaEntry(container, text, type = 'system') {
        if (!container) return;
        const el = document.createElement('div');
        const time = new Date().toLocaleTimeString();
        el.className = `console-entry ${type}`;
        el.textContent = `[${time}] ${text}`;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    }

    // ---- Data Update Handler ----
    NOVA.onData((data) => {
        // Status Banner
        const banner = document.getElementById('statusBanner');
        const label = document.getElementById('statusLabel');
        const icon = document.getElementById('statusIcon');
        if (data.status) {
            const cls = NOVA.statusClass(data.status);
            banner.className = `status-banner ${cls}`;
            label.textContent = data.status;
            const icons = { safe: '🛡️', moderate: '⚠️', danger: '🔥', extreme: '🚨' };
            icon.textContent = icons[cls] || '🛡️';

            // Trigger alarm on status transition to worse
            if (data.status !== lastStatus && data.status !== 'SAFE') {
                triggerAlarm(data.status, data);
            }
            lastStatus = data.status;
        }

        // Node info
        document.getElementById('nodeId').textContent = data.node_id || '--';
        document.getElementById('rfid').textContent = data.rfid || '--';

        // Gas readings
        document.getElementById('coPpm').textContent = NOVA.fmt(data.co_ppm);
        document.getElementById('ch4Ppm').textContent = NOVA.fmt(data.ch4_ppm);
        document.getElementById('hazPpm').textContent = NOVA.fmt(data.hazardous_ppm);

        // AI Predictions (placeholder until ML connected)
        document.getElementById('wetBulb').textContent = data.wet_bulb_prob != null ? NOVA.fmt(data.wet_bulb_prob) : '--';
        document.getElementById('explosionRisk').textContent = data.explosion_risk || '--';
        if (data.safety_score != null) {
            document.getElementById('safetyScore').textContent = Math.round(data.safety_score);
        }

        // Environment
        document.getElementById('temp').textContent = NOVA.fmt(data.temp);
        document.getElementById('humidity').textContent = NOVA.fmt(data.humidity);

        // Z-Axis
        document.getElementById('azValue').textContent = NOVA.fmt(data.az, 2);

        // Air quality chart
        pushAirData(data);

        // Workers tracking
        if (data.rfid && data.rfid !== '--') {
            workers.set(data.rfid, { node: data.node_id, time: new Date().toLocaleTimeString() });
            updateWorkerList();
        }

        // Event log
        if (data.status && data.status !== 'SAFE') {
            NOVA.addLog(`${data.status} — Node ${data.node_id} | CO:${data.co_ppm} CH4:${data.ch4_ppm}`, 'alert');
        }
    });

    function updateWorkerList() {
        const container = document.getElementById('workerList');
        if (!container) return;
        container.innerHTML = '';
        workers.forEach((info, rfid) => {
            const el = document.createElement('div');
            el.className = 'worker-entry';
            el.textContent = `${rfid} @ ${info.node} (${info.time})`;
            container.appendChild(el);
        });
    }
})();
