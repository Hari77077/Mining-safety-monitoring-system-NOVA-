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

    // ---- Persistent Alarm System (Premium UI) ----
    let alarmInterval = null;
    let activeAlerts = new Set();

    function startPersistentAlarm(type = 'danger', data = {}, reasons = []) {
        if (alarmInterval) return;

        // Generate Hazard HTML
        const hazardHTML = reasons.map(r => `
            <div class="hazard-item">
                <span class="hazard-icon">⚠️</span>
                <span>${r}</span>
            </div>
        `).join('');

        // Gas Specifics (if critical)
        let gasDetails = '';
        if (data.ch4_ppm > 2.0 || data.co_ppm > 50) {
            gasDetails = `
            <div class="hazard-item">
                <span class="hazard-icon">☠️</span>
                <span>Gas Levels Critical (CH4: ${data.ch4_ppm}%, CO: ${data.co_ppm}ppm)</span>
            </div>`;
        }

        // Safety Score Grade
        const score = data.safety_score || 0;
        const grade = score > 90 ? 'A' : score > 70 ? 'B' : score > 50 ? 'C' : score > 30 ? 'D' : 'F';

        let overlay = document.getElementById('alarmOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'alarmOverlay';
            overlay.className = 'alarm-overlay-active';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div class="alarm-modal-premium">
                <div class="alarm-header">
                    <span class="alarm-header-icon">🚨</span>
                    <h1>CRITICAL ALERT</h1>
                </div>
                
                <div class="hazard-list">
                    ${gasDetails}
                    ${hazardHTML}
                    <div class="hazard-item">
                        <span class="hazard-icon">🛡️</span>
                        <span>Safety Score: ${score}/100 (Grade ${grade})</span>
                    </div>
                </div>

                <div class="protocol-section">
                    <h3>✚ EMERGENCY PROTOCOLS</h3>
                    <div class="protocol-box">
                        <strong>EMG-002: IMMEDIATE EVACUATION</strong>
                        <p>Methane/Hazards Detected. Kill all electrical equipment. Evacuate via nearest exit.</p>
                    </div>
                </div>

                <button id="ackBtn" class="btn-premium-ack">✓ ACKNOWLEDGE & DISMISS</button>
            </div>
        `;

        document.getElementById('ackBtn').onclick = () => stopPersistentAlarm();

        // Loop Sound
        const freq = type === 'extreme' ? 880 : 660;
        alarmInterval = setInterval(() => {
            playTone(freq, 0.3);
        }, 1000);
    }

    function stopPersistentAlarm() {
        if (alarmInterval) {
            clearInterval(alarmInterval);
            alarmInterval = null;
        }
        const overlay = document.getElementById('alarmOverlay');
        if (overlay) overlay.remove();

        activeAlerts.clear();
        NOVA.speakAlert("Alarm Silenced. Protocols Active.");
    }

    function playTone(freq, dur) {
        if (!audioCtx) initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = freq;
        osc.type = 'square';
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(audioCtx.currentTime + dur);
    }

    function triggerAlarm(status, data, reasons = []) {
        // ONLY trigger for concerning levels
        if (status !== 'CRITICAL' && status !== 'EXTREME DANGER') return;

        startPersistentAlarm(status === 'EXTREME DANGER' ? 'extreme' : 'danger', data, reasons);
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

        // Listen for Incoming Messages
        NOVA.onMessage((msg) => {
            // "no need to show the lora packet json" -> Just show sender and content
            addLoRaEntry(log, `${msg.node_id || 'NODE'}: ${msg.content}`, 'info');
        });
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
        // wet_bulb_prob is 0-1. Format as %.
        let wbProb = data.wet_bulb_prob != null ? data.wet_bulb_prob : 0;
        if (wbProb > 1) wbProb = wbProb / 100; // Auto-correction if scaled
        if (wbProb > 1) wbProb = 1; // Cap at 100%

        document.getElementById('wetBulb').textContent = (wbProb * 100).toFixed(0) + '%';

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

        // Workers tracking is now handled by shared.js
        /*
        if (data.rfid && data.rfid !== '--') {
            workers.set(data.rfid, { node: data.node_id, time: new Date().toLocaleTimeString() });
            updateWorkerList();
        }
        */

        // ---- Specific Hazard Checks (Persistent) ----
        let detectedHazards = [];

        // Normalize Wet Bulb (Handle 0-100 vs 0-1)
        let wbVal = data.wet_bulb_prob != null ? data.wet_bulb_prob : 0;
        if (wbVal > 1) wbVal = wbVal / 100; // Treat 19 as 0.19

        // 1. Wet Bulb (Heat Stress)
        // STRICT: > 85% probability (0.85)
        if (wbVal > 0.85) {
            const msg = `Critical Heat Stress Risk (${(wbVal * 100).toFixed(0)}%)`;
            detectedHazards.push(msg);
            NOVA.addLog(msg, 'alert');
            if (!alarmInterval) NOVA.speakAlert(msg);
        }

        // 2. Explosion Risk - Strict Check
        // Only if Logic says CRITICAL *AND* there is actual gas present (Sanity Check)
        // Prevents ghost "CRITICAL" states if ML misfires on empty data
        if (data.explosion_risk === 'CRITICAL' && (data.ch4_ppm > 0.5 || data.co_ppm > 10)) {
            const msg = `Explosion Risk Critical (Methane: ${data.ch4_ppm}%)`;
            detectedHazards.push(msg);
            NOVA.addLog(msg, 'alert');
            if (!alarmInterval) NOVA.speakAlert("Danger. Explosion Risk Critical. Evacuate Immediately.");
        } else if (data.explosion_risk === 'CRITICAL') {
            console.warn("Suppressing Empty Explosion Alert (No Gas Detected)");
        }

        // 3. Fall Detection (Accelerometer) - Strict Check
        const ax = data.ax || 0;
        const ay = data.ay || 0;
        const az = data.az || 0;
        const g = Math.sqrt(ax * ax + ay * ay + az * az);

        if (g < 0.3) { // Lower threshold to avoid random false positives
            const msg = "Man Down Detected";
            detectedHazards.push(msg);
            NOVA.addLog(msg, 'alert');
            if (!alarmInterval) NOVA.speakAlert("Alert. Man Down.");
        }

        // Trigger Persistent Alarm if ANY strict hazard found
        if (detectedHazards.length > 0) {
            triggerAlarm('CRITICAL', data, detectedHazards);
        }

        // Event log
        if (data.status && data.status !== 'SAFE') {
            NOVA.addLog(`${data.status} — Node ${data.node_id} | CO:${data.co_ppm} CH4:${data.ch4_ppm}`, 'alert');
        }
    });

    // Workers tracking handled by shared.js (NOVA)
    // Removed duplicate logic here.
})();
