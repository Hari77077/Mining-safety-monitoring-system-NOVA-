/* Vibrations Logic */
(function () {
    let axChart, ayChart, azChart;
    const IMPACT_THRESHOLD = 3.0; // m/s² threshold for logging impact

    document.addEventListener('DOMContentLoaded', () => {
        axChart = NOVA.createLineChart('axChart', '#38bdf8');
        ayChart = NOVA.createLineChart('ayChart', '#22c55e');
        azChart = NOVA.createLineChart('azChart', '#ef4444');
    });

    NOVA.onData((data) => {
        const ax = data.ax || 0;
        const ay = data.ay || 0;
        const az = data.az || 0;

        // Update values
        document.getElementById('axVal').textContent = NOVA.fmt(ax, 2);
        document.getElementById('ayVal').textContent = NOVA.fmt(ay, 2);
        document.getElementById('azVal').textContent = NOVA.fmt(az, 2);

        // Update bars (normalized to 10 m/s² max for display)
        const maxG = 10;
        document.getElementById('axBar').style.width = `${Math.min(Math.abs(ax) / maxG * 100, 100)}%`;
        document.getElementById('ayBar').style.width = `${Math.min(Math.abs(ay) / maxG * 100, 100)}%`;
        document.getElementById('azBar').style.width = `${Math.min(Math.abs(az) / maxG * 100, 100)}%`;

        // Charts
        if (axChart) axChart.push(ax);
        if (ayChart) ayChart.push(ay);
        if (azChart) azChart.push(az);

        // Impact detection
        const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
        if (magnitude > IMPACT_THRESHOLD) {
            const log = document.getElementById('impactLog');
            if (log) {
                const entry = document.createElement('div');
                entry.className = 'console-entry alert';
                entry.textContent = `[${new Date().toLocaleTimeString()}] IMPACT — Magnitude: ${magnitude.toFixed(2)} m/s² | Node: ${data.node_id} | AX:${ax} AY:${ay} AZ:${az}`;
                log.appendChild(entry);
                log.scrollTop = log.scrollHeight;
            }
        }
    });
})();
