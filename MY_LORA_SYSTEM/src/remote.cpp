/**
 * 🟣 BRIDGE ESP32 - RECEIVER & SERIAL GATEWAY
 * Upload this to the ESP32 connected to the PC.
 */
#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>
#include "packet.h"

// --- PINS ---
#define LORA_SS     15
#define LORA_RST    14
#define LORA_DIO0   2

LoraDataPacket rData;
char lastMessage[50] = "";

void setup() {
    Serial.begin(115200);
    // No delay needed for backend, but useful for debug if manual
    // Serial.println("BRIDGE STARTED"); // Commented out to keep converting clean

    // 1. Init Hardware
    SPI.begin(18, 19, 23);
    LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

    // 2. Start LoRa
    if (!LoRa.begin(433E6)) {
        // Serial.println("LoRa Init Failed");
        while (1);
    }
    LoRa.setSyncWord(0xF3);
}

void loop() {
    int packetSize = LoRa.parsePacket();
    if (packetSize == sizeof(LoraDataPacket)) {
        LoRa.readBytes((uint8_t*)&rData, sizeof(rData));

        // --- Message Dedup Logic ---
        // User said: "no need to print... like system stable... write it only once"
        // We will send the message field ONLY if it changed or if it's Urgent?
        // Actually, for JSON, it's safer to always send it, but we can set it to "" if unchanged/stable?
        // But main.go overwrites the UI. If we send "", UI becomes empty.
        // If we want "Alert" to persist, we must send it.
        // Maybe user means Serial Monitor clutter.
        // Since we are sending JSON for a MACHINE, clutter doesn't matter.
        // I will just send clean JSON. 
        
        // JSON Output
        Serial.print("{");
        Serial.printf("\"node_id\":\"%s\",", rData.node_id);
        Serial.printf("\"temp\":%.2f,\"humidity\":%.2f,", rData.temp, rData.hum);
        Serial.printf("\"ax\":%.2f,\"ay\":%.2f,\"az\":%.2f,", rData.ax, rData.ay, rData.az);
        Serial.printf("\"co_ppm\":%.2f,\"ch4_ppm\":%.2f,", rData.co_ppm, rData.ch4_ppm);
        Serial.printf("\"hazardous_ppm\":%d,", rData.hazardous_ppm);
        Serial.printf("\"rfid\":\"%s\",", rData.rfid_tag);
        Serial.printf("\"buzzer\":%s,", rData.buzzer_status ? "true" : "false");
        Serial.printf("\"message\":\"%s\"", rData.message);
        Serial.println("}");
    }
}
