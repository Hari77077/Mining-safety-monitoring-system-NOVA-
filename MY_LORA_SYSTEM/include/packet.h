#ifndef PACKET_H
#define PACKET_H
#include <Arduino.h>

typedef struct __attribute__((packed)) {
    char node_id[10];     
    float temp; float hum;
    float co_ppm; float ch4_ppm; float hazardous_ppm; 
    float ax; float ay; float az;
    char rfid_tag[12];    
    bool buzzer_status;   
    char message[30];     
} LoraDataPacket;

typedef struct __attribute__((packed)) {
    uint8_t cmd_type; 
    char sender_id[10];   
} LoraCommandPacket;
#endif
