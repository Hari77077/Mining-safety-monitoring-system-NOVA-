/* Chatbot Logic */
(function () {
    let provider = 'gemini'; // default

    document.addEventListener('DOMContentLoaded', () => {
        const toggle = document.getElementById('llmSwitch');
        const geminiLabel = document.getElementById('geminiLabel');
        const llamaLabel = document.getElementById('llamaLabel');
        const sendBtn = document.getElementById('chatSend');
        const input = document.getElementById('chatInput');

        // Toggle handler
        toggle.addEventListener('change', () => {
            provider = toggle.checked ? 'llama' : 'gemini';
            geminiLabel.classList.toggle('active', !toggle.checked);
            llamaLabel.classList.toggle('active', toggle.checked);
            document.getElementById('providerTag').textContent = provider === 'gemini' ? 'Gemini' : 'Llama 3.2';
            addBotMessage(`Switched to ${provider === 'gemini' ? 'Gemini API' : 'Llama 3.2 (Local)'}`, true);
        });

        // Send handler
        sendBtn.addEventListener('click', () => sendMessage(input));
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage(input);
        });
    });

    function sendMessage(input) {
        const text = input.value.trim();
        if (!text) return;

        addUserMessage(text);
        input.value = '';

        // Show typing indicator
        const typingId = showTyping();

        // Send to backend
        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                provider: provider,
                context: NOVA.getLatest() // Send current sensor data as context
            })
        })
            .then(res => res.json())
            .then(data => {
                removeTyping(typingId);
                addBotMessage(data.reply || data.error || 'No response received.');
            })
            .catch(err => {
                removeTyping(typingId);
                addBotMessage(`Error: Could not reach ${provider} backend. Make sure the server is running.`, true);
                console.error(err);
            });
    }

    function addUserMessage(text) {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'msg user';
        div.innerHTML = `
            <div class="msg-avatar">👤</div>
            <div class="msg-content">
                <div class="msg-text">${escapeHtml(text)}</div>
            </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function addBotMessage(text, isSystem = false) {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'msg bot';
        div.innerHTML = `
            <div class="msg-avatar">${isSystem ? '⚙️' : '🤖'}</div>
            <div class="msg-content">
                <div class="msg-name">NOVA AI <span class="provider-tag">${provider === 'gemini' ? 'Gemini' : 'Llama'}</span></div>
                <div class="msg-text">${escapeHtml(text)}</div>
            </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function showTyping() {
        const container = document.getElementById('chatMessages');
        const id = 'typing-' + Date.now();
        const div = document.createElement('div');
        div.className = 'msg bot';
        div.id = id;
        div.innerHTML = `
            <div class="msg-avatar">🤖</div>
            <div class="msg-content">
                <div class="typing-dots"><span></span><span></span><span></span></div>
            </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        return id;
    }

    function removeTyping(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ---- Update sidebar with live data ----
    NOVA.onData((data) => {
        document.getElementById('miniTemp').textContent = NOVA.fmt(data.temp);
        document.getElementById('miniHumid').textContent = NOVA.fmt(data.humidity);
        document.getElementById('miniCo').textContent = NOVA.fmt(data.co_ppm);
        document.getElementById('miniCh4').textContent = NOVA.fmt(data.ch4_ppm);
        document.getElementById('miniHaz').textContent = NOVA.fmt(data.hazardous_ppm);
        document.getElementById('miniAz').textContent = NOVA.fmt(data.az, 2);

        if (data.status) {
            const el = document.getElementById('miniStatus');
            el.textContent = data.status;
            el.className = `mini-status ${NOVA.statusClass(data.status)}`;
        }

        if (data.safety_score != null) {
            document.getElementById('miniScore').textContent = Math.round(data.safety_score);
        }
    });
})();
