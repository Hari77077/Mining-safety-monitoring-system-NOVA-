#ifndef PACKET_H
#define PACKET_H

struct LoraDataPacket {
    char node_id[10];
    float temp;
    float hum;
    float ax;
    float ay;
    float az;
    float co_ppm;
    float ch4_ppm;
    float hazardous_ppm; // Changed to FLOAT to prevent "10 million" garbage
    char rfid_tag[20];
    bool buzzer_status;
    char message[50];
};

struct LoraCommandPacket {
    int cmd_type;
    char sender_id[10];
};

#endif
