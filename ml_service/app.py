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
    # Normalize inputs
    p_ch4 = min(ch4 / 5.0, 1.0) 
    p_co = min(co / 300.0, 1.0)
    p_temp = min(max(temp - 30, 0) / 50.0, 1.0)
    
    risk_prob = (p_ch4 * 0.6) + (p_co * 0.3) + (p_temp * 0.1)
    
    risk_level = "LOW"
    if risk_prob > 0.8: risk_level = "CRITICAL"
    elif risk_prob > 0.5: risk_level = "HIGH"
    elif risk_prob > 0.2: risk_level = "MEDIUM"
        
    return risk_level, min(risk_prob, 0.99)

def calculate_safety_score(data):
    score = 100
    
    # 1. Gas Penalties (Linear & Accumulative)
    co = data.get('co_ppm', 0)
    ch4 = data.get('ch4_ppm', 0)
    haz = data.get('hazardous_ppm', 0)
    
    score -= (co * 0.8)  # 50ppm -> -40 pts
    score -= (ch4 * 15.0) # 2% -> -30 pts
    score -= (haz * 0.5)
    
    # 2. Environmental Penalties
    temp = data.get('temp', 0)
    hum = data.get('humidity', 0)
    
    wbgt = temp * 0.7 + (hum * 0.1)
    if wbgt > 28: score -= (wbgt - 28) * 5  # Heat stress penalty

    # 3. Accelerometer (Fall/Impact)
    # Norm-G (Assume 1G is normal. <0.5 is freefall, >2.5 is crash)
    ax = data.get('ax', 0)
    ay = data.get('ay', 0)
    az = data.get('az', 1.0)
    g_force = (ax**2 + ay**2 + az**2) ** 0.5
    
    if g_force < 0.5: # Free fall
        score -= 50
    if g_force > 3.0: # Impact
        score -= 40

    # 4. Critical Overrides (Safety Net)
    # If ANY metric is critical, Maximum Score is capped at 40.
    is_critical = False
    if co > 50 or ch4 > 2.5 or haz > 50 or g_force < 0.5:
        is_critical = True
        
    if is_critical and score > 40:
        score = 40
        
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
