"""
app.py  –  Diet Impact Analyser  |  Flask Backend (v2.0)
==========================================================
Multi-user version with authentication, per-user diet logs,
historical analysis, and profile management.
Run with:   python app.py
"""

import os
import json
import secrets
import sqlite3
from datetime import datetime, date

from sqlalchemy import event
from sqlalchemy.engine import Engine

from flask import (
    Flask, request, jsonify, render_template,
    redirect, url_for, flash
)
from flask_sqlalchemy import SQLAlchemy
from flask_login import (
    LoginManager, UserMixin, login_user,
    logout_user, login_required, current_user
)
from flask_bcrypt import Bcrypt

from analysis.diet_analyser import (
    search_foods, get_all_foods, calculate_total_nutrients,
    generate_suggestions, diet_summary_stats, get_macro_distribution,
    RECOMMENDED_DAILY_INTAKE, NUTRIENT_LABELS,
)

# ── App & Extensions ───────────────────────────────────────────────
app = Flask(__name__)

# Random key each restart → invalidates old sessions → everyone logs in fresh
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))

# SQLite with thread-safety + connection health checks for multi-user
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///diet_impact.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_SORT_KEYS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'connect_args': {'check_same_thread': False},  # allow multi-threaded access
    'pool_pre_ping': True,                          # verify connection before use
}

# Sessions expire when browser closes — each user starts at login
app.config['SESSION_COOKIE_PERMANENT'] = False
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

db          = SQLAlchemy(app)
bcrypt      = Bcrypt(app)
login_mgr   = LoginManager(app)
login_mgr.login_view             = 'login'
login_mgr.login_message          = ''   # suppress default flash; login is the natural entry
login_mgr.login_message_category = 'info'


# ── SQLite WAL Mode (enables concurrent reads during writes) ────────
@event.listens_for(Engine, 'connect')
def set_sqlite_pragmas(dbapi_connection, connection_record):
    """Run on every new SQLite connection. WAL allows multiple readers + one writer."""
    if isinstance(dbapi_connection, sqlite3.Connection):
        cur = dbapi_connection.cursor()
        cur.execute('PRAGMA journal_mode=WAL')     # concurrent reads during writes
        cur.execute('PRAGMA synchronous=NORMAL')   # safe + faster than FULL
        cur.execute('PRAGMA foreign_keys=ON')      # enforce FK constraints
        cur.execute('PRAGMA cache_size=2000')      # 2 MB page cache per connection
        cur.close()


# ── Models ─────────────────────────────────────────────────────────

class User(db.Model, UserMixin):
    __tablename__ = 'users'
    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    height_cm     = db.Column(db.Float, nullable=True)
    weight_kg     = db.Column(db.Float, nullable=True)
    age           = db.Column(db.Integer, nullable=True)
    gender        = db.Column(db.String(10), nullable=True)   # male / female / other
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    diet_logs     = db.relationship('DietLog', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password: str):
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, password)

    def calculate_tdee(self):
        """Mifflin-St Jeor BMR × 1.2 (sedentary). Returns None if profile incomplete."""
        if not all([self.height_cm, self.weight_kg, self.age, self.gender]):
            return None
        w, h, a = self.weight_kg, self.height_cm, self.age
        if self.gender == 'male':
            bmr = (10 * w) + (6.25 * h) - (5 * a) + 5
        elif self.gender == 'female':
            bmr = (10 * w) + (6.25 * h) - (5 * a) - 161
        else:
            bmr = (10 * w) + (6.25 * h) - (5 * a) - 78
        return round(bmr * 1.2)

    def calculate_bmi(self):
        if not self.height_cm or not self.weight_kg:
            return None
        h_m = self.height_cm / 100
        return round(self.weight_kg / (h_m ** 2), 1)

    def bmi_category(self):
        bmi = self.calculate_bmi()
        if bmi is None:
            return None
        if bmi < 18.5:   return 'Underweight'
        elif bmi < 25.0: return 'Normal'
        elif bmi < 30.0: return 'Overweight'
        else:            return 'Obese'

    def to_profile_dict(self):
        return {
            'id':           self.id,
            'username':     self.username,
            'height_cm':    self.height_cm,
            'weight_kg':    self.weight_kg,
            'age':          self.age,
            'gender':       self.gender,
            'tdee':         self.calculate_tdee(),
            'bmi':          self.calculate_bmi(),
            'bmi_category': self.bmi_category(),
        }


class DietLog(db.Model):
    __tablename__ = 'diet_logs'
    id               = db.Column(db.Integer, primary_key=True)
    user_id          = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    date             = db.Column(db.Date, nullable=False)
    food_entries     = db.Column(db.Text, nullable=False, default='[]')   # JSON string
    total_calories   = db.Column(db.Float, default=0)
    total_protein_g  = db.Column(db.Float, default=0)
    total_fat_g      = db.Column(db.Float, default=0)
    total_carbs_g    = db.Column(db.Float, default=0)
    total_fiber_g    = db.Column(db.Float, default=0)
    total_sugar_g    = db.Column(db.Float, default=0)
    total_sodium_mg  = db.Column(db.Float, default=0)
    total_vitamin_c_mg = db.Column(db.Float, default=0)
    total_calcium_mg = db.Column(db.Float, default=0)
    total_iron_mg    = db.Column(db.Float, default=0)
    health_score     = db.Column(db.Float, default=0)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at       = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'date', name='uq_user_date'),
    )

    def to_dict(self):
        return {
            'id':                self.id,
            'date':              self.date.isoformat(),
            'food_entries':      json.loads(self.food_entries or '[]'),
            'total_calories':    self.total_calories,
            'total_protein_g':   self.total_protein_g,
            'total_fat_g':       self.total_fat_g,
            'total_carbs_g':     self.total_carbs_g,
            'total_fiber_g':     self.total_fiber_g,
            'total_sugar_g':     self.total_sugar_g,
            'total_sodium_mg':   self.total_sodium_mg,
            'total_vitamin_c_mg':self.total_vitamin_c_mg,
            'total_calcium_mg':  self.total_calcium_mg,
            'total_iron_mg':     self.total_iron_mg,
            'health_score':      self.health_score,
        }


@login_mgr.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


# ── Page Routes ────────────────────────────────────────────────────

@app.route('/')
def index():
    """Root — redirect to login if not authenticated, else show food log page."""
    if not current_user.is_authenticated:
        return redirect(url_for('login'))
    today   = date.today().isoformat()
    profile = current_user.to_profile_dict()
    return render_template('index.html', user=profile, today=today)


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        remember = request.form.get('remember') == 'on'

        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user, remember=remember)
            next_page = request.args.get('next')
            return redirect(next_page or url_for('index'))
        flash('Invalid username or password.', 'error')
    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        confirm  = request.form.get('confirm_password', '')
        height   = request.form.get('height_cm', type=float)
        weight   = request.form.get('weight_kg', type=float)
        age      = request.form.get('age', type=int)
        gender   = request.form.get('gender', '').strip()

        errors = []
        if not username or len(username) < 3:
            errors.append('Username must be at least 3 characters.')
        elif User.query.filter_by(username=username).first():
            errors.append('Username already taken.')
        if len(password) < 6:
            errors.append('Password must be at least 6 characters.')
        elif password != confirm:
            errors.append('Passwords do not match.')

        if errors:
            for e in errors:
                flash(e, 'error')
        else:
            user = User(
                username  = username,
                height_cm = height,
                weight_kg = weight,
                age       = age,
                gender    = gender or None,
            )
            user.set_password(password)
            db.session.add(user)
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()
                flash('Registration failed due to a server error. Please try again.', 'error')
                return render_template('register.html')
            flash('Account created! Please log in.', 'success')
            return redirect(url_for('login'))
    return render_template('register.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))


@app.route('/profile')
@login_required
def profile():
    return render_template('profile.html', user=current_user.to_profile_dict())


@app.route('/results')
@login_required
def results():
    return render_template('results.html', user=current_user.to_profile_dict())


@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html', user=current_user.to_profile_dict())


@app.route('/about')
def about():
    u = current_user.to_profile_dict() if current_user.is_authenticated else None
    return render_template('about.html', user=u)


# ── API: Foods ─────────────────────────────────────────────────────

@app.route('/api/foods/search')
@login_required
def api_search_foods():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'foods': []})
    return jsonify({'foods': search_foods(query)})


@app.route('/api/foods/all')
@login_required
def api_all_foods():
    return jsonify({'foods': get_all_foods()})


@app.route('/api/analyse', methods=['POST'])
@login_required
def api_analyse():
    data = request.get_json(silent=True)
    if not data or 'food_entries' not in data:
        return jsonify({'error': 'food_entries field is required'}), 400

    entries = data['food_entries']
    if not isinstance(entries, list) or len(entries) == 0:
        return jsonify({'error': 'Provide at least one food entry'}), 400

    for entry in entries:
        if 'food_id' not in entry or 'quantity_g' not in entry:
            return jsonify({'error': 'Each entry needs food_id and quantity_g'}), 400
        try:
            float(entry['quantity_g']); int(entry['food_id'])
        except (ValueError, TypeError):
            return jsonify({'error': 'food_id must be int, quantity_g must be number'}), 400

    analysis    = calculate_total_nutrients(entries)
    totals      = analysis['totals']
    status      = analysis['status']
    suggestions = generate_suggestions(status, totals)
    summary     = diet_summary_stats(totals)
    macros      = get_macro_distribution(totals)

    return jsonify({
        'items':       analysis['items'],
        'totals':      totals,
        'rdi':         RECOMMENDED_DAILY_INTAKE,
        'comparison':  analysis['comparison'],
        'status':      status,
        'labels':      NUTRIENT_LABELS,
        'suggestions': suggestions,
        'summary':     summary,
        'macros':      macros,
    })


@app.route('/api/rdi')
@login_required
def api_rdi():
    return jsonify({'rdi': RECOMMENDED_DAILY_INTAKE, 'labels': NUTRIENT_LABELS})


# ── API: Diet Logs ─────────────────────────────────────────────────

@app.route('/api/diet_logs', methods=['POST'])
@login_required
def api_save_diet_log():
    """Save or merge the diet log for a given date (one log per user per date)."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    log_date_str = data.get('date')
    food_entries = data.get('food_entries', [])
    totals       = data.get('totals', {})
    health_score = data.get('health_score', 0)

    try:
        log_date = date.fromisoformat(log_date_str)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    existing = DietLog.query.filter_by(user_id=current_user.id, date=log_date).first()

    if existing:
        # Merge food entries and recalculate totals
        prev_entries   = json.loads(existing.food_entries or '[]')
        merged_entries = prev_entries + food_entries
        existing.food_entries = json.dumps(merged_entries)

        if merged_entries:
            all_refs = [{'food_id': e['food_id'], 'quantity_g': e['quantity_g']} for e in merged_entries]
            merged_analysis = calculate_total_nutrients(all_refs)
            mt = merged_analysis['totals']
            ms = diet_summary_stats(mt)
        else:
            mt = totals
            ms = {'health_score': health_score}

        existing.total_calories    = mt.get('calories', 0)
        existing.total_protein_g   = mt.get('protein_g', 0)
        existing.total_fat_g       = mt.get('fat_g', 0)
        existing.total_carbs_g     = mt.get('carbs_g', 0)
        existing.total_fiber_g     = mt.get('fiber_g', 0)
        existing.total_sugar_g     = mt.get('sugar_g', 0)
        existing.total_sodium_mg   = mt.get('sodium_mg', 0)
        existing.total_vitamin_c_mg = mt.get('vitamin_c_mg', 0)
        existing.total_calcium_mg  = mt.get('calcium_mg', 0)
        existing.total_iron_mg     = mt.get('iron_mg', 0)
        existing.health_score      = ms.get('health_score', health_score)
        existing.updated_at        = datetime.utcnow()
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': 'Failed to update log. Please try again.'}), 500
        return jsonify({'status': 'updated', 'log': existing.to_dict()})
    else:
        log = DietLog(
            user_id          = current_user.id,
            date             = log_date,
            food_entries     = json.dumps(food_entries),
            total_calories   = totals.get('calories', 0),
            total_protein_g  = totals.get('protein_g', 0),
            total_fat_g      = totals.get('fat_g', 0),
            total_carbs_g    = totals.get('carbs_g', 0),
            total_fiber_g    = totals.get('fiber_g', 0),
            total_sugar_g    = totals.get('sugar_g', 0),
            total_sodium_mg  = totals.get('sodium_mg', 0),
            total_vitamin_c_mg = totals.get('vitamin_c_mg', 0),
            total_calcium_mg = totals.get('calcium_mg', 0),
            total_iron_mg    = totals.get('iron_mg', 0),
            health_score     = health_score,
        )
        db.session.add(log)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            return jsonify({'error': 'Failed to save log. Please try again.'}), 500
        return jsonify({'status': 'created', 'log': log.to_dict()})


@app.route('/api/diet_logs/<date_str>', methods=['GET'])
@login_required
def api_get_log_for_date(date_str):
    """Get existing diet log for a specific date."""
    try:
        log_date = date.fromisoformat(date_str)
    except ValueError:
        return jsonify({'error': 'Invalid date'}), 400
    log = DietLog.query.filter_by(user_id=current_user.id, date=log_date).first()
    return jsonify({'log': log.to_dict() if log else None})


@app.route('/api/history')
@login_required
def api_history():
    """Return all diet logs for current user, sorted by date."""
    logs = (DietLog.query
            .filter_by(user_id=current_user.id)
            .order_by(DietLog.date.asc())
            .all())
    return jsonify({
        'logs':    [log.to_dict() for log in logs],
        'profile': current_user.to_profile_dict(),
        'tdee':    current_user.calculate_tdee(),
    })


@app.route('/api/profile', methods=['POST'])
@login_required
def api_update_profile():
    """Update the current user's physical profile."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'height_cm' in data and data['height_cm']:
        current_user.height_cm = float(data['height_cm'])
    if 'weight_kg' in data and data['weight_kg']:
        current_user.weight_kg = float(data['weight_kg'])
    if 'age' in data and data['age']:
        current_user.age = int(data['age'])
    if 'gender' in data and data['gender']:
        current_user.gender = data['gender']

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to update profile. Please try again.'}), 500
    return jsonify({'status': 'updated', 'profile': current_user.to_profile_dict()})


# ── DB Init & Run ──────────────────────────────────────────────────
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    # threaded=True handles multiple simultaneous users on the dev server
    app.run(debug=True, port=5000, threaded=True)
