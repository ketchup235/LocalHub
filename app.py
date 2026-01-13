from flask import Flask, render_template, jsonify, request, session
from functools import wraps
import json
import random
import string
from datetime import datetime, timedelta

app = Flask(__name__)
app.secret_key = 'local_biz_secret_key_2024'

# In-memory database simulation
businesses = [
    {
        "id": 1,
        "name": "The Rustic Spoon",
        "category": "food",
        "description": "Farm-to-table restaurant featuring seasonal ingredients from local farms.",
        "address": "123 Main Street",
        "phone": "(555) 123-4567",
        "rating": 4.7,
        "review_count": 89,
        "image": "restaurant",
        "hours": "Mon-Sun: 11am-10pm",
        "verified": True,
        "deals": [{"title": "15% Off Dinner", "code": "RUSTIC15", "expires": "2026-02-28"}]
    },
    {
        "id": 2,
        "name": "Bloom & Grow Garden Center",
        "category": "retail",
        "description": "Family-owned nursery with native plants and expert gardening advice.",
        "address": "456 Oak Avenue",
        "phone": "(555) 234-5678",
        "rating": 4.9,
        "review_count": 156,
        "image": "garden",
        "hours": "Mon-Sat: 8am-6pm",
        "verified": True,
        "deals": [{"title": "Buy 2 Get 1 Free Plants", "code": "BLOOM3", "expires": "2026-03-15"}]
    },
    {
        "id": 3,
        "name": "TechFix Pro",
        "category": "services",
        "description": "Expert device repair for phones, tablets, and computers. Same-day service available.",
        "address": "789 Tech Lane",
        "phone": "(555) 345-6789",
        "rating": 4.5,
        "review_count": 203,
        "image": "tech",
        "hours": "Mon-Fri: 9am-7pm, Sat: 10am-5pm",
        "verified": True,
        "deals": [{"title": "$20 Off Screen Repair", "code": "FIX20", "expires": "2026-02-15"}]
    },
    {
        "id": 4,
        "name": "Sunrise Bakery",
        "category": "food",
        "description": "Artisan breads and pastries baked fresh daily using traditional recipes.",
        "address": "321 Baker Street",
        "phone": "(555) 456-7890",
        "rating": 4.8,
        "review_count": 312,
        "image": "bakery",
        "hours": "Tue-Sun: 6am-3pm",
        "verified": True,
        "deals": [{"title": "Free Coffee with Pastry", "code": "SUNRISE", "expires": "2026-01-31"}]
    },
    {
        "id": 5,
        "name": "Paws & Claws Pet Care",
        "category": "services",
        "description": "Full-service pet grooming, boarding, and daycare with certified handlers.",
        "address": "555 Pet Paradise Blvd",
        "phone": "(555) 567-8901",
        "rating": 4.6,
        "review_count": 178,
        "image": "pets",
        "hours": "Mon-Sat: 7am-7pm",
        "verified": True,
        "deals": [{"title": "First Grooming 25% Off", "code": "PAWSFIRST", "expires": "2026-03-01"}]
    },
    {
        "id": 6,
        "name": "Vintage Finds Boutique",
        "category": "retail",
        "description": "Curated collection of vintage clothing, furniture, and unique home decor.",
        "address": "888 Nostalgia Way",
        "phone": "(555) 678-9012",
        "rating": 4.4,
        "review_count": 95,
        "image": "vintage",
        "hours": "Wed-Sun: 11am-6pm",
        "verified": False,
        "deals": []
    }
]

reviews_db = {
    1: [
        {"user": "Sarah M.", "rating": 5, "text": "Amazing farm-fresh ingredients! The seasonal menu never disappoints.", "date": "2026-01-10"},
        {"user": "Mike R.", "rating": 4, "text": "Great atmosphere and friendly staff. Highly recommend the pasta.", "date": "2026-01-08"}
    ],
    2: [
        {"user": "Linda K.", "rating": 5, "text": "Best selection of native plants in the area. Very knowledgeable staff!", "date": "2026-01-12"},
        {"user": "Tom B.", "rating": 5, "text": "My go-to place for all gardening needs. Fair prices too.", "date": "2026-01-05"}
    ],
    3: [
        {"user": "Alex J.", "rating": 5, "text": "Fixed my cracked screen in under an hour. Professional service!", "date": "2026-01-11"},
        {"user": "Jenny L.", "rating": 4, "text": "Good quality repair work. A bit pricey but worth it.", "date": "2026-01-03"}
    ],
    4: [
        {"user": "David W.", "rating": 5, "text": "The sourdough bread is incredible! Best bakery in town.", "date": "2026-01-13"},
        {"user": "Emma S.", "rating": 5, "text": "Fresh croissants every morning. My favorite local spot.", "date": "2026-01-09"}
    ],
    5: [
        {"user": "Chris P.", "rating": 5, "text": "My dog loves coming here! The groomers are so gentle and caring.", "date": "2026-01-07"},
        {"user": "Rachel H.", "rating": 4, "text": "Great boarding facility. Peace of mind when we travel.", "date": "2026-01-02"}
    ],
    6: [
        {"user": "Nina F.", "rating": 4, "text": "Found some amazing vintage pieces here. Unique items you won't find anywhere else.", "date": "2026-01-06"}
    ]
}

bookmarks = {}  # user_session -> list of business ids
captcha_store = {}  # session_id -> captcha_answer

def generate_captcha():
    """Generate a simple math captcha"""
    a = random.randint(1, 10)
    b = random.randint(1, 10)
    operators = [('+', a + b), ('-', abs(a - b)), ('×', a * b)]
    op, answer = random.choice(operators)
    if op == '-':
        a, b = max(a, b), min(a, b)
        answer = a - b
    question = f"{a} {op} {b}"
    return question, str(answer)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/businesses')
def get_businesses():
    category = request.args.get('category', 'all')
    sort_by = request.args.get('sort', 'rating')
    search = request.args.get('search', '').lower()
    
    filtered = businesses.copy()
    
    if category != 'all':
        filtered = [b for b in filtered if b['category'] == category]
    
    if search:
        filtered = [b for b in filtered if search in b['name'].lower() or search in b['description'].lower()]
    
    if sort_by == 'rating':
        filtered.sort(key=lambda x: x['rating'], reverse=True)
    elif sort_by == 'reviews':
        filtered.sort(key=lambda x: x['review_count'], reverse=True)
    elif sort_by == 'name':
        filtered.sort(key=lambda x: x['name'])
    
    return jsonify(filtered)

@app.route('/api/business/<int:business_id>')
def get_business(business_id):
    business = next((b for b in businesses if b['id'] == business_id), None)
    if business:
        return jsonify(business)
    return jsonify({"error": "Business not found"}), 404

@app.route('/api/reviews/<int:business_id>')
def get_reviews(business_id):
    return jsonify(reviews_db.get(business_id, []))

@app.route('/api/captcha')
def get_captcha():
    session_id = session.get('session_id', ''.join(random.choices(string.ascii_letters, k=16)))
    session['session_id'] = session_id
    question, answer = generate_captcha()
    captcha_store[session_id] = answer
    return jsonify({"question": question, "session_id": session_id})

@app.route('/api/verify-captcha', methods=['POST'])
def verify_captcha():
    data = request.json
    session_id = session.get('session_id')
    user_answer = data.get('answer', '')
    
    if session_id and captcha_store.get(session_id) == user_answer:
        session['verified'] = True
        del captcha_store[session_id]
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Incorrect answer. Please try again."})

@app.route('/api/review', methods=['POST'])
def add_review():
    if not session.get('verified'):
        return jsonify({"error": "Please complete verification first"}), 403
    
    data = request.json
    business_id = data.get('business_id')
    review = {
        "user": data.get('user', 'Anonymous'),
        "rating": data.get('rating', 5),
        "text": data.get('text', ''),
        "date": datetime.now().strftime("%Y-%m-%d")
    }
    
    if business_id not in reviews_db:
        reviews_db[business_id] = []
    reviews_db[business_id].insert(0, review)
    
    # Update business rating
    business = next((b for b in businesses if b['id'] == business_id), None)
    if business:
        all_reviews = reviews_db[business_id]
        avg_rating = sum(r['rating'] for r in all_reviews) / len(all_reviews)
        business['rating'] = round(avg_rating, 1)
        business['review_count'] = len(all_reviews)
    
    return jsonify({"success": True, "review": review})

@app.route('/api/bookmarks', methods=['GET', 'POST', 'DELETE'])
def handle_bookmarks():
    session_id = session.get('session_id', 'default')
    
    if request.method == 'GET':
        user_bookmarks = bookmarks.get(session_id, [])
        bookmarked_businesses = [b for b in businesses if b['id'] in user_bookmarks]
        return jsonify(bookmarked_businesses)
    
    elif request.method == 'POST':
        data = request.json
        business_id = data.get('business_id')
        if session_id not in bookmarks:
            bookmarks[session_id] = []
        if business_id not in bookmarks[session_id]:
            bookmarks[session_id].append(business_id)
        return jsonify({"success": True, "bookmarks": bookmarks[session_id]})
    
    elif request.method == 'DELETE':
        data = request.json
        business_id = data.get('business_id')
        if session_id in bookmarks and business_id in bookmarks[session_id]:
            bookmarks[session_id].remove(business_id)
        return jsonify({"success": True, "bookmarks": bookmarks.get(session_id, [])})

@app.route('/api/deals')
def get_deals():
    deals = []
    for business in businesses:
        for deal in business.get('deals', []):
            deals.append({
                **deal,
                "business_name": business['name'],
                "business_id": business['id']
            })
    return jsonify(deals)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
