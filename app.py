import json
import os
import re
import tempfile
import requests
import bcrypt
from functools import wraps
from flask import Flask, jsonify, render_template, abort, request, redirect, url_for, session

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-change-me')

# ── Auth ───────────────────────────────────────────────────────
# Passwords stored as bcrypt hashes in environment variables — never in source.
# Roles: family (read/write family DB), friends (read/write friends DB), guest (read-only friends DB)
ROLE_HASHES = {
    'family':  os.environ.get('FAMILY_HASH', ''),
    'friends': os.environ.get('FRIENDS_HASH', ''),
    'guest':   os.environ.get('GUEST_HASH', ''),
}

def get_role():
    return session.get('role')

def require_auth(write=False):
    """Decorator. write=True blocks guest (read-only) role."""
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            role = get_role()
            if not role:
                return redirect(url_for('login', next=request.path))
            if write and role == 'guest':
                abort(403)
            return f(*args, **kwargs)
        return wrapped
    return decorator

# ── Data paths ─────────────────────────────────────────────────
_BASE = os.path.dirname(os.path.abspath(__file__))

# Family DB
DATA_PATH    = os.path.join(_BASE, 'data', 'recipes.json')
NOTES_PATH   = os.path.join(_BASE, 'data', 'notes.json')
PLAN_PATH    = os.path.join(_BASE, 'data', 'plan.json')
GROCERY_PATH = os.path.join(_BASE, 'data', 'grocery.json')

# Friends DB
FRIENDS_DATA_PATH    = os.path.join(_BASE, 'data', 'recipes_friends.json')
FRIENDS_NOTES_PATH   = os.path.join(_BASE, 'data', 'notes_friends.json')
FRIENDS_PLAN_PATH    = os.path.join(_BASE, 'data', 'plan_friends.json')
FRIENDS_GROCERY_PATH = os.path.join(_BASE, 'data', 'grocery_friends.json')

GIST_ID      = os.environ.get('GIST_ID', 'bacfef3dd910515318fca3cfb5d3f50d')
GH_TOKEN     = os.environ.get('GITHUB_TOKEN', '')
MEAL_SLOTS   = ['breakfast', 'lunch', 'dinner', 'snack']

CATEGORY_ORDER = [
    'Breakfast and Baked Goods',
    'Appetizers and Snacks',
    'Soups, Sides and Salads',
    'Entrees',
    'Desserts',
    'Drinks',
    'Condiments and Sauces',
]

GROCERY_CATEGORIES = [
    'Produce',
    'Meat & Seafood',
    'Dairy & Eggs',
    'Bakery & Bread',
    'Pantry Staples',
    'Frozen',
    'Beverages',
    'Other',
]

# ── DB selector ────────────────────────────────────────────────
# Returns (recipes_path, notes_path, plan_path, grocery_path, gist_recipe_file, gist_notes_file, gist_plan_file, gist_grocery_file)
def _db_paths():
    role = get_role()
    if role == 'family':
        return (DATA_PATH, NOTES_PATH, PLAN_PATH, GROCERY_PATH,
                'recipes.json', 'notes.json', 'plan.json', 'grocery.json')
    else:
        return (FRIENDS_DATA_PATH, FRIENDS_NOTES_PATH, FRIENDS_PLAN_PATH, FRIENDS_GROCERY_PATH,
                'recipes_friends.json', 'notes_friends.json', 'plan_friends.json', 'grocery_friends.json')

# ── Gist helpers ───────────────────────────────────────────────
def _gist_get():
    if not GH_TOKEN:
        return None
    try:
        r = requests.get(
            f'https://api.github.com/gists/{GIST_ID}',
            headers={'Authorization': f'token {GH_TOKEN}', 'Accept': 'application/vnd.github.v3+json'},
            timeout=10
        )
        r.raise_for_status()
        return r.json()['files']
    except Exception as e:
        print(f'WARNING: Gist GET failed ({e})')
        return None

def _gist_patch(files_dict):
    if not GH_TOKEN:
        return
    try:
        r = requests.patch(
            f'https://api.github.com/gists/{GIST_ID}',
            headers={'Authorization': f'token {GH_TOKEN}', 'Accept': 'application/vnd.github.v3+json'},
            json={'files': {k: {'content': v} for k, v in files_dict.items()}},
            timeout=10
        )
        r.raise_for_status()
    except Exception as e:
        print(f'WARNING: Gist PATCH failed ({e})')

def _write_json(path, data):
    dir_ = os.path.dirname(path)
    os.makedirs(dir_, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=dir_, delete=False, suffix='.tmp', encoding='utf-8') as tmp:
        json.dump(data, tmp, indent=2, ensure_ascii=False)
        tmp_path = tmp.name
    os.replace(tmp_path, path)

# ── Persistence ────────────────────────────────────────────────
def load_recipes():
    rp, _, _, _, gist_r, _, _, _ = _db_paths()
    files = _gist_get()
    if files and gist_r in files:
        try:
            return json.loads(files[gist_r]['content'])['recipes']
        except Exception as e:
            print(f'WARNING: Gist recipes parse failed ({e})')
    if os.path.exists(rp):
        with open(rp, 'r', encoding='utf-8') as f:
            return json.load(f).get('recipes', [])
    return []

def save_recipes(recipes):
    rp, _, _, _, gist_r, _, _, _ = _db_paths()
    content = json.dumps({'recipes': recipes}, indent=2, ensure_ascii=False)
    _gist_patch({gist_r: content})
    _write_json(rp, {'recipes': recipes})

def load_notes():
    _, np, _, _, _, gist_n, _, _ = _db_paths()
    files = _gist_get()
    if files and gist_n in files:
        try:
            return json.loads(files[gist_n]['content'])
        except Exception as e:
            print(f'WARNING: Gist notes parse failed ({e})')
    if os.path.exists(np):
        with open(np, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_notes(notes):
    _, np, _, _, _, gist_n, _, _ = _db_paths()
    _gist_patch({gist_n: json.dumps(notes, indent=2, ensure_ascii=False)})
    _write_json(np, notes)

def load_plan():
    _, _, pp, _, _, _, gist_p, _ = _db_paths()
    files = _gist_get()
    if files and gist_p in files:
        try:
            return json.loads(files[gist_p]['content'])
        except Exception as e:
            print(f'WARNING: Gist plan parse failed ({e})')
    if os.path.exists(pp):
        with open(pp, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_plan(plan):
    _, _, pp, _, _, _, gist_p, _ = _db_paths()
    _gist_patch({gist_p: json.dumps(plan, indent=2, ensure_ascii=False)})
    _write_json(pp, plan)

def load_grocery():
    _, _, _, gp, _, _, _, gist_g = _db_paths()
    files = _gist_get()
    if files and gist_g in files:
        try:
            return json.loads(files[gist_g]['content'])
        except Exception as e:
            print(f'WARNING: Gist grocery parse failed ({e})')
    if os.path.exists(gp):
        with open(gp, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_grocery(grocery):
    _, _, _, gp, _, _, _, gist_g = _db_paths()
    _gist_patch({gist_g: json.dumps(grocery, indent=2, ensure_ascii=False)})
    _write_json(gp, grocery)

# ── Slug helpers ───────────────────────────────────────────────
RESERVED_SLUGS = {'new', 'edit'}

def slugify(name):
    slug = name.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-') or 'recipe'

def unique_slug(base, existing_ids):
    if base in RESERVED_SLUGS or base in existing_ids:
        counter = 2
        while f'{base}-{counter}' in existing_ids:
            counter += 1
        return f'{base}-{counter}'
    return base

# ── Form parsing ───────────────────────────────────────────────
def parse_recipe_form(form, recipe_id=None):
    errors = []
    name = form.get('recipe_name', '').strip()
    if not name:
        errors.append('Recipe name is required.')
    category = form.get('category', '').strip()
    if category not in CATEGORY_ORDER:
        errors.append('Please select a valid category.')

    try:
        serving_amount = float(form.get('serving_amount', 1))
    except ValueError:
        serving_amount = 1
        errors.append('Serving amount must be a number.')
    serving_unit = form.get('serving_unit', 'serving').strip() or 'serving'

    time_str = form.get('time_minutes', '').strip()
    time_minutes = None
    if time_str:
        try:
            time_minutes = int(time_str)
        except ValueError:
            errors.append('Time must be a whole number of minutes.')

    ing_names   = form.getlist('ing_name')
    ing_amounts = form.getlist('ing_amount')
    ing_units   = form.getlist('ing_unit')
    ingredients = []
    for n, a, u in zip(ing_names, ing_amounts, ing_units):
        if not n.strip():
            continue
        try:
            ingredients.append({'name': n.strip(), 'amount': float(a), 'unit': u.strip()})
        except ValueError:
            errors.append(f'Amount for "{n}" must be a number.')
    if not ingredients:
        errors.append('At least one ingredient is required.')

    instructions = [s.strip() for s in form.getlist('instruction') if s.strip()]
    if not instructions:
        errors.append('At least one instruction step is required.')

    macros = {}
    for key in ('calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'):
        try:
            macros[key] = int(round(float(form.get(key, 0) or 0)))
        except ValueError:
            macros[key] = 0
            errors.append(f'{key} must be a number.')

    effort = form.get('effort', 'easy').strip()
    if effort not in ('easy', 'medium', 'involved'):
        effort = 'easy'

    valid_tags = {'comfort food', 'light', 'fast food-ish', 'hearty', 'fresh', 'warming', 'sweet', 'savory', 'treat yourself'}
    tags = [t for t in form.getlist('tags') if t in valid_tags]

    batch_weight = None
    batch_weight_str = form.get('batch_weight_amount', '').strip()
    if batch_weight_str:
        try:
            batch_weight = {
                'amount': float(batch_weight_str),
                'unit': form.get('batch_weight_unit', 'g').strip() or 'g',
            }
        except ValueError:
            errors.append('Batch weight must be a number.')

    recipe = {
        'id': recipe_id or '',
        'name': name,
        'category': category,
        'effort': effort,
        'tags': tags,
        'serving_size': {'amount': serving_amount, 'unit': serving_unit},
        'ingredients': ingredients,
        'instructions': instructions,
        'macros': macros,
    }
    if time_minutes is not None:
        recipe['time_minutes'] = time_minutes
    if batch_weight:
        recipe['batch_weight'] = batch_weight

    return recipe, errors

# ── Recipe picker scoring ──────────────────────────────────────
def score_recipe(recipe, params):
    score = 0
    tod = params.get('time_of_day', '')
    category = recipe.get('category', '')
    if tod == 'morning' and category == 'Breakfast and Baked Goods':
        score += 3
    elif tod == 'afternoon' and category in ('Sides and Salads', 'Soups', 'Appetizers and Snacks'):
        score += 2
    elif tod == 'evening' and category in ('Entrees', 'Soups', 'Sides and Salads'):
        score += 3
    elif tod == 'night' and category in ('Desserts', 'Drinks', 'Snacks'):
        score += 2

    dow = params.get('day_of_week', '')
    effort = recipe.get('effort', 'easy')
    if dow in ('Saturday', 'Sunday') and effort == 'involved':
        score += 2
    elif dow not in ('Saturday', 'Sunday') and effort == 'easy':
        score += 2

    max_time = params.get('max_time')
    recipe_time = recipe.get('time_minutes')
    if max_time and recipe_time:
        if recipe_time <= int(max_time):
            score += 2
        else:
            score -= 3

    wanted_effort = params.get('effort', '')
    if wanted_effort and effort == wanted_effort:
        score += 3

    wanted_tags = params.get('tags', [])
    recipe_tags = recipe.get('tags', [])
    for tag in wanted_tags:
        if tag in recipe_tags:
            score += 2

    macro_filters = params.get('macro_filters', [])
    macros = recipe.get('macros', {})
    if 'low_calorie' in macro_filters and macros.get('calories', 999) <= 350:
        score += 2
    if 'low_carb' in macro_filters and macros.get('carbs_g', 999) <= 20:
        score += 2
    if 'high_protein' in macro_filters and macros.get('protein_g', 0) >= 25:
        score += 2
    if 'high_fiber' in macro_filters and macros.get('fiber_g', 0) >= 5:
        score += 2

    return score

# ── Auth routes ────────────────────────────────────────────────
@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        password = request.form.get('password', '').encode()
        for role, hash_ in ROLE_HASHES.items():
            if hash_ and bcrypt.checkpw(password, hash_.encode()):
                session['role'] = role
                next_url = request.args.get('next') or url_for('index')
                return redirect(next_url)
        error = 'Incorrect password.'
    return render_template('login.html', error=error)

@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return redirect(url_for('login'))

# ── Routes ─────────────────────────────────────────────────────
@app.route('/')
@require_auth()
def index():
    recipes = load_recipes()
    grouped = {cat: [] for cat in CATEGORY_ORDER}
    for r in recipes:
        cat = r.get('category')
        if cat in grouped:
            grouped[cat].append({'id': r['id'], 'name': r['name']})
    return render_template('index.html', grouped=grouped, category_order=CATEGORY_ORDER)

@app.route('/pick')
@require_auth()
def pick():
    return render_template('picker.html')

@app.route('/api/pick', methods=['POST'])
@require_auth()
def api_pick():
    params = request.get_json()
    params['tags'] = params.get('tags', [])
    params['macro_filters'] = params.get('macro_filters', [])
    recipes = load_recipes()
    scored = [(score_recipe(r, params), r) for r in recipes]
    scored.sort(key=lambda x: x[0], reverse=True)
    results = [
        {'id': r['id'], 'name': r['name'], 'category': r['category'],
         'time_minutes': r.get('time_minutes'), 'effort': r.get('effort'),
         'tags': r.get('tags', []), 'score': s}
        for s, r in scored if s > 0
    ]
    return jsonify(results)

@app.route('/api/random')
@require_auth()
def api_random():
    import random as rnd
    tod = request.args.get('tod', 'evening')
    preferred = {
        'morning':   ['Breakfast and Baked Goods', 'Drinks'],
        'afternoon': ['Entrees', 'Soups, Sides and Salads', 'Appetizers and Snacks'],
        'evening':   ['Entrees', 'Soups, Sides and Salads'],
        'night':     ['Appetizers and Snacks', 'Desserts'],
    }
    allowed = preferred.get(tod, preferred['evening'])
    recipes = load_recipes()
    pool = [r for r in recipes if r.get('category') in allowed]
    if not pool:
        pool = [r for r in recipes if r.get('category') not in ('Drinks', 'Condiments and Sauces')]
    if not pool:
        pool = recipes
    if not pool:
        abort(404)
    pick = rnd.choice(pool)
    return jsonify({'id': pick['id'], 'name': pick['name'], 'tod': tod})

@app.route('/recipe/new', methods=['GET', 'POST'])
@require_auth(write=True)
def recipe_new():
    if request.method == 'POST':
        recipe, errors = parse_recipe_form(request.form)
        if errors:
            return render_template('recipe_form.html', recipe=recipe, errors=errors,
                                   form_action=url_for('recipe_new'), page_title='Add Recipe',
                                   category_order=CATEGORY_ORDER)
        recipes = load_recipes()
        base = slugify(recipe['name'])
        recipe['id'] = unique_slug(base, {r['id'] for r in recipes})
        recipes.append(recipe)
        save_recipes(recipes)
        return redirect(url_for('recipe_page', recipe_id=recipe['id']))
    return render_template('recipe_form.html', recipe=None, errors=[],
                           form_action=url_for('recipe_new'), page_title='Add Recipe',
                           category_order=CATEGORY_ORDER)

@app.route('/recipe/<recipe_id>/edit', methods=['GET', 'POST'])
@require_auth(write=True)
def recipe_edit(recipe_id):
    recipes = load_recipes()
    existing = next((r for r in recipes if r['id'] == recipe_id), None)
    if not existing:
        abort(404)
    if request.method == 'POST':
        recipe, errors = parse_recipe_form(request.form, recipe_id=recipe_id)
        if errors:
            return render_template('recipe_form.html', recipe=recipe, errors=errors,
                                   form_action=url_for('recipe_edit', recipe_id=recipe_id),
                                   page_title='Edit Recipe', category_order=CATEGORY_ORDER)
        for i, r in enumerate(recipes):
            if r['id'] == recipe_id:
                recipes[i] = recipe
                break
        save_recipes(recipes)
        return redirect(url_for('recipe_page', recipe_id=recipe_id))
    return render_template('recipe_form.html', recipe=existing, errors=[],
                           form_action=url_for('recipe_edit', recipe_id=recipe_id),
                           page_title='Edit Recipe', category_order=CATEGORY_ORDER)

@app.route('/recipe/<recipe_id>/delete', methods=['POST'])
@require_auth(write=True)
def recipe_delete(recipe_id):
    recipes = load_recipes()
    recipes = [r for r in recipes if r['id'] != recipe_id]
    save_recipes(recipes)
    return redirect(url_for('index'))

@app.route('/recipe/<recipe_id>')
@require_auth()
def recipe_page(recipe_id):
    recipes = load_recipes()
    notes = load_notes()
    for r in recipes:
        if r['id'] == recipe_id:
            return render_template('recipe.html', recipe=r, note=notes.get(recipe_id, {}))
    abort(404)

@app.route('/api/notes/<recipe_id>', methods=['GET'])
@require_auth()
def get_note(recipe_id):
    notes = load_notes()
    return jsonify(notes.get(recipe_id, {}))

@app.route('/api/notes/<recipe_id>', methods=['POST'])
@require_auth(write=True)
def save_note(recipe_id):
    data = request.get_json()
    notes = load_notes()
    notes[recipe_id] = {
        'rating': int(data.get('rating', 0)),
        'text': data.get('text', '').strip(),
    }
    save_notes(notes)
    return jsonify({'ok': True})

@app.route('/api/recipe/<recipe_id>')
@require_auth()
def get_recipe(recipe_id):
    recipes = load_recipes()
    for r in recipes:
        if r['id'] == recipe_id:
            return jsonify(r)
    abort(404)

@app.route('/plan')
@require_auth()
def plan_page():
    recipes = load_recipes()
    recipe_list = [{'id': r['id'], 'name': r['name'], 'category': r['category']} for r in recipes]
    return render_template('planner.html', recipes=recipe_list, category_order=CATEGORY_ORDER)

@app.route('/api/plan')
@require_auth()
def api_plan():
    from datetime import date, timedelta
    week_str = request.args.get('week')
    try:
        week_start = date.fromisoformat(week_str)
    except (TypeError, ValueError):
        today = date.today()
        days_since_sunday = today.weekday() + 1 if today.weekday() != 6 else 0
        week_start = today - timedelta(days=days_since_sunday % 7)

    plan = load_plan()
    recipes = load_recipes()
    recipe_map = {r['id']: r for r in recipes}
    days = []
    week_totals = {'calories': 0, 'protein_g': 0, 'carbs_g': 0, 'fat_g': 0, 'fiber_g': 0}

    for i in range(7):
        day = week_start + timedelta(days=i)
        day_str = day.isoformat()
        day_plan = plan.get(day_str, {})
        slots = {}
        day_totals = {'calories': 0, 'protein_g': 0, 'carbs_g': 0, 'fat_g': 0, 'fiber_g': 0}
        for slot in MEAL_SLOTS:
            slot_recipes = []
            for rid in day_plan.get(slot, []):
                r = recipe_map.get(rid)
                if r:
                    slot_recipes.append({'id': r['id'], 'name': r['name'], 'macros': r['macros']})
                    for key in day_totals:
                        day_totals[key] += r['macros'].get(key, 0)
            slots[slot] = slot_recipes
        for key in week_totals:
            week_totals[key] += day_totals[key]
        days.append({
            'date': day_str, 'day_name': day.strftime('%a'), 'day_num': day.day,
            'month_abbr': day.strftime('%b'), 'slots': slots, 'totals': day_totals,
        })

    return jsonify({'week_start': week_start.isoformat(), 'days': days, 'week_totals': week_totals})

@app.route('/api/plan/add', methods=['POST'])
@require_auth(write=True)
def api_plan_add():
    data = request.get_json()
    date_str = data.get('date')
    slot = data.get('slot')
    recipe_id = data.get('recipe_id')
    if not all([date_str, slot, recipe_id]) or slot not in MEAL_SLOTS:
        abort(400)
    plan = load_plan()
    plan.setdefault(date_str, {}).setdefault(slot, [])
    if recipe_id not in plan[date_str][slot]:
        plan[date_str][slot].append(recipe_id)
    save_plan(plan)
    return jsonify({'ok': True})

@app.route('/api/plan/remove', methods=['POST'])
@require_auth(write=True)
def api_plan_remove():
    data = request.get_json()
    date_str = data.get('date')
    slot = data.get('slot')
    recipe_id = data.get('recipe_id')
    plan = load_plan()
    if date_str in plan and slot in plan.get(date_str, {}):
        plan[date_str][slot] = [r for r in plan[date_str][slot] if r != recipe_id]
    save_plan(plan)
    return jsonify({'ok': True})

@app.route('/grocery')
@require_auth()
def grocery_page():
    return render_template('grocery.html')

@app.route('/api/grocery')
@require_auth()
def api_grocery():
    from datetime import date
    today = date.today()
    grocery = load_grocery()
    pantry = grocery.get('pantry', [])
    for item in pantry:
        if item.get('expires'):
            try:
                days_left = (date.fromisoformat(item['expires']) - today).days
                item['days_left'] = days_left
            except ValueError:
                item['days_left'] = None
        else:
            item['days_left'] = None
    return jsonify({'pantry': pantry, 'shopping': grocery.get('shopping', []), 'categories': GROCERY_CATEGORIES})

@app.route('/api/grocery/pantry/add', methods=['POST'])
@require_auth(write=True)
def grocery_pantry_add():
    import time as _time
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        abort(400)
    grocery = load_grocery()
    grocery.setdefault('pantry', []).append({
        'id': str(int(_time.time() * 1000)),
        'name': name,
        'amount': data.get('amount', ''),
        'unit': data.get('unit', '').strip(),
        'expires': data.get('expires', ''),
        'category': data.get('category', 'Other'),
    })
    save_grocery(grocery)
    return jsonify({'ok': True})

@app.route('/api/grocery/pantry/remove', methods=['POST'])
@require_auth(write=True)
def grocery_pantry_remove():
    data = request.get_json()
    item_id = data.get('id')
    grocery = load_grocery()
    grocery['pantry'] = [i for i in grocery.get('pantry', []) if i.get('id') != item_id]
    save_grocery(grocery)
    return jsonify({'ok': True})

@app.route('/api/grocery/shopping/add', methods=['POST'])
@require_auth(write=True)
def grocery_shopping_add():
    import time as _time
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        abort(400)
    grocery = load_grocery()
    grocery.setdefault('shopping', []).append({
        'id': str(int(_time.time() * 1000)),
        'name': name,
        'amount': data.get('amount', ''),
        'unit': data.get('unit', '').strip(),
        'note': data.get('note', '').strip(),
        'checked': False,
        'category': data.get('category', 'Other'),
    })
    save_grocery(grocery)
    return jsonify({'ok': True})

@app.route('/api/grocery/shopping/remove', methods=['POST'])
@require_auth(write=True)
def grocery_shopping_remove():
    data = request.get_json()
    item_id = data.get('id')
    grocery = load_grocery()
    grocery['shopping'] = [i for i in grocery.get('shopping', []) if i.get('id') != item_id]
    save_grocery(grocery)
    return jsonify({'ok': True})

@app.route('/api/grocery/shopping/check', methods=['POST'])
@require_auth(write=True)
def grocery_shopping_check():
    data = request.get_json()
    item_id = data.get('id')
    checked = bool(data.get('checked', False))
    grocery = load_grocery()
    for item in grocery.get('shopping', []):
        if item.get('id') == item_id:
            item['checked'] = checked
            break
    save_grocery(grocery)
    return jsonify({'ok': True})

@app.route('/api/grocery/shopping/uncheck-all', methods=['POST'])
@require_auth(write=True)
def grocery_uncheck_all():
    grocery = load_grocery()
    for item in grocery.get('shopping', []):
        item['checked'] = False
    save_grocery(grocery)
    return jsonify({'ok': True})

@app.route('/api/grocery/shopping/move-to-pantry', methods=['POST'])
@require_auth(write=True)
def grocery_move_to_pantry():
    import time as _time
    grocery = load_grocery()
    checked = [i for i in grocery.get('shopping', []) if i.get('checked')]
    remaining = [i for i in grocery.get('shopping', []) if not i.get('checked')]
    grocery['shopping'] = remaining
    grocery.setdefault('pantry', [])
    for idx, item in enumerate(checked):
        grocery['pantry'].append({
            'id': str(int(_time.time() * 1000)) + str(idx),
            'name': item['name'],
            'amount': item.get('amount', ''),
            'unit': item.get('unit', ''),
            'expires': '',
            'category': item.get('category', 'Other'),
        })
    save_grocery(grocery)
    return jsonify({'ok': True, 'moved': len(checked)})

def _plan_ingredients():
    from datetime import date, timedelta
    today = date.today()
    days_since_sunday = (today.weekday() + 1) % 7
    week_start = today - timedelta(days=days_since_sunday)
    plan = load_plan()
    recipes = load_recipes()
    recipe_map = {r['id']: r for r in recipes}
    needed = {}
    for i in range(7):
        day_str = (week_start + timedelta(days=i)).isoformat()
        for slot in MEAL_SLOTS:
            for rid in plan.get(day_str, {}).get(slot, []):
                r = recipe_map.get(rid)
                if r:
                    for ing in r.get('ingredients', []):
                        key = ing['name'].lower().strip()
                        if key not in needed:
                            needed[key] = {'name': ing['name'], 'amount': ing['amount'], 'unit': ing['unit']}
                        else:
                            try:
                                needed[key]['amount'] += float(ing['amount'])
                            except (TypeError, ValueError):
                                pass
    return needed

@app.route('/api/grocery/from-plan', methods=['GET'])
@require_auth()
def grocery_from_plan_preview():
    needed = _plan_ingredients()
    grocery = load_grocery()
    pantry_names = {i['name'].lower().strip() for i in grocery.get('pantry', [])}
    shopping_names = {i['name'].lower().strip() for i in grocery.get('shopping', [])}
    items = []
    for key, ing in needed.items():
        items.append({
            'name': ing['name'], 'amount': ing['amount'], 'unit': ing['unit'],
            'in_pantry': key in pantry_names, 'in_shopping': key in shopping_names,
        })
    return jsonify({'items': items})

@app.route('/api/grocery/from-plan', methods=['POST'])
@require_auth(write=True)
def grocery_from_plan():
    import time as _time
    data = request.get_json()
    items = data.get('items', [])
    grocery = load_grocery()
    grocery.setdefault('shopping', [])
    for idx, ing in enumerate(items):
        name = ing.get('name', '').strip()
        if not name:
            continue
        grocery['shopping'].append({
            'id': str(int(_time.time() * 1000)) + str(idx),
            'name': name,
            'amount': ing.get('amount', ''),
            'unit': ing.get('unit', '').strip(),
            'note': 'from plan',
            'checked': False,
        })
    save_grocery(grocery)
    return jsonify({'ok': True, 'added': len(items)})

if __name__ == '__main__':
    app.run(debug=True, port=5000)