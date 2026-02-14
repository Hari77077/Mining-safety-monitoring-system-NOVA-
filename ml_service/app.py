from flask import Flask, request, jsonify
import numpy as np

app = Flask(__name__)

# --- Heuristic Models (Placeholders for Real ML) ---

def predict_wet_bulb(temp, humidity):
    # Simplified WBGT approximation
    wbgt = temp * 0.7 + (humidity * 0.1) 
    
    if wbgt > 32: return 0.95
    if wbgt > 30: return 0.80
    if wbgt > 28: return 0.50
    if wbgt > 25: return 0.20
    return 0.05

def predict_explosion_risk(ch4, co, temp):
    # Standard: LEL of Methane is 5.0% Vol.
    # 1.0% = 20% LEL (Warning)
    # 2.5% = 50% LEL (Critical/Evacuate)
    
    # Normalize inputs for probability calc (0-1)
    p_ch4 = min(ch4 / 5.0, 1.0) 
    p_co = min(co / 300.0, 1.0)
    p_temp = min(max(temp - 30, 0) / 50.0, 1.0)
    
    # Weighted Probability
    risk_prob = (p_ch4 * 0.7) + (p_co * 0.2) + (p_temp * 0.1)
    
    risk_level = "LOW"
    # Strict Thresholds based on Methane Vol %
    # Demo Mode: Lowered for easier triggering
    risk_level = "LOW"
    # Strict Thresholds based on Methane Vol %
    # EVALUATION FIX: Raised to > 2.5% to prevent fluctuation alarms
    if ch4 > 2.5 or co > 50:
        risk_level = "CRITICAL"
        risk_prob = max(risk_prob, 0.95) # Force high prob
    elif ch4 > 1.0 or co > 30:
        risk_level = "HIGH" # Warning Zone
        risk_prob = max(risk_prob, 0.60)
    elif ch4 > 0.5:
        risk_level = "MEDIUM"
        
    return risk_level, min(risk_prob, 0.99)

def calculate_safety_score(data):
    score = 100
    
    # 1. Gas Penalties (Linear & Accumulative)
    co = data.get('co_ppm', 0)
    ch4 = data.get('ch4_ppm', 0)
    haz = data.get('hazardous_ppm', 0)
    
    # CO: 50ppm is limit. 
    score -= (co * 1.0)  # 25ppm -> -25 pts (Warning range)
    
    # CH4: Brutal Penalty in Warning Range (1.0 - 2.5%)
    # 1.3% -> ~70 pt penalty (Score 30 -> Grade F)
    # This warns the user heavily via Score/Grade without triggering Evac Alarm
    score -= (ch4 * 55.0) 
    
    score -= (haz * 0.5)
    
    # 2. Environmental Penalties
    temp = data.get('temp', 0)
    hum = data.get('humidity', 0)
    
    wbgt = temp * 0.7 + (hum * 0.1) 
    if wbgt > 28: score -= (wbgt - 28) * 8  # Heat stress penalty increased

    # 3. Accelerometer (Device Stability / Structural Vibration)
    # Wall Mounted: <0.3 is device fall, >3.0 is explosion shockwave/impact
    ax = data.get('ax', 0)
    ay = data.get('ay', 0)
    az = data.get('az', 1.0)
    g_force = (ax**2 + ay**2 + az**2) ** 0.5
    
    if g_force < 0.3: # Device Fell off wall
        score -= 50
    if g_force > 3.0: # Impact / Shockwave
        score -= 50

    # 4. Critical Overrides (Safety Net)
    # If ANY metric is CRITICAL (Evacuation Level), Maximum Score is 0.
    # 4. Critical Overrides (Safety Net)
    # If ANY metric is CRITICAL (Evacuation Level), Maximum Score is 0.
    is_critical = False
    
    # Methane > 2.0% (Matched to Demo)
    # CO > 40ppm (Matched to Demo)
    # G-Force < 0.5 or > 2.0 (Easier to trigger)
    # Methane > 2.5% (Stable)
    # CO > 50ppm (Stable)
    # G-Force < 0.3 or > 2.5 (Less Sensitive)
    if co > 50 or ch4 > 2.5 or haz > 50 or g_force < 0.3 or g_force > 2.5 or wbgt > 32:
        is_critical = True
        
    if is_critical:
        score = 0
        
    return max(int(score), 0)

# --- API Endpoints ---

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "service": "ML-Service-Python"})

@app.route('/predict/wet-bulb', methods=['POST'])
def wet_bulb():
    data = request.json
    temp = data.get('temp', 25.0)
    humidity = data.get('humidity', 50.0)
    prob = predict_wet_bulb(temp, humidity)
    return jsonify({"probability": prob})

@app.route('/predict/explosion', methods=['POST'])
def explosion():
    data = request.json
    ch4 = data.get('ch4_ppm', 0.0)
    co = data.get('co_ppm', 0.0)
    temp = data.get('temp', 25.0)
    level, prob = predict_explosion_risk(ch4, co, temp)
    return jsonify({"risk_level": level, "probability": prob})

@app.route('/predict/safety-score', methods=['POST'])
def safety_score():
    data = request.json
    score = calculate_safety_score(data)
    return jsonify({"score": score})

@app.route('/predict', methods=['POST'])
def predict_all():
    data = request.json
    # Extract inputs matching main.go payload
    temp = data.get('temperature', 25.0)
    hum = data.get('humidity', 50.0)
    co = data.get('co_ppm', 0.0)
    ch4 = data.get('ch4_ppm', 0.0)
    vib = data.get('vibration', 0.0)
    
    # Calculate predictions
    wb_prob = predict_wet_bulb(temp, hum)
    risk, expl_prob = predict_explosion_risk(ch4, co, temp)
    
    # Map for Safety Score
    score_data = {
        'co_ppm': co,
        'ch4_ppm': ch4,
        'temp': temp,
        'humidity': hum,
        'hazardous_ppm': 0, 
        'ax': vib, # Proxy vibration as acceleration magnitude
        'ay': 0,
        'az': 0
    }
    score = calculate_safety_score(score_data)
    
    return jsonify({
        "wet_bulb_prob": wb_prob,
        "explosion_risk": risk,
        "explosion_prob": expl_prob,
        "safety_score": score
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
