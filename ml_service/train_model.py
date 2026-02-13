import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBClassifier
from sklearn.neural_network import MLPRegressor
from sklearn.metrics import accuracy_score, mean_squared_error, r2_score
import os

# Create directory if not exists
os.makedirs("models", exist_ok=True)

print("🚀 Generating Synthetic Mining Data...")

# 1. Generate Realistic Synthetic Data
n_samples = 5000
np.random.seed(42)

# Temperature: Normal dist around 28C, with some hot/cold days
temp = np.random.normal(28, 5, n_samples)
# Humidity: Normal dist around 65%, clipped 20-100
humidity = np.clip(np.random.normal(65, 15, n_samples), 20, 100)
# CO (MQ135): Mostly low, with exponential spikes (log-normal)
co = np.random.lognormal(2, 0.8, n_samples) # Mode ~7, Tail -> 100+
# Methane (MQ4): Mostly near 0, rare spikes
ch4 = np.random.exponential(50, n_samples) # Mean 50, but mostly low
# Vibration: Normal operations (low), blasting/machinery (high)
vib = np.concatenate([
    np.random.normal(10, 5, int(n_samples*0.9)), # 90% normal
    np.random.normal(85, 10, int(n_samples*0.1)) # 10% high vibration events
])
np.random.shuffle(vib)

df = pd.DataFrame({
    'Temperature': temp,
    'Humidity': humidity,
    'MQ135': co,
    'MQ4': ch4,
    'Vibration': vib
})

# ---------------------------------------------------------
# GOAL 1: CALCULATE WET BULB (Real Physics Formula)
# ---------------------------------------------------------
# Stull Formula
def calculate_wet_bulb(T, RH):
    return T * np.arctan(0.151977 * (RH + 8.313659)**0.5) + \
           np.arctan(T + RH) - \
           np.arctan(RH - 1.676331) + \
           0.00391838 * (RH**1.5) * np.arctan(0.023101 * RH) - 4.686035

df['Wet_Bulb'] = calculate_wet_bulb(df['Temperature'], df['Humidity'])

# ---------------------------------------------------------
# GOAL 2: CALCULATE EXPLOSION RISK (Logic Rule)
# ---------------------------------------------------------
# Risk = 1 if (CH4 > 300 AND Vibration > 50) OR (CH4 > 1000)
# This creates a binary classification target
explosion_risk = []
for i, row in df.iterrows():
    risk = 0
    if row['MQ4'] > 1000: # Guaranteed explosion level
        risk = 1
    elif row['MQ4'] > 300 and row['Vibration'] > 50: # Gas + Spark
        risk = 1
    explosion_risk.append(risk)

df['Explosion_Risk'] = explosion_risk

# ---------------------------------------------------------
# GOAL 3: SAFETY SCORE (Weighted Formula)
# ---------------------------------------------------------
# 100 is perfect. Penalties for unsafe conditions.
# Using slightly more complex penalties for "realism"
safety_score = 100 - (
    (df['MQ135'] / 2) +           # CO penalty
    (df['MQ4'] / 10) +            # CH4 penalty
    (df['Vibration'] / 3) +       # Vibration penalty
    (abs(df['Wet_Bulb'] - 20) * 1.5) # Heat stress penalty
)
df['Safety_Score'] = safety_score.clip(0, 100)

print(f"📊 Dataset Created: {df.shape}")
df.to_csv("mining_training_data_synthetic.csv", index=False)

# ---------------------------------------------------------
# MODEL TRAINING
# ---------------------------------------------------------

# A. Wet Bulb (Regression) -> RandomForest
X_wb = df[['Temperature', 'Humidity']]
y_wb = df['Wet_Bulb']
X_train, X_test, y_train, y_test = train_test_split(X_wb, y_wb, test_size=0.2)

rf = RandomForestRegressor(n_estimators=100, random_state=42)
rf.fit(X_train, y_train)
y_pred = rf.predict(X_test)
print(f"🌡️ Wet Bulb Model (RF) MSE: {mean_squared_error(y_test, y_pred):.4f}")
joblib.dump(rf, "models/wet_bulb_model.joblib")

# B. Explosion Risk (Classification) -> XGBoost
X_exp = df[['MQ4', 'Vibration']]
y_exp = df['Explosion_Risk']
X_train, X_test, y_train, y_test = train_test_split(X_exp, y_exp, test_size=0.2)

xgb = XGBClassifier(use_label_encoder=False, eval_metric='logloss')
xgb.fit(X_train, y_train)
y_pred = xgb.predict(X_test)
print(f"💥 Explosion Model (XGB) Accuracy: {accuracy_score(y_test, y_pred):.4f}")
joblib.dump(xgb, "models/explosion_model.joblib")

# C. Safety Score (Regression) -> MLP (Neural Net)
X_safe = df[['Temperature', 'Humidity', 'MQ135', 'MQ4', 'Vibration']]
y_safe = df['Safety_Score']
X_train, X_test, y_train, y_test = train_test_split(X_safe, y_safe, test_size=0.2)

# Normalizing inputs is crucial for Neural Networks
from sklearn.preprocessing import StandardScaler
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Save the scaler! We need it for inference
joblib.dump(scaler, "models/safety_scaler.joblib")

mlp = MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=500, random_state=42)
mlp.fit(X_train_scaled, y_train)
y_pred = mlp.predict(X_test_scaled)
print(f"🛡️ Safety Score Model (MLP) R2 Score: {r2_score(y_test, y_pred):.4f}")
joblib.dump(mlp, "models/safety_model.joblib")

print("✅ All models trained and saved to 'models/' directory!")
