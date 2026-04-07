# 🥗 Diet Impact Analyser

**A Full Stack + Data Science College Project**  
Analyse your daily food intake, visualise nutritional impact, and get personalised dietary suggestions.

---

## 📌 Project Overview

Diet Impact Analyser is a full-stack web application that:
- Allows users to log daily food consumption with quantities
- Retrieves nutritional data from a CSV dataset using **Pandas**
- Calculates total nutrients using **NumPy**
- Compares intake against **Recommended Daily Intake (RDI)** values
- Visualises results using **Chart.js** (pie, bar, radar, horizontal bar charts)
- Generates rule-based diet improvement suggestions

---

## 🏗️ Project Architecture

```
User (Browser)
     │
     ▼
Flask Web Server (app.py)
     │
     ├── Templates (HTML)  ──  Static Files (CSS, JS)
     │
     ├── API Endpoints
     │       ├── GET  /api/foods/search?q=   → Search foods
     │       ├── GET  /api/foods/all          → All food list
     │       ├── POST /api/analyse            → Run analysis
     │       └── GET  /api/rdi               → RDI reference
     │
     └── Analysis Module (analysis/diet_analyser.py)
             │
             └── Dataset (data/nutrition_data.csv)
                     └── 90 food items, 14 nutrient columns
```

---

## 📁 Folder Structure

```
diet-impact-analyser/
│
├── app.py                        # Flask application & API routes
├── requirements.txt              # Python dependencies
├── Procfile                      # For Render deployment
├── render.yaml                   # Render config
├── .gitignore
│
├── analysis/
│   ├── __init__.py
│   └── diet_analyser.py          # Pandas/NumPy analysis logic
│
├── data/
│   └── nutrition_data.csv        # Dataset: 90 foods × 14 nutrients
│
├── templates/
│   ├── index.html                # Food entry page
│   ├── results.html              # Analysis results page
│   └── about.html                # Project info page
│
└── static/
    ├── css/
    │   └── style.css             # All styling
    └── js/
        ├── main.js               # Food entry logic
        └── results.js            # Charts & results rendering
```

---

## 🧪 Tech Stack

| Layer         | Technology              |
|---------------|-------------------------|
| Backend       | Python 3.11, Flask 3    |
| Data Analysis | Pandas 2.2, NumPy 1.26  |
| Frontend      | HTML5, CSS3, JavaScript |
| UI Framework  | Bootstrap 5.3           |
| Charts        | Chart.js 4.4            |
| Dataset       | CSV (90 food items)     |
| Deployment    | GitHub + Render         |
| IDE           | Visual Studio Code      |

---

## 📊 Data Analysis Logic

### Step 1 – Load Dataset
```python
df = pd.read_csv("data/nutrition_data.csv")
```

### Step 2 – Scale Nutrients by Portion
All CSV values are per 100g. When user enters 150g of rice:
```python
scale = quantity_g / 100.0          # 150 / 100 = 1.5
calories = 130 * 1.5 = 195 kcal
```

### Step 3 – Aggregate with NumPy
```python
total_calories = np.sum(df_items["calories"].values)
```

### Step 4 – Compare with RDI
```python
percentage = (total_value / rdi_value) * 100
# < 70%  → low   (needs improvement)
# 70-110% → ok   (on target)
# > 110% → high  (excess)
```

### Step 5 – Rule-Based Suggestions
No ML. Pure if/else logic based on nutrient status labels.

---

## 🚀 Local Setup (Step by Step)

### Prerequisites
- Python 3.10+ installed
- VS Code installed
- Git installed

### Step 1 – Clone / Download
```bash
git clone https://github.com/YOUR_USERNAME/diet-impact-analyser.git
cd diet-impact-analyser
```

### Step 2 – Create Virtual Environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### Step 3 – Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 4 – Run the App
```bash
python app.py
```

### Step 5 – Open in Browser
```
http://127.0.0.1:5000
```

---

## 🌐 API Reference

### 1. Search Foods
```
GET /api/foods/search?q=chicken
```
**Response:**
```json
{
  "foods": [
    { "food_id": 11, "food_name": "Chicken Breast (cooked)", "category": "Protein", "calories": 165, "serving_size_g": 100 }
  ]
}
```

### 2. All Foods
```
GET /api/foods/all
```

### 3. Analyse Diet *(Main endpoint)*
```
POST /api/analyse
Content-Type: application/json

{
  "food_entries": [
    { "food_id": 1,  "quantity_g": 200 },
    { "food_id": 13, "quantity_g": 100 },
    { "food_id": 33, "quantity_g": 118 }
  ]
}
```
**Response includes:** `items`, `totals`, `rdi`, `comparison`, `status`, `suggestions`, `summary`, `macros`

### 4. RDI Reference
```
GET /api/rdi
```

---

## ☁️ Deployment (GitHub + Render)

### Step 1 – Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit – Diet Impact Analyser"
git remote add origin https://github.com/YOUR_USERNAME/diet-impact-analyser.git
git push -u origin main
```

### Step 2 – Deploy on Render
1. Go to [render.com](https://render.com) and sign up (free)
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Render auto-detects Python – configure:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
5. Click **Create Web Service**
6. Your app will be live at `https://diet-impact-analyser.onrender.com`

---

## 🗄️ Dataset: nutrition_data.csv

**90 food items | 7 categories | 14 columns**

| Column        | Type  | Description                    |
|---------------|-------|--------------------------------|
| food_id       | int   | Unique identifier              |
| food_name     | str   | Name of food item              |
| category      | str   | Food group (Grains, Protein…)  |
| serving_size_g| float | Standard serving (grams)       |
| calories      | float | kcal per 100g                  |
| protein_g     | float | Protein per 100g               |
| fat_g         | float | Fat per 100g                   |
| carbs_g       | float | Carbohydrates per 100g         |
| fiber_g       | float | Dietary fiber per 100g         |
| sugar_g       | float | Sugar per 100g                 |
| sodium_mg     | float | Sodium per 100g                |
| vitamin_c_mg  | float | Vitamin C per 100g             |
| calcium_mg    | float | Calcium per 100g               |
| iron_mg       | float | Iron per 100g                  |

**Categories:** Grains · Protein · Dairy · Fruits · Vegetables · Fats & Oils · Sweets · Beverages

---

## 📈 Charts Generated

1. **Macronutrient Doughnut Chart** – Protein / Fat / Carbs calorie breakdown
2. **Nutrient Bar Chart** – All nutrients as % of RDI (colour-coded)
3. **Radar Chart** – Multi-nutrient profile vs 100% RDI
4. **Calorie Bar Chart** – Calorie contribution per food item

---

## 👨‍💻 Author
Built as a 2nd Year Engineering College Project  
Full Stack + Data Science  
Technologies: Flask · Pandas · NumPy · Chart.js · Bootstrap 5
