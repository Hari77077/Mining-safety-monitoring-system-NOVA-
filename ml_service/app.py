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
    score -= min(data.get('co_ppm', 0) / 2.0, 30)
    score -= min(data.get('ch4_ppm', 0) * 5.0, 40)
    
    if data.get('temp', 0) > 40: score -= 10
    if data.get('humidity', 0) > 90: score -= 5
    if data.get('hazardous_ppm', 0) > 20: score -= 15
    
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
