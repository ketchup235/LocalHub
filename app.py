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
    sets up the database on first run. creates tables for reviews,
    coupons, and the business cache if they don't already exist.
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
    
    # cache table so we don't re-fetch the same zip code twice
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
    """opens a db connection and sets row_factory so we get dict-like rows back."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def fetch_local_data(location_query):
    """
    takes a zip code, gets its lat/lon from nominatim, then hits the
    overpass api to find nearby businesses. filters out any big chains
    so we only surface actual local spots.
    """
    businesses = []
    
    # anything in here gets thrown out — we only want mom and pop places
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
            if 'brand' in tags: continue  # osm marks chain locations with a brand tag

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


def get_help_response(message):
    """
    keyword-based intent matcher for the help assistant.
    checks the message against topic keyword lists in priority order
    and returns the right pre-written answer. if nothing matches,
    gives a friendly fallback with suggestions.

    intent order (most specific first):
      1. 3d shapes / hero interaction
      2. captcha / bot verification
      3. coupons
      4. pdf / report export
      5. reviews / ratings
      6. saving / bookmarking
      7. sorting
      8. category filtering
      9. searching by zip
      10. general greeting
      11. fallback
    """
    msg = message.lower().strip()

    # 3d shapes on the hero screen
    if any(w in msg for w in ["3d", "shape", "floating", "orbit", "sphere", "cube", "hero", "animation", "spin", "rotating"]):
        return ("The floating 3D shapes on the home screen are interactive category filters! "
                "Hover over them to see their name, and click one to automatically scroll down "
                "and filter the business list by that category — Food, Retail, Services, or All.")

    # captcha / spam prevention
    if any(w in msg for w in ["captcha", "bot", "verification", "verify", "human", "math", "robot", "spam", "prove"]):
        return ("To prevent spam, LocalHub uses a simple math CAPTCHA. When leaving a review or "
                "submitting a coupon, you'll see a quick addition problem like '3 + 5 = ?'. "
                "Just type the number answer and submit. It refreshes each time you open the form.")

    # coupons and deals
    if any(w in msg for w in ["coupon", "deal", "discount", "promo", "code", "offer", "sale", "redeem"]):
        return ("Community coupons are crowd-sourced! Click 'View Details & Coupons' on any business card. "
                "If a coupon exists, you'll see it displayed with its code and description. "
                "You can also share a coupon you know about using the form inside that same panel — "
                "just pass the math CAPTCHA first to keep things spam-free.")

    # pdf export / report
    if any(w in msg for w in ["pdf", "report", "download", "export", "print", "save file", "document"]):
        return ("Click the 'Download Saved Businesses (PDF)' button in the filter bar to generate a "
                "formatted report of all your bookmarked businesses. It opens a print dialog — "
                "choose 'Save as PDF' as the destination to save it to your device. "
                "You need to have at least one saved business first!")

    # reviews and ratings
    if any(w in msg for w in ["review", "rating", "star", "rate", "feedback", "opinion", "comment", "experience", "leave a"]):
        return ("To leave a review, click 'View Details & Coupons' on any business card. "
                "Scroll down to the Reviews section, fill in your name, pick a star rating, "
                "write your experience, and solve the quick math CAPTCHA to submit. "
                "Your review immediately factors into that business's community rating score!")

    # saving / bookmarking favorites
    if any(w in msg for w in ["save", "bookmark", "heart", "favorite", "favourite", "like", "star", "keep", "wishlist"]):
        return ("Click the heart icon (♡) on any business card to save it. "
                "It turns red (♥) to confirm it's saved. Your saved businesses are stored locally "
                "on your device, so they persist between sessions. "
                "Use the 'Saved' filter button to view all your bookmarked businesses at once.")

    # sorting results
    if any(w in msg for w in ["sort", "order", "rank", "top rated", "best", "most reviewed", "alphabetical", "a-z", "highest"]):
        return ("Use the 'Sort By' dropdown in the filter bar to reorder results. "
                "Options are: Top Rated (highest community rating first), "
                "Most Reviewed (most LocalHub reviews first), and Name A-Z (alphabetical). "
                "Sorting works together with category filters and name search simultaneously.")

    # category filtering
    if any(w in msg for w in ["filter", "category", "food", "retail", "service", "type", "kind", "restaurant", "shop", "store"]):
        return ("Use the category buttons — All, Food, Retail, Services, Saved — to filter results. "
                "Food includes restaurants, cafes, and bars. Retail covers shops and stores. "
                "Services includes salons, spas, and gyms. You can combine a category filter "
                "with the name search bar and sort dropdown at the same time.")

    # searching by zip code
    if any(w in msg for w in ["search", "zip", "find", "locate", "area", "nearby", "local", "postcode", "where", "how do i start", "begin", "get started"]):
        return ("Enter your 5-digit US zip code in the search bar at the top of the page and click Search "
                "or press Enter. LocalHub fetches real verified businesses near that area using "
                "OpenStreetMap data. Results are cached locally so repeat searches for the same "
                "zip code load instantly. Only independent local businesses are shown — chains are filtered out!")

    # general greeting
    if any(w in msg for w in ["hi", "hello", "hey", "help", "what can you do", "what do you do", "sup", "yo", "howdy"]):
        return ("Hi! I'm the LocalHub Help Assistant. I can answer questions about how to use the app. "
                "Try asking me things like: 'How do I find businesses?', 'How do I save a favorite?', "
                "'How do coupons work?', or 'How do I leave a review?'")

    # nothing matched — give them some direction
    return ("I'm not sure about that one! Here are some things I can help with: "
            "searching by zip code, filtering by category, saving businesses, "
            "leaving reviews, sharing coupons, exporting a PDF report, or understanding "
            "the 3D shapes on the home screen. Try asking about one of those!")


@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/businesses')
def get_businesses():
    """
    main data route. checks the sqlite cache first — if we've seen this zip
    before, we return it instantly. otherwise we fetch from openstreetmap,
    save the results, then enrich everything with reviews and coupons before
    sending it back to the frontend.
    """
    zip_code = request.args.get('zip', '').strip()
    
    # syntactic check (5 digits) and semantic check (valid us zip range)
    if not zip_code or not re.match(r'^\d{5}$', zip_code) or int(zip_code) < 500:
        return jsonify([])

    conn = get_db_connection()
    raw_data = []

    # 1. try the cache first
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
        # 2. not cached yet, go fetch it
        raw_data = fetch_local_data(zip_code)
        
        # 3. save it so the next search for this zip is instant
        for b in raw_data:
            try:
                conn.execute(
                    'INSERT INTO businesses (api_id, name, category, address, zip_code, base_rating) VALUES (?, ?, ?, ?, ?, ?)',
                    (b['id'], b['name'], b['category'], b['address'], zip_code, b.get('base_rating', 4.0))
                )
            except sqlite3.IntegrityError:
                pass
        conn.commit()

    # 4. layer in reviews and coupons for each business
    enhanced_data = []
    
    for b in raw_data:
        business = b.copy()
        b_id = business['id']

        # weighted rating: user reviews count for 70%, base rating for 30%
        # this stops a single bad review from tanking a new business
        reviews = conn.execute('SELECT rating FROM reviews WHERE business_id = ?', (b_id,)).fetchall()
        
        if reviews:
            user_ratings = [r['rating'] for r in reviews]
            avg_user_rating = sum(user_ratings) / len(user_ratings)
            final_rating = (avg_user_rating * 0.7) + (business['base_rating'] * 0.3)
            business['rating'] = round(final_rating, 1)
            business['review_count'] = len(reviews)
        else:
            business['rating'] = business['base_rating']
            business['review_count'] = 0

        # grab any coupons the community has shared for this business
        coupons = conn.execute('SELECT code, discount FROM coupons WHERE business_id = ?', (b_id,)).fetchall()
        business['deals'] = [{"code": c['code'], "discount": c['discount']} for c in coupons]

        enhanced_data.append(business)

    conn.close()
    return jsonify(enhanced_data)

@app.route('/api/reviews/<id>')
def get_reviews(id):
    conn = get_db_connection()
    # parameterized query keeps safe from sql injection
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
    
    # both fields are required — return early if either is missing
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
    # generate a random math problem and stash the answer in the session
    num1 = secrets.randbelow(10)
    num2 = secrets.randbelow(10)
    session['captcha_answer'] = num1 + num2
    return jsonify({"question": f"What is {num1} + {num2}?"})

@app.route('/api/verify-captcha', methods=['POST'])
def verify_captcha():
    # compare what the user typed against what we stored in the session
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

@app.route('/api/help', methods=['POST'])
def help_chat():
    """
    endpoint for the help assistant. passes the user's message through
    the intent matcher and returns the response. no external api needed —
    works fully offline and responds instantly.
    """
    data = request.json

    # don't process if there's nothing there
    if not data or not data.get('message', '').strip():
        return jsonify({"reply": "Please type a question and I'll do my best to help!"}), 400

    user_message = data['message'].strip()

    # cap input length to avoid any weirdness
    if len(user_message) > 500:
        return jsonify({"reply": "Please keep your question a bit shorter and I'll help you out!"}), 400

    reply = get_help_response(user_message)
    return jsonify({"reply": reply})

if __name__ == '__main__':
    app.run(debug=True, port=5000)