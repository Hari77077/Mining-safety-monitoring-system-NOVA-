#include <Arduino.h>
#include <WiFi.h>
#include <AsyncTCP.h>          // Explicitly required for ESP32
#include <ESPAsyncWebServer.h>
#include <vector>

AsyncWebServer server(80);
std::vector<String> msgHistory; // Buffer for 5 messages

void setup() {
    Serial.begin(115200);   // To PC (Go Backend)
    Serial2.begin(115200, SERIAL_8N1, 16, 17); // To Bridge

    WiFi.softAP("Mine-Gateway", "safety123");

    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
        String html = "<html><body style='font-family:sans-serif;'><h2>Miner Chat</h2>";
        html += "<form action='/msg' method='POST'>Msg: <input name='m'><input type='submit'></form>";
        html += "<h3>Recent Logs:</h3><ul>";
        for(auto const& m : msgHistory) { html += "<li>" + m + "</li>"; }
        html += "</ul></body></html>";
        request->send(200, "text/html", html);
    });

    server.on("/msg", HTTP_POST, [](AsyncWebServerRequest *request){
        if (request->hasParam("m", true)) {
            String m = request->getParam("m", true)->value();
            if(msgHistory.size() >= 5) msgHistory.erase(msgHistory.begin());
            msgHistory.push_back(m);
            Serial2.println(m); // Send to Bridge for LoRa broadcast
        }
        request->redirect("/");
    });

    server.begin();
}

void loop() {
    // Transparent bridge for JSON telemetry (Go Backend <-> Bridge)
    if (Serial2.available()) Serial.write(Serial2.read());
    if (Serial.available()) Serial2.write(Serial.read());
}