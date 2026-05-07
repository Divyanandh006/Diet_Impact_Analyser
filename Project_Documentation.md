# Diet Impact Analyser - Project Documentation

## 1. Complete Process Explanation (How it Works)

The Diet Impact Analyser is a Full-Stack Web Application focused on calculating and visualizing the nutritional impact of a user's daily food intake compared to the Recommended Daily Intake (RDI).

**The Workflow:**
1. **User Authentication & Profile:** A user registers and logs in (secured via bcrypt hashing). They can define their physical profile (height, weight, age, gender), which the backend uses to calculate their personalized Body Mass Index (BMI) and Total Daily Energy Expenditure (TDEE).
2. **Logging Food:** From the dashboard interface, the user uses the search bar features to find foods out of a 90-item dataset. They select a food item and input their expected portion size (e.g., 150 grams of chicken). 
3. **Data Submission:** Upon saving the daily log or clicking "Analyze," the frontend passes this custom array of food items and their respective gram quantities to the Flask backend's `/api/analyse` REST endpoint.
4. **Data Analysis & Processing:**
   * The backend routes the data to the Data Analysis module (`diet_analyser.py`). 
   * Using **Pandas**, it fetches the core nutritional metrics (which are stored per 100g in `nutrition_data.csv`) and scales them based on the inputted portion sizes (e.g., 150g -> 1.5x multiplier).
   * **NumPy** quickly aggregates the grand total for calories, macros (protein, carbs, fat), and micronutrients (vitamins, iron, sodium).
   * The system compares these aggregated totals to hard-coded RDI configurations to generate status percentages and assigns categorical labels (`low`, `ok`, `high`).
   * Pure if/else analytical rule sets generate dietary improvement suggestions based on the nutritional deficits or excesses computed. 
5. **Database Storage:** The `app.py` Flask server concurrently persists this generated daily summary and the raw food entries (as a JSON string) into an SQLite database so the user can track their dietary history day-over-day. 
6. **Results Visualization:** The structured analytical data is routed back to the frontend, where `Chart.js` is employed to render interactive visual graphs (Macronutrient pie charts, standard RDI bar charts, multi-nutrient radar charts) and present personalized, actionable feedback to the user.

---

## 2. All Modules & Architecture

The project follows a standard decoupled Monolith architecture, divided into these core modules:

### A. The Web Server / Backend Module (`app.py`)
* **Technology:** Python 3.11, Flask 3
* **Responsibilities:** Handles all routing, user sessions (via `Flask-Login`), password security (via `Flask-Bcrypt`), REST API endpoints for the UI, and coordinates data flow between the database and the analysis module. 

### B. The Data Analysis Module (`analysis/diet_analyser.py` & `data/nutrition_data.csv`)
* **Technology:** Pandas 2.2, NumPy 1.26
* **Responsibilities:** This is the core logical engine of the application. It loads a static CSV referencing 90 distinct food items containing 14 nutritional properties. It handles all mathematical scaling, nutrient summation, mathematical comparisons to RDI, and dynamic generation of plain-text health suggestions.

### C. The Database Module (SQLite & SQLAlchemy)
* **Technology:** SQLite3, SQLAlchemy ORM
* **Responsibilities:** Establishes a localized relation tree utilizing WAL (Write-Ahead Logging) mode to handle robust parallel data operations in production. Tracks comprehensive user profiles and longitudinal daily data logs encompassing calculated totals and direct references to historical inputs.

### D. The Frontend / Visualization Module (`templates/` & `static/`)
* **Technology:** HTML5/Jinja2, CSS3/Bootstrap 5.3, JavaScript, Chart.js 4.4
* **Responsibilities:** Implements interactive layouts without requiring heavy frameworks like React. The JavaScript logic asynchronously triggers endpoints (like `/api/foods/search`), dynamically updates the UI DOM, and leverages Chart.js to map API JSON payloads into complex, interactive charts.

---

## 3. Backend Database Structure

The backend operates on a relational **SQLite** database managed via the **SQLAlchemy ORM**. It is structured using two primary tables and relies dynamically on a static CSV file for standard nutrition references. 

### SQL Table 1: `users`
This table captures the user's authentication credentials and demographic profiles.

| Column | Data Type | Properties / Restrictions | Description |
| :--- | :--- | :--- | :--- |
| **`id`** | Integer | Primary Key | Unique user identifier. |
| **`username`** | String(80) | Unique, Not Null | The user's login name. |
| **`password_hash`**| String(256) | Not Null | Bcrypt hashed/salted password. |
| **`height_cm`** | Float | Nullable | User's height in cm. |
| **`weight_kg`** | Float | Nullable | User's weight in kg. |
| **`age`** | Integer | Nullable | User's age. |
| **`gender`** | String(10) | Nullable | Male / female / other. |
| **`created_at`** | DateTime | Default: `utcnow` | Timestamp of account creation. |

* **Relationships**: One-to-Many connection with `DietLog` (cascade triggers delete-orphan). Includes automated instance methods to calculate **TDEE** and **BMI Category** based on the dynamic row variables.

### SQL Table 2: `diet_logs`
This table acts as a daily journal, permanently caching the computed metric totals alongside the itemized food selections for any unique user/date combination. 

| Column | Data Type | Properties | Description |
| :--- | :--- | :--- | :--- |
| **`id`** | Integer | Primary Key | Unique log identifier. |
| **`user_id`** | Integer | Foreign Key (`users.id`) | Maps log to the user. |
| **`date`** | Date | Not Null | Standardized chronological date. |
| **`food_entries`** | Text | Default: `'[]'` | JSON Stringified array of `food_id`s & `quantity_g`s. |
| **`total_calories`** | Float | Default: `0` | Summed caloric value. |
| **`total_protein_g`**| Float | Default: `0` | Summed protein. |
| **`total_fat_g`** | Float | Default: `0` | Summed fat. |
| **`total_carbs_g`** | Float | Default: `0` | Summed carbohydrates. |
| **`total_fiber_g`** | Float | Default: `0` | Summed fiber. |
| **`total_sugar_g`** | Float | Default: `0` | Summed sugar. |
| **`total_sodium_mg`**| Float | Default: `0` | Summed sodium tracker. |
| **`total_vitamin_c_mg`**| Float | Default: `0` | Summed Vitamin C. |
| **`total_calcium_mg`**| Float | Default: `0` | Summed Calcium. |
| **`total_iron_mg`** | Float | Default: `0` | Summed Iron. |
| **`health_score`** | Float | Default: `0` | Proprietary health grade based on RDI variance. |
| **`created_at`** | DateTime | Default: `utcnow` | Initial tracker log timestamp. |
| **`updated_at`** | DateTime | Default/On-Update: `utcnow`| Timestamp modified if log is appended. |

* **Constraint Specifications:** Utilizes `UniqueConstraint('user_id', 'date')` to guarantee only one composite diet log exists per user per actual calendar day. 

### External Static Data Source: `nutrition_data.csv`
While not a SQL relational table, the Data Science module acts as if this standard CSV is a database, treating its 90 unique rows as the underlying data fabric feeding the dynamic analysis module.

* **Schema Format**: `[ food_id (Index), food_name, category, serving_size_g, calories, protein_g, fat_g, carbs_g, fiber_g, sugar_g, sodium_mg, vitamin_c_mg, calcium_mg, iron_mg ]`
