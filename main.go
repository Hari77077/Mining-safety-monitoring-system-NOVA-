package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	_ "modernc.org/sqlite" // Pure Go SQLite driver
)

// DataPacket represents the sensor data from LoRa
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

// LogPacket includes Status and Timestamp for sending back to frontend
type LogPacket struct {
	DataPacket
	Status    string    `json:"status"` // "SAFE", "CRITICAL", "WARNING"
	Timestamp time.Time `json:"timestamp"`
}

// MessagePacket represents text messages or alerts (separate buffer)
type MessagePacket struct {
	Type      string    `json:"type"` // "message" or "alert"
	NodeID    string    `json:"node_id"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
}

var db *sql.DB

func initDB() {
	var err error
	// Open SQLite database (creates file if not exists)
	db, err = sql.Open("sqlite", "./mining_data.db")
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}

	// Create sensor_logs table
	createSensorTable := `
	CREATE TABLE IF NOT EXISTS sensor_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT,
		temp REAL,
		humidity REAL,
		ax REAL, ay REAL, az REAL,
		x REAL, y REAL, z REAL,
		co_ppm REAL,
		ch4_ppm REAL,
		hazardous_ppm REAL,
		rfid TEXT,
		status TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
	);`
	if _, err := db.Exec(createSensorTable); err != nil {
		log.Fatal("Failed to create sensor_logs table:", err)
	}

	// Create alert_logs table for warnings/messages
	createAlertTable := `
	CREATE TABLE IF NOT EXISTS alert_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT,
		type TEXT,
		message TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
	);`
	if _, err := db.Exec(createAlertTable); err != nil {
		log.Fatal("Failed to create alert_logs table:", err)
	}

	fmt.Println("Database initialized successfully.")
}

func logSensorData(data DataPacket, status string) {
	stmt, err := db.Prepare(`
		INSERT INTO sensor_logs(
			node_id, temp, humidity, ax, ay, az, x, y, z, 
			co_ppm, ch4_ppm, hazardous_ppm, rfid, status
		) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		log.Println("Error preparing sensor insert:", err)
		return
	}
	defer stmt.Close()

	_, err = stmt.Exec(
		data.NodeID, data.Temp, data.Humidity,
		data.AX, data.AY, data.AZ,
		data.X, data.Y, data.Z,
		data.COPPM, data.CH4PPM, data.HazardousPPM,
		data.RFID, status,
	)
	if err != nil {
		log.Println("Error inserting sensor data:", err)
	}
}

func logAlert(msg MessagePacket) {
	stmt, err := db.Prepare("INSERT INTO alert_logs(node_id, type, message) VALUES(?, ?, ?)")
	if err != nil {
		log.Println("Error preparing alert insert:", err)
		return
	}
	defer stmt.Close()

	_, err = stmt.Exec(msg.NodeID, msg.Type, msg.Content)
	if err != nil {
		log.Println("Error inserting alert:", err)
	}
}

// Simple logic to determine status
func evaluateStatus(data DataPacket) string {
	if data.HazardousPPM > 50 || data.CH4PPM > 5 || data.COPPM > 100 {
		return "CRITICAL"
	}
	if data.Temp > 45 || data.Humidity > 90 {
		return "WARNING"
	}
	return "SAFE"
}

// WebSocket Upgrader
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all connections
	},
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Error upgrading:", err)
		return
	}
	defer conn.Close()
	fmt.Println("New Client Connected")

	for {
		// Read message
		_, p, err := conn.ReadMessage()
		if err != nil {
			log.Println("Read error:", err)
			break
		}

		// Try to unmarshal as DataPacket (Sensor Data)
		var sensorData DataPacket
		// We assume if 'node_id' and 'temp' exist, it's sensor data
		if err := json.Unmarshal(p, &sensorData); err == nil && sensorData.NodeID != "" {
			// Evaluate status
			status := evaluateStatus(sensorData)

			// Log to DB
			logSensorData(sensorData, status)

			// If critical, also log as alert
			if status == "CRITICAL" {
				alert := MessagePacket{
					Type:      "alert",
					NodeID:    sensorData.NodeID,
					Content:   fmt.Sprintf("Critical levels detected! CO: %.2f, CH4: %.2f", sensorData.COPPM, sensorData.CH4PPM),
					Timestamp: time.Now(),
				}
				logAlert(alert)
			}

			// Send back to frontend with status
			response := LogPacket{
				DataPacket: sensorData,
				Status:     status,
				Timestamp:  time.Now(),
			}
			out, _ := json.Marshal(response)
			conn.WriteMessage(websocket.TextMessage, out)
			continue
		}

		// Try to unmarshal as MessagePacket (Chat/Alert)
		var msgData MessagePacket
		if err := json.Unmarshal(p, &msgData); err == nil && msgData.Content != "" {
			if msgData.Type == "" {
				msgData.Type = "message"
			}
			logAlert(msgData)

			// Echo back
			out, _ := json.Marshal(msgData)
			conn.WriteMessage(websocket.TextMessage, out)
			continue
		}

		log.Printf("Received raw message: %s", p)
	}
}

func main() {
	// Initialize Database
	initDB()

	// Serve static files from "public"
	fs := http.FileServer(http.Dir("./public"))
	http.Handle("/", fs)

	// WebSocket endpoint
	http.HandleFunc("/ws", handleWebSocket)

	port := ":8080"
	fmt.Printf("Server starting on port %s...\n", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal(err)
	}
}
