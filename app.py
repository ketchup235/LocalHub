from flask import Flask, jsonify, request, render_template, session
import secrets
import urllib.request
import urllib.parse
import json
import random
import sqlite3
import re
from datetime import datetime

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

DB_FILE = "localhub.db"

def init_db():
    """
    Initializes the SQLite database and creates necessary tables for reviews, 
    coupons, and the persistent business cache directory.
    """
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS reviews 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  business_id TEXT, 
                  user TEXT, 
                  rating INTEGER, 
                  text TEXT, 
                  date TEXT)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS coupons 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  business_id TEXT, 
                  code TEXT, 
                  discount TEXT,
                  date TEXT)''')
    
    # The new Persistent Cache table
    c.execute('''CREATE TABLE IF NOT EXISTS businesses 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  api_id TEXT UNIQUE,
                  name TEXT, 
                  category TEXT, 
                  address TEXT, 
                  zip_code TEXT,
                  base_rating REAL)''')
    conn.commit()
    conn.close()

init_db()

def get_db_connection():
    """Establishes and returns a dictionary-formatted SQLite database connection."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def fetch_local_data(location_query):
    """
    Fetches geolocation coordinates via Nominatim and local business nodes via the Overpass API.
    Implements an algorithmic blacklist to exclude corporate chains, ensuring
    only hyper-local Mom & Pop businesses are processed and returned.
    """
    businesses = []
    
    # Algorithmic blacklist to ensure true local results
    CHAIN_BLACKLIST = [
        "pizza hut", "mcdonald", "burger king", "subway", "starbucks", "dunkin", 
        "domino", "taco bell", "wendy", "cvs", "walgreens", "rite aid", "walmart", 
        "target", "lowe's", "home depot", "wawa", "sheetz", "7-eleven", "dollar general",
        "giant", "acme", "wegmans", "kfc", "popeyes", "panera", "chipotle"
    ]

    try:
        base_url = "https://nominatim.openstreetmap.org/search"
        params = {'q': location_query, 'format': 'json', 'limit': 1, 'countrycodes': 'us'}
        headers = {'User-Agent': 'FBLA_LocalHub_Project/1.0'}
        
        req = urllib.request.Request(f"{base_url}?{urllib.parse.urlencode(params)}", headers=headers)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            
        if not data: return []
        lat, lon = data[0]['lat'], data[0]['lon']
        
        overpass_url = "https://overpass-api.de/api/interpreter"
        overpass_query = f"""
        [out:json];
        (
          node["amenity"~"restaurant|cafe|bar|pub|ice_cream|fast_food"](around:5000, {lat}, {lon});
          node["amenity"~"hairdresser|beauty|tattoo|spa|gym"](around:5000, {lat}, {lon});
          node["shop"](around:5000, {lat}, {lon});
        );
        out body 40; 
        """
        
        data_req = urllib.request.Request(overpass_url, data=overpass_query.encode('utf-8'))
        with urllib.request.urlopen(data_req) as response:
            osm_data = json.loads(response.read())

        for element in osm_data.get('elements', []):
            tags = element.get('tags', {})
            name = tags.get('name', 'Unknown')
            
            if name == 'Unknown': continue
            if any(chain in name.lower() for chain in CHAIN_BLACKLIST): continue
            if 'brand' in tags: continue

            category = "retail"
            if "amenity" in tags:
                if tags["amenity"] in ["restaurant", "cafe", "fast_food", "bar"]: category = "food"
                elif tags["amenity"] in ["hairdresser", "beauty", "spa", "gym"]: category = "services"
            
            base_rating = round(random.uniform(3.0, 5.0), 1)

            businesses.append({
                "id": str(element['id']),
                "name": name,
                "category": category,
                "base_rating": base_rating,
                "address": location_query
            })
            
    except Exception as e:
        print(f"Error: {e}")
        return []

    return businesses

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/businesses')
def get_businesses():
    """
    main data route. implements persistent db hydration logic.
    checks local SQLite directory first for instant loading. if missing, 
    fetches from API, filters, and permanently saves to the local db.
    applies custom review-weighting algorithm before returning to frontend.
    """
    zip_code = request.args.get('zip', '').strip()
    
    # input validation
    if not zip_code or not re.match(r'^\d{5}$', zip_code) or int(zip_code) < 500:
        return jsonify([])

    conn = get_db_connection()
    raw_data = []

    # 1. check sqlite cache
    db_businesses = conn.execute('SELECT * FROM businesses WHERE zip_code = ?', (zip_code,)).fetchall()

    if len(db_businesses) > 0:
        for b in db_businesses:
            raw_data.append({
                'id': str(b['api_id']), 
                'name': b['name'],
                'category': b['category'],
                'address': b['address'],
                'base_rating': b['base_rating']
            })
    else:
        # 2. if not found fetch from openstreetmap
        raw_data = fetch_local_data(zip_code)
        
        # 3. save to db for next time
        for b in raw_data:
            try:
                conn.execute(
                    'INSERT INTO businesses (api_id, name, category, address, zip_code, base_rating) VALUES (?, ?, ?, ?, ?, ?)',
                    (b['id'], b['name'], b['category'], b['address'], zip_code, b.get('base_rating', 4.0))
                )
            except sqlite3.IntegrityError:
                pass
        conn.commit()

    # 4. reviews and coupons logic
    enhanced_data = []
    
    for b in raw_data:
        business = b.copy()
        b_id = business['id']

        # reviews
        reviews = conn.execute('SELECT rating FROM reviews WHERE business_id = ?', (b_id,)).fetchall()
        
        if reviews:
            user_ratings = [r['rating'] for r in reviews]
            avg_user_rating = sum(user_ratings) / len(user_ratings)
            # weighting algorithm
            final_rating = (avg_user_rating * 0.7) + (business['base_rating'] * 0.3)
            business['rating'] = round(final_rating, 1)
            business['review_count'] = len(reviews)
        else:
            business['rating'] = business['base_rating']
            business['review_count'] = 0

        # coupons
        coupons = conn.execute('SELECT code, discount FROM coupons WHERE business_id = ?', (b_id,)).fetchall()
        business['deals'] = [{"code": c['code'], "discount": c['discount']} for c in coupons]

        enhanced_data.append(business)

    conn.close()
    return jsonify(enhanced_data)

@app.route('/api/reviews/<id>')
def get_reviews(id):
    conn = get_db_connection()
    # parameterized query stops sql injection attacks
    db_reviews = conn.execute('SELECT user, rating, text, date FROM reviews WHERE business_id = ? ORDER BY id DESC', (id,)).fetchall()
    conn.close()
    
    reviews_list = [dict(row) for row in db_reviews]
    return jsonify(reviews_list)

@app.route('/api/review', methods=['POST'])
def add_review():
    data = request.json
    conn = get_db_connection()
    conn.execute('INSERT INTO reviews (business_id, user, rating, text, date) VALUES (?, ?, ?, ?, ?)',
                 (data['businessId'], data['user'], data['rating'], data['text'], datetime.now().strftime("%Y-%m-%d")))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/coupon', methods=['POST'])
def add_coupon():
    data = request.json
    
    # input validation
    if not data.get('code') or not data.get('discount'):
        return jsonify({"success": False, "error": "Missing fields"})

    conn = get_db_connection()
    conn.execute('INSERT INTO coupons (business_id, code, discount, date) VALUES (?, ?, ?, ?)',
                 (data['businessId'], data['code'], data['discount'], datetime.now().strftime("%Y-%m-%d")))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/captcha')
def get_captcha():
    # generates a dynamic math problem and stores answer in server session
    num1 = secrets.randbelow(10)
    num2 = secrets.randbelow(10)
    session['captcha_answer'] = num1 + num2
    return jsonify({"question": f"What is {num1} + {num2}?"})

@app.route('/api/verify-captcha', methods=['POST'])
def verify_captcha():
    # provides validation by checking user input against the server session truth
    data = request.json
    if 'answer' not in data:
        return jsonify({"success": False})
    
    try:
        user_ans = int(data['answer'])
        correct_ans = session.get('captcha_answer')
        if user_ans == correct_ans:
            return jsonify({"success": True})
    except ValueError:
        pass
        
    return jsonify({"success": False})

if __name__ == '__main__':
    app.run(debug=True, port=5000)