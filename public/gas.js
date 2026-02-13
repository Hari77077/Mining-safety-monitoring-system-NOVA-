/* Gas Analytics Logic */
(function () {
    let coChart, ch4Chart, hazChart;

    document.addEventListener('DOMContentLoaded', () => {
        coChart = NOVA.createLineChart('coChart', '#ef4444');
        ch4Chart = NOVA.createLineChart('ch4Chart', '#f97316');
        hazChart = NOVA.createLineChart('hazChart', '#a855f7');
    });

    function getSeverity(gas, value) {
        if (gas === 'co') {
            if (value > 100) return 'critical';
            if (value > 50) return 'high';
            if (value > 25) return 'medium';
            return 'low';
        }
        if (gas === 'ch4') {
            if (value > 5) return 'critical';
            if (value > 2.5) return 'high';
            if (value > 1) return 'medium';
            return 'low';
        }
        // hazardous
        if (value > 50) return 'critical';
        if (value > 25) return 'high';
        if (value > 10) return 'medium';
        return 'low';
    }

    function updateBadge(id, severity) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = severity.toUpperCase();
        el.className = `severity-badge ${severity}`;
    }

    NOVA.onData((data) => {
        // Update values
        document.getElementById('coLevel').textContent = NOVA.fmt(data.co_ppm);
        document.getElementById('ch4Level').textContent = NOVA.fmt(data.ch4_ppm);
        document.getElementById('hazLevel').textContent = NOVA.fmt(data.hazardous_ppm);

        // Severity
        updateBadge('coSeverity', getSeverity('co', data.co_ppm || 0));
        updateBadge('ch4Severity', getSeverity('ch4', data.ch4_ppm || 0));
        updateBadge('hazSeverity', getSeverity('haz', data.hazardous_ppm || 0));

        // Charts
        if (coChart) coChart.push(data.co_ppm || 0);
        if (ch4Chart) ch4Chart.push(data.ch4_ppm || 0);
        if (hazChart) hazChart.push(data.hazardous_ppm || 0);

        // Log critical events
        if (data.status === 'CRITICAL') {
            const log = document.getElementById('gasLog');
            if (log) {
                const entry = document.createElement('div');
                entry.className = 'console-entry alert';
                entry.textContent = `[${new Date().toLocaleTimeString()}] CRITICAL — Node ${data.node_id} | CO:${data.co_ppm} CH4:${data.ch4_ppm} HAZ:${data.hazardous_ppm}`;
                log.appendChild(entry);
                log.scrollTop = log.scrollHeight;
            }
        }
    });
})();
