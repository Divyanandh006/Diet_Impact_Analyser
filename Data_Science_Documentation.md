# Diet Impact Analyser: Data Science Implementation Documentation

**Prepared By:** Lead Data Scientist
**Target Audience:** Engineering, Data Science, and Product Teams
**Scope:** Core Data Science concepts, Analytical methodologies, and System implementation within the Diet Impact Analyser

---

## 1. Executive Summary

The **Diet Impact Analyser** is a data-driven application designed to ingest dietary information, normalize nutritional values, and provide actionable health insights. From a Data Science perspective, the system employs several key concepts:

1.  **Data Ingestion & Preprocessing:** Processing raw tabular data into memory-optimized structures using Pandas.
2.  **Information Retrieval:** Implementing substring-matching search algorithms for high-speed, entity-based lookups.
3.  **Vectorized Operations:** Leveraging NumPy and Pandas for rapid, scalable, and memory-efficient matrix math to aggregate macronutrients and micronutrients.
4.  **Expert Systems (Rule-Based Engine):** Utilizing deterministic, heuristic-based algorithms (business rules) to generate personalized diet suggestions.
5.  **Multi-Dimensional Scoring Algorithms:** Calculating a unified "Health Score" using a distance-based metric (absolute error from Recommended Daily Intakes).

This document unpacks these concepts, providing theoretical background alongside the core Python implementations used in the system.

---

## 2. Data Loading and Preprocessing

### 2.1 Concept: In-Memory Data Structures (DataFrames)
In data science, preprocessing is critical. The project loads static nutrient data from a CSV file into an in-memory tabular format known as a DataFrame. By structuring the data this way, we achieve O(1) column access and highly optimized query capabilities.

### 2.2 Implementation
We utilize **Pandas (`pd.DataFrame`)** to load the dataset globally just once when the module initializes. We apply text normalization (lowercasing and stripping whitespace) to create a `food_name_lower` feature, functioning as an inverted index for search querying.

```python
import pandas as pd
import os

DATA_PATH = os.path.join(os.path.dirname(__file__), "../data/nutrition_data.csv")

def load_dataset() -> pd.DataFrame:
    """Load nutrition CSV into a Pandas DataFrame."""
    df = pd.read_csv(DATA_PATH)
    # Standardise food names for optimized O(N) search and information retrieval
    df["food_name_lower"] = df["food_name"].str.lower().str.strip()
    return df

# Loaded into memory globally to prevent disk I/O bottlenecks during API calls
NUTRITION_DF = load_dataset()
```

---

## 3. Information Retrieval (Search engine)

### 3.1 Concept: Pattern Matching and Filtering
When users search for a food item ("apple"), the system performs an *Information Retrieval* task. We use string matching to filter the DataFrame. This acts as a basic search engine indexing system, returning relevance-filtered tuples.

### 3.2 Implementation
The query is normalized (converted to lowercase), and we use vectorized string operations to filter the dataset `NUTRITION_DF`. Missing values (`na=False`) are handled natively to prevent `NullReference` exceptions.

```python
def search_foods(query: str) -> list[dict]:
    """
    Search for foods matching a query string.
    Returns a list of matching food dicts for autocomplete.
    """
    query = query.lower().strip()
    # Vectorized string search acting as a basic retrieval algorithm
    matches = NUTRITION_DF[NUTRITION_DF["food_name_lower"].str.contains(query, na=False)]
    
    # Selecting relevant features and converting to records
    return matches[["food_id", "food_name", "category", "calories", "serving_size_g"]].to_dict(orient="records")
```

---

## 4. Dimensional Scaling and Vectorized Computations

### 4.1 Concept: Vector Scaling and Aggregation
Nutritional databases typically define quantities per standard serving (e.g., per 100g). When users input distinct portions, we must perform scalar multiplication across all nutrient vectors. We use mathematical aggregation (Summation) across all foods consumed by the user in a given day.

### 4.2 Implementation
Instead of using slow Python loops, we load the user's daily dietary entries into a new discrete DataFrame and run **NumPy** sum operations. This takes advantage of highly optimized C-bindings.

```python
import numpy as np

NUTRIENT_COLS = ["calories", "protein_g", "fat_g", "carbs_g",
                 "fiber_g", "sugar_g", "sodium_mg", "vitamin_c_mg",
                 "calcium_mg", "iron_mg"]

def calculate_total_nutrients(food_entries: list[dict]) -> dict:
    # 1. Transform input variables based on scaling factors
    items = []
    for entry in food_entries:
        result = calculate_nutrients_for_item(int(entry["food_id"]), float(entry["quantity_g"]))
        if result: items.append(result)

    # 2. Vectorized Aggregation
    df_items = pd.DataFrame(items)
    totals = {}
    for col in NUTRIENT_COLS:
        # Utilizing NumPy's underlying C operations for high performance
        totals[col] = round(float(np.sum(df_items[col].values)), 2)

    return {"totals": totals}
```

---

## 5. Domain Expert System (Rule-Based AI)

### 5.1 Concept: Heuristic AI Engine
Before the advent of deep learning, AI was largely driven by **Expert Systems**, which codify domain expertise into decision trees or rules. Our system takes the aggregated nutrient values, calculates the percentage against the *Recommended Daily Intake (RDI)*, and maps limits (Deficit < 70%, Surplus > 110%) to provide actionable diet interventions.

### 5.2 Implementation
We classify the user's nutrient status into discrete categorical bins (`low`, `ok`, `high`). Based on these categorizations, a rule engine matches the status to specific natural language recommendations.

```python
# 1. Status Categorization
for col in NUTRIENT_COLS:
    rdi = RECOMMENDED_DAILY_INTAKE[col]
    val = totals[col]
    pct = round((val / rdi) * 100, 1) if rdi > 0 else 0

    if pct < 70:
        status[col] = "low"
    elif pct <= 110:
        status[col] = "ok"
    else:
        status[col] = "high"

# 2. Rule Mapping Engine
def generate_suggestions(status: dict, totals: dict) -> list[dict]:
    tips = []
    rules = {
        "protein_g": {
            "low":  ("💪", "Protein intake is low. Include eggs, legumes, or lentils to support muscle health."),
            "high": ("⚠️", "Protein is above recommended levels. Balance with vegetables and grains."),
        },
        # ... other rules ...
    }

    for nutrient, rule_map in rules.items():
        s = status.get(nutrient)
        if s and s in rule_map:
            icon, message = rule_map[s]
            tips.append({"nutrient": nutrient, "status": s, "message": message, "icon": icon})

    return tips
```

---

## 6. Multivariate Health Scoring Algorithm

### 6.1 Concept: Distance-Based Scoring (L1 Norm Concept)
To give users a single intuitive metric, we calculate a *Health Score*. This acts as a dimensionality reduction technique—taking 5 key nutrients and converting them into a singular index. The math calculates the absolute deviation from the ideal target (100% of RDI). It heavily penalizes severe outliers using an absolute error calculation `|pct - 100|`.

### 6.2 Implementation
The score starts at 100 and loses points based on the deviation. We average the scores using the arithmetic mean to create an overall metric.

```python
def diet_summary_stats(totals: dict) -> dict:
    scores = []
    # Core target features for the score
    for col in ["calories", "protein_g", "fat_g", "carbs_g", "fiber_g"]:
        rdi = RECOMMENDED_DAILY_INTAKE[col]
        val = totals.get(col, 0)
        pct = (val / rdi) * 100 if rdi else 0
        
        # Absolute Deviation penalty:
        # Score = 100 at perfect target. It drops linearly as values deviate.
        score = max(0, 100 - abs(pct - 100))
        scores.append(score)

    # Arithmetic mean of feature scores
    health_score = round(float(np.mean(scores)), 1)
    return {"health_score": health_score}
```

---

## Summary

The Diet Impact Analyser elegantly incorporates foundational Data Science operations: In-memory tabular processing, vector mathematics, heuristic-based categorization, and multi-feature dimensional distance scoring. The codebase is fully optimized by using native `C` array manipulations beneath the Pandas/NumPy layers, ensuring rapid O(1) to O(N) operations necessary for synchronous web API calls.
