/**
 * 🟣 BRIDGE ESP32 - RECEIVER & SERIAL GATEWAY
 * Upload this to the ESP32 connected to the PC.
 * 
 * UPDATE: Fixed Smoothed Accelerometer + Auto-Calibration.
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

// --- FILTERING GLOBALS ---
float f_temp = 0, f_hum = 0, f_co = 0, f_ch4 = 0, f_hz = 0;
float f_ax = 0, f_ay = 0, f_az = 0; // Added Accel Smoothing vars
bool firstPacket = true;

// --- CALIBRATION GLOBALS ---
bool isCalibrated = false;
int calSampleCount = 0;
const int CALIBRATION_SAMPLES = 50; // Number of packets to average for baseline

float offset_ax = 0, offset_ay = 0; // Don't calibrate Z (Gravity)
float offset_co = 0, offset_ch4 = 0; // Assume clean air start

float sum_ax = 0, sum_ay = 0, sum_co = 0, sum_ch4 = 0;

void setup() {
    Serial.begin(115200);
    SPI.begin(18, 19, 23);
    LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

    if (!LoRa.begin(433E6)) {
        while (1);
    }
    LoRa.setSyncWord(0xF3);
    Serial.println("Calibrating Sensor Baselines... Please wait.");
}

void loop() {
    int packetSize = LoRa.parsePacket();
    if (packetSize == sizeof(LoraDataPacket)) {
        LoRa.readBytes((uint8_t*)&rData, sizeof(rData));

        // --- 0. CALIBRATION ROUTINE ---
        if (!isCalibrated) {
            sum_ax += rData.ax;
            sum_ay += rData.ay;
            sum_co += rData.co_ppm;
            sum_ch4 += rData.ch4_ppm;
            calSampleCount++;

            if (calSampleCount >= CALIBRATION_SAMPLES) {
                offset_ax = sum_ax / CALIBRATION_SAMPLES;
                offset_ay = sum_ay / CALIBRATION_SAMPLES;
                offset_co = sum_co / CALIBRATION_SAMPLES;
                offset_ch4 = sum_ch4 / CALIBRATION_SAMPLES;
                isCalibrated = true;
            }
        }

        // --- 1. APPLY OFFSETS (If Calibrated) ---
        float final_ax = rData.ax;
        float final_ay = rData.ay;
        
        if (isCalibrated) {
            rData.co_ppm -= offset_co;
            rData.ch4_ppm -= offset_ch4;
            final_ax -= offset_ax;
            final_ay -= offset_ay;
        }

        // --- 2. CLAMPING (Fix Negatives) ---
        if (rData.co_ppm < 0) rData.co_ppm = 0.0;
        if (rData.ch4_ppm < 0) rData.ch4_ppm = 0.0;
        if (rData.hazardous_ppm < 0) rData.hazardous_ppm = 0.0;
        if (rData.hum < 0) rData.hum = 0.0;

        // --- 3. SMOOTHING (Exponential Moving Average) ---
        float alpha = 0.05; // Very Strong Smoothing

        if (firstPacket) {
            f_temp = rData.temp;
            f_hum = rData.hum;
            f_co = rData.co_ppm;
            f_ch4 = rData.ch4_ppm;
            f_hz = rData.hazardous_ppm;
            
            // Init Accel Filters
            f_ax = final_ax;
            f_ay = final_ay;
            f_az = rData.az;
            
            firstPacket = false;
        } else {
            f_temp = (f_temp * (1.0 - alpha)) + (rData.temp * alpha);
            f_hum  = (f_hum  * (1.0 - alpha)) + (rData.hum  * alpha);
            f_co   = (f_co   * (1.0 - alpha)) + (rData.co_ppm * alpha);
            f_ch4  = (f_ch4  * (1.0 - alpha)) + (rData.ch4_ppm * alpha);
            f_hz   = (f_hz   * (1.0 - alpha)) + (rData.hazardous_ppm * alpha);
            
            // SMOOTH ACCEL
            f_ax = (f_ax * (1.0 - alpha)) + (final_ax * alpha);
            f_ay = (f_ay * (1.0 - alpha)) + (final_ay * alpha);
            f_az = (f_az * (1.0 - alpha)) + (rData.az * alpha);
        }

        // --- 4. OUTPUT JSON ---
        // ACCEL DEADZONE: If < 0.15g change, ignore it (show 0.0)
        // Uses SMOOTHED values (f_ax/f_ay/f_az)
        float out_ax = fabs(f_ax);
        float out_ay = fabs(f_ay);
        float out_az = fabs(f_az); // Z is usually ~1.0

        if (out_ax < 0.15) out_ax = 0.0;
        if (out_ay < 0.15) out_ay = 0.0;
        // Don't deadzone Z

        Serial.print("{");
        Serial.printf("\"node_id\":\"%s\",", rData.node_id);
        Serial.printf("\"temp\":%.2f,\"humidity\":%.2f,", f_temp, f_hum);
        // OUTPUT filter values
        Serial.printf("\"ax\":%.2f,\"ay\":%.2f,\"az\":%.2f,", out_ax, out_ay, out_az); 
        Serial.printf("\"co_ppm\":%.2f,\"ch4_ppm\":%.2f,", f_co, f_ch4); 
        Serial.printf("\"hazardous_ppm\":%.2f,", f_hz);
        Serial.printf("\"rfid\":\"%s\",", rData.rfid_tag);
        Serial.printf("\"buzzer\":%s,", rData.buzzer_status ? "true" : "false");
        
        if (!isCalibrated) {
             Serial.printf("\"message\":\"Calibrating Sensor...\"");
        } else {
             Serial.printf("\"message\":\"%s\"", rData.message);
        }
        Serial.println("}");
}
