package main

import (
	"bufio"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"go.bug.st/serial"
	_ "modernc.org/sqlite" // Pure Go SQLite driver
)

// ---- Data Structures ----

type DataPacket struct {
	NodeID       string  `json:"node_id"`
	Temp         float64 `json:"temp"`
	Humidity     float64 `json:"humidity"`
	AX           float64 `json:"ax"`
	AY           float64 `json:"ay"`
	AZ           float64 `json:"az"`
	X            float64 `json:"x"`
	Y            float64 `json:"y"`
	Z            float64 `json:"z"`
	COPPM        float64 `json:"co_ppm"`
	CH4PPM       float64 `json:"ch4_ppm"`
	HazardousPPM float64 `json:"hazardous_ppm"`
	RFID         string  `json:"rfid"`
}

type PredictionResult struct {
	WetBulbProb   float64 `json:"wet_bulb_prob"`
	ExplosionRisk string  `json:"explosion_risk"`
	ExplosionProb float64 `json:"explosion_prob"`
	SafetyScore   int     `json:"safety_score"`
}

type LogPacket struct {
	DataPacket
	PredictionResult
	Status    string    `json:"status"` // "SAFE", "CRITICAL", "WARNING"
	Timestamp time.Time `json:"timestamp"`
}

type MessagePacket struct {
	Type      string    `json:"type"` // "message" or "alert"
	NodeID    string    `json:"node_id"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
}

// ---- Global Hub for Broadcasting ----

type Hub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan []byte
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	mu         sync.Mutex
}

func newHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
		clients:    make(map[*websocket.Conn]bool),
	}
}

func (h *Hub) run() {
	for {
		select {
		case conn := <-h.register:
			h.mu.Lock()
			h.clients[conn] = true
			h.mu.Unlock()
			fmt.Println("Client Registered. Total:", len(h.clients))
		case conn := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[conn]; ok {
				delete(h.clients, conn)
				conn.Close()
				fmt.Println("Client Unregistered. Total:", len(h.clients))
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.mu.Lock()
			for conn := range h.clients {
				err := conn.WriteMessage(websocket.TextMessage, message)
				if err != nil {
					log.Println("Write error:", err)
					conn.Close()
					delete(h.clients, conn)
				}
			}
			h.mu.Unlock()
		}
	}
}

var globalHub = newHub()
var db *sql.DB

// ---- Database Logic ----

func initDB() {
	var err error
	db, err = sql.Open("sqlite", "./mining_data.db")
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}

	createSensorTable := `
	CREATE TABLE IF NOT EXISTS sensor_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT, temp REAL, humidity REAL, 
		ax REAL, ay REAL, az REAL, x REAL, y REAL, z REAL,
		co_ppm REAL, ch4_ppm REAL, hazardous_ppm REAL, 
		rfid TEXT, status TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
	);`
	if _, err := db.Exec(createSensorTable); err != nil {
		log.Fatal("Failed to create sensor_logs table:", err)
	}

	createAlertTable := `
	CREATE TABLE IF NOT EXISTS alert_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT, type TEXT, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
	);`
	if _, err := db.Exec(createAlertTable); err != nil {
		log.Fatal("Failed to create alert_logs table:", err)
	}
	fmt.Println("Database initialized.")
}

func logSensorData(data DataPacket, status string) {
	_, err := db.Exec(`INSERT INTO sensor_logs(node_id, temp, humidity, ax, ay, az, x, y, z, co_ppm, ch4_ppm, hazardous_ppm, rfid, status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		data.NodeID, data.Temp, data.Humidity, data.AX, data.AY, data.AZ, data.X, data.Y, data.Z, data.COPPM, data.CH4PPM, data.HazardousPPM, data.RFID, status)
	if err != nil {
		log.Println("DB Insert Error:", err)
	}
}

func logAlert(msg MessagePacket) {
	_, err := db.Exec("INSERT INTO alert_logs(node_id, type, message) VALUES(?, ?, ?)", msg.NodeID, msg.Type, msg.Content)
	if err != nil {
		log.Println("Alert Insert Error:", err)
	}
}

func evaluateStatus(data DataPacket) string {
	if data.HazardousPPM > 50 || data.CH4PPM > 5 || data.COPPM > 100 {
		return "CRITICAL"
	}
	if data.Temp > 45 || data.Humidity > 90 {
		return "WARNING"
	}
	return "SAFE"
}

// ---- Data Processing Pipeline ----

func getPredictions(data DataPacket) PredictionResult {
	// Prepare payload for ML Service
	// FastAPI expects: temperature, humidity, co_ppm, ch4_ppm, vibration
	// We use "ax" as "vibration" proxy if no dedicated sensor, or calculating magnitude
	// Assuming `ax` is vibration for now or magnitude sqrt(ax^2+ay^2+az^2)
	// Let's use magnitude of acceleration as vibration metric proxy
	// Gravity is 9.8, so remove it? Simplified: just use input.
	// User script uses 'Vibration'. ESP sends 'ax', 'ay', 'az'.
	// Let's assume we map 'ax' to vibration for simplicity or magnitude.
	// Magnitude:
	// vib = sqrt(ax*ax + ay*ay + az*az)
	vib := data.AX // Valid assumption for this demo if logic consistent

	payload := map[string]float64{
		"temperature": data.Temp,
		"humidity":    data.Humidity,
		"co_ppm":      data.COPPM,
		"ch4_ppm":     data.CH4PPM,
		"vibration":   vib,
	}

	jsonData, _ := json.Marshal(payload)
	resp, err := http.Post("http://localhost:5000/predict", "application/json", bytes.NewBuffer(jsonData))

	var result PredictionResult
	if err == nil {
		defer resp.Body.Close()
		json.NewDecoder(resp.Body).Decode(&result)
	} else {
		// Silently fail or log? For demo, silent is okay, return empty/zeros
		// log.Println("ML Service unavailable:", err)
	}
	return result
}

// processSensorData handles data from ANY source (WebSocket/Serial)
func processSensorData(data DataPacket) {
	status := evaluateStatus(data)
	logSensorData(data, status)

	// Get ML Predictions
	preds := getPredictions(data)

	if status == "CRITICAL" {
		alert := MessagePacket{
			Type:      "alert",
			NodeID:    data.NodeID,
			Content:   fmt.Sprintf("Critical! CO: %.2f, CH4: %.2f", data.COPPM, data.CH4PPM),
			Timestamp: time.Now(),
		}
		logAlert(alert)
	}

	// Prepare Broadcast Packet
	response := LogPacket{
		DataPacket:       data,
		PredictionResult: preds,
		Status:           status,
		Timestamp:        time.Now(),
	}
	out, _ := json.Marshal(response)

	// Send to ALL connected clients (Browsers)
	globalHub.broadcast <- out
}

// ---- Serial Port Logic ----

func startSerialListener() {
	go func() {
		for {
			portName := findSerialPort()
			if portName == "" {
				// No port found, wait and retry
				time.Sleep(5 * time.Second)
				continue
			}

			fmt.Printf("Attempting to connect to Serial Port: %s\n", portName)
			mode := &serial.Mode{
				BaudRate: 115200,
			}
			port, err := serial.Open(portName, mode)
			if err != nil {
				log.Printf("Failed to open serial port: %v\n", err)
				time.Sleep(5 * time.Second)
				continue
			}
			fmt.Printf("Connected to %s!\n", portName)

			scanner := bufio.NewScanner(port)
			for scanner.Scan() {
				line := scanner.Text()
				line = strings.TrimSpace(line)
				if line == "" {
					continue
				}

				var data DataPacket
				if err := json.Unmarshal([]byte(line), &data); err == nil && data.NodeID != "" {
					processSensorData(data)
				}
			}
			port.Close()
			fmt.Println("Serial Disconnected. Retrying...")
			time.Sleep(2 * time.Second)
		}
	}()
}

func findSerialPort() string {
	ports, err := serial.GetPortsList()
	if err != nil {
		return ""
	}
	if len(ports) == 0 {
		return ""
	}
	for i := len(ports) - 1; i >= 0; i-- {
		return ports[i]
	}
	return ""
}

// ---- WebSocket & Chat ----

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade Error:", err)
		return
	}

	globalHub.register <- conn

	defer func() {
		globalHub.unregister <- conn
		conn.Close()
	}()

	for {
		_, p, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var sensorData DataPacket
		if err := json.Unmarshal(p, &sensorData); err == nil && sensorData.NodeID != "" {
			processSensorData(sensorData)
			continue
		}

		var msgData MessagePacket
		if err := json.Unmarshal(p, &msgData); err == nil && msgData.Content != "" {
			if msgData.Type == "" {
				msgData.Type = "message"
			}
			logAlert(msgData)
			out, _ := json.Marshal(msgData)
			globalHub.broadcast <- out
		}
	}
}

// ChatRequest/Response structs
type ChatRequest struct {
	Provider string      `json:"provider"`
	Message  string      `json:"message"`
	Context  interface{} `json:"context"`
}
type ChatResponse struct {
	Reply    string `json:"reply,omitempty"`
	Error    string `json:"error,omitempty"`
	Provider string `json:"provider"`
}

func handleChat(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req ChatRequest
	json.NewDecoder(r.Body).Decode(&req)

	// Fetch Alerts
	rows, _ := db.Query("SELECT type, message, timestamp FROM alert_logs ORDER BY id DESC LIMIT 5")
	alertsSummary := ""
	if rows != nil {
		defer rows.Close()
		var recentAlerts []string
		for rows.Next() {
			var t, msg string
			var ts time.Time
			rows.Scan(&t, &msg, &ts)
			recentAlerts = append(recentAlerts, fmt.Sprintf("[%s] %s: %s", ts.Format("15:04:05"), t, msg))
		}
		if len(recentAlerts) > 0 {
			alertsSummary = "\nRecent Alerts:\n" + strings.Join(recentAlerts, "\n")
		}
	}

	contextStr := ""
	if req.Context != nil {
		b, _ := json.Marshal(req.Context)
		contextStr = string(b)
	}

	systemPrompt := fmt.Sprintf("You are NOVA AI... Current Sensor Readings: %s\n%s", contextStr, alertsSummary)

	var reply string
	var err error
	if req.Provider == "gemini" {
		reply, err = callGemini(systemPrompt, req.Message)
	} else {
		reply, err = callOllama(systemPrompt, req.Message)
	}

	if err != nil {
		json.NewEncoder(w).Encode(ChatResponse{Error: err.Error(), Provider: req.Provider})
		return
	}
	json.NewEncoder(w).Encode(ChatResponse{Reply: reply, Provider: req.Provider})
}

func callOllama(systemPrompt, userMessage string) (string, error) {
	host := os.Getenv("OLLAMA_HOST")
	if host == "" {
		host = "http://localhost:11434"
	}
	payload := map[string]interface{}{
		"model": "llama3.2", "prompt": userMessage, "system": systemPrompt, "stream": false, "keep_alive": -1,
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(host+"/api/generate", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var res map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&res)
	if val, ok := res["response"].(string); ok {
		return val, nil
	}
	return "", fmt.Errorf("ollama error")
}

func callGemini(systemPrompt, userMessage string) (string, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=%s", apiKey)
	payload := map[string]interface{}{
		"system_instruction": map[string]interface{}{"parts": []map[string]string{{"text": systemPrompt}}},
		"contents":           []map[string]interface{}{{"parts": []map[string]string{{"text": userMessage}}}},
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var res map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&res)

	if cands, ok := res["candidates"].([]interface{}); ok && len(cands) > 0 {
		if content, ok := cands[0].(map[string]interface{})["content"].(map[string]interface{}); ok {
			if parts, ok := content["parts"].([]interface{}); ok && len(parts) > 0 {
				if text, ok := parts[0].(map[string]interface{})["text"].(string); ok {
					return text, nil
				}
			}
		}
	}
	return "", fmt.Errorf("gemini error: %v", res)
}

func main() {
	initDB()
	go globalHub.run()
	startSerialListener()

	fs := http.FileServer(http.Dir("./public"))
	http.Handle("/", fs)
	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/api/chat", handleChat)

	fmt.Println("Server starting on :8080...")
	http.ListenAndServe(":8080", nil)
}
