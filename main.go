package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

// Configure the upgrader
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all connections for now
	},
}

// Handle WebSocket connections
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Error upgrading connection:", err)
		return
	}
	defer conn.Close()

	fmt.Println("New Client Connected")

	// Simple echo loop for testing
	for {
		messageType, p, err := conn.ReadMessage()
		if err != nil {
			log.Println("Error reading message:", err)
			break
		}
		log.Printf("Received: %s", p)

		if err := conn.WriteMessage(messageType, p); err != nil {
			log.Println("Error writing message:", err)
			break
		}
	}
}

// Simple HTTP handler
func handleHome(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Welcome to the Mining Safety Monitor API")
}

func main() {
	// Define routes
	http.HandleFunc("/", handleHome)
	http.HandleFunc("/ws", handleWebSocket)

	// Start server
	port := ":8080"
	fmt.Printf("Server starting on port %s...\n", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
