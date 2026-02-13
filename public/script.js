const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/ws`;
const socket = new WebSocket(wsUrl);

socket.onopen = () => {
    document.getElementById('status').innerText = 'Connected';
    console.log('Connected to WebSocket');
};

socket.onmessage = (event) => {
    console.log('Message:', event.data);
};

socket.onclose = () => {
    document.getElementById('status').innerText = 'Disconnected';
};
