#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>
#include <MFRC522.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include "packet.h"

#define LORA_SS 15
#define RFID_SS 5
#define BUZZER_PIN 13

DHT dht(4, DHT11);
MFRC522 rfid(RFID_SS, 27);
LoraDataPacket dataPacket;
bool alarmActive = false;
unsigned long lastUpdate = 0;

void enableLoRa() { digitalWrite(RFID_SS, HIGH); digitalWrite(LORA_SS, LOW); }
void enableRFID() { digitalWrite(LORA_SS, HIGH); digitalWrite(RFID_SS, LOW); }

void setup() {
    Serial.begin(115200);
    Serial2.begin(115200, SERIAL_8N1, 16, 17); 
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LORA_SS, OUTPUT);
    pinMode(RFID_SS, OUTPUT);
    
    SPI.begin(18, 19, 23);
    dht.begin();
    enableLoRa();
    LoRa.setPins(15, 14, 2);
    LoRa.begin(433E6);
    LoRa.setSyncWord(0xF3);
    enableRFID();
    rfid.PCD_Init();
}

void loop() {
    // 1. Check for messages coming from the Web module
    if (Serial2.available()) {
        String incoming = Serial2.readStringUntil('\n');
        strncpy(dataPacket.message, incoming.c_str(), 30);
    }

    // 2. Standard LoRa / Command check
    enableLoRa();
    int pSize = LoRa.parsePacket();
    if (pSize == sizeof(LoraCommandPacket)) {
        LoraCommandPacket cmd;
        LoRa.readBytes((uint8_t*)&cmd, sizeof(cmd));
        if (cmd.cmd_type == 1) alarmActive = !alarmActive;
        if (cmd.cmd_type == 3) { alarmActive = true; delay(200); alarmActive = false; }
    }

    if (millis() - lastUpdate > 1000) {
        // Read sensors as before
        dataPacket.temp = dht.readTemperature();
        dataPacket.hum = dht.readHumidity();
        dataPacket.co_ppm = analogRead(25) / 10.0;
        dataPacket.ch4_ppm = analogRead(26) / 10.0;
        dataPacket.hazardous_ppm = dataPacket.co_ppm + dataPacket.ch4_ppm;
        dataPacket.buzzer_status = alarmActive;
        digitalWrite(BUZZER_PIN, alarmActive ? HIGH : LOW);

        enableLoRa();
        LoRa.beginPacket();
        LoRa.write((uint8_t*)&dataPacket, sizeof(dataPacket));
        LoRa.endPacket();
        LoRa.receive();

        // 3. Send ALL data to Go Backend via Web Module
        StaticJsonDocument<512> doc;
        doc["node_id"] = "Miner-01";
        doc["temp"] = dataPacket.temp;
        doc["humidity"] = dataPacket.hum;
        doc["co_ppm"] = dataPacket.co_ppm;
        doc["ch4_ppm"] = dataPacket.ch4_ppm;
        doc["hazardous_ppm"] = dataPacket.hazardous_ppm;
        doc["buzzer_status"] = dataPacket.buzzer_status;
        doc["msg"] = dataPacket.message;
        serializeJson(doc, Serial2);
        Serial2.println();
        
        lastUpdate = millis();
    }
}