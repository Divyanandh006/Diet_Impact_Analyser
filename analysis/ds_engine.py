"""
analysis/ds_engine.py
Advanced Data Science Engine for the Diet Impact Analyser.
Handles predictive modeling, classification, and statistical insights.
"""

import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from datetime import datetime, timedelta

def classify_diet_type(macros: dict) -> str:
    """
    Classifies the diet based on macronutrient percentages.
    macros: { protein_pct, fat_pct, carb_pct }
    """
    p, f, c = macros.get('protein_pct', 0), macros.get('fat_pct', 0), macros.get('carb_pct', 0)
    
    if f > 60 and c < 10:
        return "Keto / High Fat"
    if p > 35:
        return "High Protein / Muscle Building"
    if c > 60:
        return "High Carb / Energy Focused"
    if 20 <= p <= 30 and 20 <= f <= 35 and 45 <= c <= 55:
        return "Balanced / Mediterranean"
    return "Mixed / General"

def predict_weight_trend(history_logs: list, current_weight: float, tdee: float) -> list:
    """
    Uses a simple energy balance model to predict weight trends.
    3500 kcal surplus/deficit ~= 0.45kg (1 lb) change.
    Returns a list of predicted weights for the next 7 days.
    """
    if not history_logs or not current_weight or not tdee:
        return []

    # Calculate average daily surplus/deficit from last 7 logs (or available)
    recent_logs = history_logs[-7:]
    deficits = [log.get('total_calories', tdee) - tdee for log in recent_logs]
    avg_daily_diff = np.mean(deficits) if deficits else 0

    predictions = []
    temp_weight = current_weight
    
    for i in range(1, 8):
        # Weight change in kg: (diff / 3500) * 0.45
        weight_change = (avg_daily_diff / 3500) * 0.453592
        temp_weight += weight_change
        predictions.append({
            "day": (datetime.now() + timedelta(days=i)).strftime("%Y-%m-%d"),
            "weight": round(temp_weight, 2)
        })
    
    return predictions

def get_statistical_insights(history_logs: list) -> dict:
    """
    Computes statistical correlations and trends.
    """
    if len(history_logs) < 3:
        return {"status": "insufficient_data", "message": "Log at least 3 days to see insights."}

    df = pd.DataFrame(history_logs)
    
    # Correlation between sugar and health score
    corr_sugar_health = 0
    if 'total_sugar_g' in df.columns and 'health_score' in df.columns:
        corr_sugar_health = df['total_sugar_g'].corr(df['health_score'])

    # Trend in health score
    health_trend = "stable"
    if len(df) >= 5:
        recent = df['health_score'].tail(5).values
        x = np.arange(len(recent)).reshape(-1, 1)
        model = LinearRegression().fit(x, recent)
        slope = model.coef_[0]
        if slope > 0.5: health_trend = "improving"
        elif slope < -0.5: health_trend = "declining"

    return {
        "status": "success",
        "sugar_health_correlation": round(float(corr_sugar_health), 2),
        "health_score_trend": health_trend,
        "avg_health_score": round(float(df['health_score'].mean()), 1),
        "max_calories": int(df['total_calories'].max()),
        "consistency_score": round(float(100 - df['total_calories'].std() / df['total_calories'].mean() * 100), 1) if df['total_calories'].mean() > 0 else 0
    }

def detect_anomalies(history_logs: list) -> list:
    """
    Detects 'unusual' days using Z-score (simple anomaly detection).
    """
    if len(history_logs) < 7:
        return []

    df = pd.DataFrame(history_logs)
    cals = df['total_calories']
    mean = cals.mean()
    std = cals.std()
    
    anomalies = []
    if std > 0:
        df['z_score'] = (df['total_calories'] - mean) / std
        outliers = df[abs(df['z_score']) > 1.5] # 1.5 std dev for 'unusual'
        for _, row in outliers.iterrows():
            anomalies.append({
                "date": row['date'],
                "calories": int(row['total_calories']),
                "reason": "Significantly " + ("higher" if row['z_score'] > 0 else "lower") + " than your average."
            })
            
    return anomalies
