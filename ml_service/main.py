from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import pandas as pd
import numpy as np
import os

app = FastAPI(title="NOVA ML Service", version="2.0")

# Load Models (Global state)
models = {}

@app.on_event("startup")
def load_models():
    model_dir = "models"
    try:
        models['wet_bulb'] = joblib.load(os.path.join(model_dir, "wet_bulb_model.joblib"))
        models['explosion'] = joblib.load(os.path.join(model_dir, "explosion_model.joblib"))
        models['safety'] = joblib.load(os.path.join(model_dir, "safety_model.joblib"))
        models['scaler'] = joblib.load(os.path.join(model_dir, "safety_scaler.joblib"))
        print("✅ All models loaded successfully!")
    except Exception as e:
        print(f"❌ Error loading models: {e}")

class SensorData(BaseModel):
    temperature: float
    humidity: float
    co_ppm: float
    ch4_ppm: float
    vibration: float # New field

@app.get("/health")
def health_check():
    return {"status": "running", "models_loaded": list(models.keys())}

@app.post("/predict")
def predict(data: SensorData):
    if not models:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    # 1. Prediction: Wet Bulb (Input: Temp, Hum)
    wb_input = pd.DataFrame({'Temperature': [data.temperature], 'Humidity': [data.humidity]})
    wet_bulb = models['wet_bulb'].predict(wb_input)[0]

    # 2. Prediction: Explosion Risk (Input: CH4, Vib)
    # Note: Model expects features "MQ4", "Vibration"
    exp_input = pd.DataFrame({'MQ4': [data.ch4_ppm], 'Vibration': [data.vibration]})
    explosion_risk_class = models['explosion'].predict(exp_input)[0]
    # Get probability of class 1
    explosion_prob = models['explosion'].predict_proba(exp_input)[0][1]
    
    # Convert prediction to text based on logic + model
    explosion_text = "HIGH" if explosion_prob > 0.5 or data.ch4_ppm > 500 else "LOW" # Fail-safe

    # 3. Prediction: Safety Score (Input: All 5)
    # Features: 'Temperature', 'Humidity', 'MQ135', 'MQ4', 'Vibration'
    safe_input = pd.DataFrame({
        'Temperature': [data.temperature], 
        'Humidity': [data.humidity], 
        'MQ135': [data.co_ppm], 
        'MQ4': [data.ch4_ppm], 
        'Vibration': [data.vibration]
    })
    
    # Scale input
    safe_input_scaled = models['scaler'].transform(safe_input)
    safety_score = models['safety'].predict(safe_input_scaled)[0]
    
    # Clip
    safety_score = max(0, min(100, safety_score))

    return {
        "wet_bulb_prob": round(wet_bulb, 2), # Returning value in C, frontend treats as %. Actually it's C.
        # User prompt said "Wet Bulb Probability" but defined formula for Wet Bulb Temp in Celsius.
        # I'll treat it as "Wet Bulb Temperature" but frontend likely expects a risk %?
        # Re-reading prompt: "Wet Bulb (Real Physics Formula)". Stull gives Temp in C.
        # Frontend expects "wet_bulb_prob" (float). If I send 25.5, it shows "25.5%".
        # I should probably map it to a risk probability?
        # WBGT > 32 is extreme risk. > 28 is high.
        # Let's return the RAW value and let frontend display "25C".
        # Wait, frontend `dashboard.js`: `document.getElementById('wetBulb').textContent = ... + '%'`
        # It adds a %.
        # I should convert WB Temp to a "Risk Probability" 0-100%?
        # Logic: 20C = 0%, 35C = 100%.
        # wb_prob = (wb - 20) / 15 * 100 ?
        # I'll do that to match frontend expectation.
        
        "wet_bulb_val": round(wet_bulb, 2), # Raw value for debug
        "wet_bulb_risk_percent": round(max(0, min(100, (wet_bulb - 20) / 15 * 100)), 1),
        
        # Override wet_bulb_prob logic to match frontend expectations
        "wet_bulb_prob": round(max(0, min(100, (wet_bulb - 20) / 15 * 100)), 1),

        "explosion_risk": explosion_text,     # "LOW", "HIGH"
        "explosion_prob": round(explosion_prob, 2),
        "safety_score": int(safety_score)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
