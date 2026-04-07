"""
analysis/diet_analyser.py
Core data analysis module using Pandas and NumPy.
Handles all nutritional calculations and comparisons.
"""

import pandas as pd
import numpy as np
import os

# ─────────────────────────────────────────────
# Recommended Daily Intake (RDI) values
# Based on general adult guidelines (2000 kcal diet)
# ─────────────────────────────────────────────
RECOMMENDED_DAILY_INTAKE = {
    "calories":    2000,   # kcal
    "protein_g":    50,    # grams
    "fat_g":        65,    # grams
    "carbs_g":     300,    # grams
    "fiber_g":      25,    # grams
    "sugar_g":      50,    # grams
    "sodium_mg":  2300,    # milligrams
    "vitamin_c_mg": 90,    # milligrams
    "calcium_mg":  1000,   # milligrams
    "iron_mg":      18,    # milligrams
}

# Nutrient display names for the UI
NUTRIENT_LABELS = {
    "calories":     "Calories (kcal)",
    "protein_g":    "Protein (g)",
    "fat_g":        "Total Fat (g)",
    "carbs_g":      "Carbohydrates (g)",
    "fiber_g":      "Dietary Fiber (g)",
    "sugar_g":      "Sugar (g)",
    "sodium_mg":    "Sodium (mg)",
    "vitamin_c_mg": "Vitamin C (mg)",
    "calcium_mg":   "Calcium (mg)",
    "iron_mg":      "Iron (mg)",
}

# ─────────────────────────────────────────────
# Load dataset once at module level
# ─────────────────────────────────────────────
DATA_PATH = os.path.join(os.path.dirname(__file__), "../data/nutrition_data.csv")

def load_dataset() -> pd.DataFrame:
    """Load nutrition CSV into a Pandas DataFrame."""
    df = pd.read_csv(DATA_PATH)
    # Standardise food names for easier lookup
    df["food_name_lower"] = df["food_name"].str.lower().str.strip()
    return df

NUTRITION_DF = load_dataset()


# ─────────────────────────────────────────────
# Core lookup functions
# ─────────────────────────────────────────────

def search_foods(query: str) -> list[dict]:
    """
    Search for foods matching a query string.
    Returns a list of matching food dicts for autocomplete.
    """
    query = query.lower().strip()
    matches = NUTRITION_DF[NUTRITION_DF["food_name_lower"].str.contains(query, na=False)]
    return matches[["food_id", "food_name", "category", "calories", "serving_size_g"]].to_dict(orient="records")


def get_food_by_id(food_id: int) -> dict | None:
    """Fetch a single food item by its ID."""
    row = NUTRITION_DF[NUTRITION_DF["food_id"] == food_id]
    if row.empty:
        return None
    return row.iloc[0].to_dict()


def get_all_foods() -> list[dict]:
    """Return all foods (id + name) for dropdown population."""
    return NUTRITION_DF[["food_id", "food_name", "category"]].to_dict(orient="records")


# ─────────────────────────────────────────────
# Nutrient calculation functions
# ─────────────────────────────────────────────

NUTRIENT_COLS = ["calories", "protein_g", "fat_g", "carbs_g",
                 "fiber_g", "sugar_g", "sodium_mg", "vitamin_c_mg",
                 "calcium_mg", "iron_mg"]

def calculate_nutrients_for_item(food_id: int, quantity_g: float) -> dict | None:
    """
    Scale nutrient values from per-100g to the user's portion size.

    Parameters:
        food_id    : int  – ID of the food item
        quantity_g : float – Portion in grams entered by the user

    Returns a dict of scaled nutrient values, or None if food not found.
    """
    food = get_food_by_id(food_id)
    if not food:
        return None

    scale = quantity_g / 100.0   # All CSV values are per 100 g

    scaled = {
        "food_id":    food_id,
        "food_name":  food["food_name"],
        "category":   food["category"],
        "quantity_g": quantity_g,
    }

    for col in NUTRIENT_COLS:
        raw_val = food.get(col, 0) or 0
        scaled[col] = round(float(raw_val) * scale, 2)

    return scaled


def calculate_total_nutrients(food_entries: list[dict]) -> dict:
    """
    Aggregate nutrients across all food entries for a day.

    Parameters:
        food_entries : list of dicts, each with food_id and quantity_g

    Returns:
        {
          "items"  : list of per-item nutrient dicts,
          "totals" : aggregated totals across all items,
          "comparison" : per-nutrient % of RDI,
          "status"     : per-nutrient status label
        }
    """
    items = []

    for entry in food_entries:
        result = calculate_nutrients_for_item(
            int(entry["food_id"]),
            float(entry["quantity_g"])
        )
        if result:
            items.append(result)

    if not items:
        return {"items": [], "totals": {}, "comparison": {}, "status": {}}

    # Use NumPy for efficient column summation
    df_items = pd.DataFrame(items)
    totals = {}
    for col in NUTRIENT_COLS:
        totals[col] = round(float(np.sum(df_items[col].values)), 2)

    # Compare totals to RDI
    comparison = {}   # percentage of RDI
    status = {}       # label: low / ok / high

    for col in NUTRIENT_COLS:
        rdi  = RECOMMENDED_DAILY_INTAKE[col]
        val  = totals[col]
        pct  = round((val / rdi) * 100, 1) if rdi > 0 else 0
        comparison[col] = pct

        if pct < 70:
            status[col] = "low"
        elif pct <= 110:
            status[col] = "ok"
        else:
            status[col] = "high"

    return {
        "items":      items,
        "totals":     totals,
        "rdi":        RECOMMENDED_DAILY_INTAKE,
        "comparison": comparison,
        "status":     status,
        "labels":     NUTRIENT_LABELS,
    }


# ─────────────────────────────────────────────
# Diet improvement suggestions
# ─────────────────────────────────────────────

def generate_suggestions(status: dict, totals: dict) -> list[dict]:
    """
    Rule-based suggestion engine (no ML).
    Uses nutrient status labels to produce actionable tips.

    Returns a list of suggestion dicts:
        { nutrient, status, message, icon }
    """
    tips = []

    rules = {
        "calories": {
            "low":  ("🔥", "Your calorie intake is below the recommended level. "
                           "Add energy-dense foods like nuts, whole grains, or dairy."),
            "high": ("⚠️", "You're consuming more calories than recommended. "
                           "Try reducing portions of fried or sugary foods."),
        },
        "protein_g": {
            "low":  ("💪", "Protein intake is low. Include eggs, legumes, chicken, "
                           "paneer, or lentils to support muscle health."),
            "high": ("⚠️", "Protein is above recommended levels. Excess protein can "
                           "strain kidneys. Balance with vegetables and grains."),
        },
        "fat_g": {
            "low":  ("🥑", "Fat intake is low. Healthy fats from avocado, nuts, "
                           "and olive oil are essential for brain health."),
            "high": ("⚠️", "Fat intake is high. Reduce fried and processed foods. "
                           "Replace saturated fats with olive oil or nuts."),
        },
        "carbs_g": {
            "low":  ("🌾", "Carbohydrate intake is low. Add whole grains, fruits, "
                           "or legumes for sustained energy."),
            "high": ("⚠️", "Carbs are above recommended range. Limit white rice, "
                           "bread, and sugary foods. Choose whole-grain options."),
        },
        "fiber_g": {
            "low":  ("🥗", "Fiber intake is low. Eat more vegetables, fruits, "
                           "whole grains, and legumes for good digestion."),
            "high": ("✅", "Great fiber intake! This supports healthy digestion "
                           "and lowers cholesterol."),
        },
        "sugar_g": {
            "high": ("🍬", "Sugar consumption is high. Reduce sweets, soft drinks, "
                           "and processed foods to lower diabetes risk."),
        },
        "sodium_mg": {
            "high": ("🧂", "Sodium intake is high. Limit salt, pickles, processed "
                           "snacks, and fast food to protect heart health."),
        },
        "vitamin_c_mg": {
            "low":  ("🍊", "Vitamin C is low. Eat more citrus fruits, guava, "
                           "bell peppers, and tomatoes for immunity."),
        },
        "calcium_mg": {
            "low":  ("🦴", "Calcium intake is low. Include milk, yogurt, paneer, "
                           "and leafy greens to support bone health."),
        },
        "iron_mg": {
            "low":  ("🩸", "Iron is low. Eat spinach, lentils, beans, and nuts. "
                           "Pair with Vitamin C foods for better absorption."),
        },
    }

    for nutrient, rule_map in rules.items():
        s = status.get(nutrient)
        if s and s in rule_map:
            icon, message = rule_map[s]
            tips.append({
                "nutrient": NUTRIENT_LABELS.get(nutrient, nutrient),
                "status":   s,
                "message":  message,
                "icon":     icon,
            })

    # Add a positive note if everything is "ok"
    if not tips:
        tips.append({
            "nutrient": "Overall Diet",
            "status":   "ok",
            "message":  "🎉 Your diet looks well-balanced today! Keep it up.",
            "icon":     "✅",
        })

    return tips


# ─────────────────────────────────────────────
# Summary statistics (used in dashboard)
# ─────────────────────────────────────────────

def diet_summary_stats(totals: dict) -> dict:
    """
    Compute a few high-level summary numbers for the dashboard cards.
    """
    cal_pct  = round((totals.get("calories", 0) / RECOMMENDED_DAILY_INTAKE["calories"]) * 100, 1)
    pro_pct  = round((totals.get("protein_g", 0) / RECOMMENDED_DAILY_INTAKE["protein_g"]) * 100, 1)
    fat_pct  = round((totals.get("fat_g", 0) / RECOMMENDED_DAILY_INTAKE["fat_g"]) * 100, 1)
    carb_pct = round((totals.get("carbs_g", 0) / RECOMMENDED_DAILY_INTAKE["carbs_g"]) * 100, 1)

    # Simple health score: average of how close nutrients are to 100% RDI
    # Penalise both deficiency and excess
    scores = []
    for col in ["calories", "protein_g", "fat_g", "carbs_g", "fiber_g"]:
        rdi = RECOMMENDED_DAILY_INTAKE[col]
        val = totals.get(col, 0)
        pct = (val / rdi) * 100 if rdi else 0
        # Score = 100 at 100%, drops as it deviates
        score = max(0, 100 - abs(pct - 100))
        scores.append(score)

    health_score = round(float(np.mean(scores)), 1)

    return {
        "calorie_pct":  cal_pct,
        "protein_pct":  pro_pct,
        "fat_pct":      fat_pct,
        "carb_pct":     carb_pct,
        "health_score": health_score,
    }


def get_macro_distribution(totals: dict) -> dict:
    """
    Return macronutrient calorie breakdown for the pie chart.
    Protein & Carbs: 4 kcal/g | Fat: 9 kcal/g
    """
    protein_cal = totals.get("protein_g", 0) * 4
    fat_cal     = totals.get("fat_g", 0) * 9
    carb_cal    = totals.get("carbs_g", 0) * 4
    total_macro = protein_cal + fat_cal + carb_cal or 1  # avoid /0

    return {
        "protein_cal": round(protein_cal, 1),
        "fat_cal":     round(fat_cal, 1),
        "carb_cal":    round(carb_cal, 1),
        "protein_pct": round((protein_cal / total_macro) * 100, 1),
        "fat_pct":     round((fat_cal / total_macro) * 100, 1),
        "carb_pct":    round((carb_cal / total_macro) * 100, 1),
    }
