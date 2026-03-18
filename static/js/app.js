class LocalHub {
  constructor() {
    this.businesses = []; // Holds current zip search results
    this.currentZip = '';

    this.currentCategory = 'all';
    this.currentSort = 'default';
    this.currentSearchText = '';

    // BUG FIX: Store the FULL business objects, not just IDs
    this.savedBusinesses = JSON.parse(localStorage.getItem('localhub_saved_data')) || [];

    this.init();
  }

  async init() {
    this.bindEvents();
  }

  bindEvents() {
    const searchBtn = document.getElementById('search-btn');
    const zipInput = document.getElementById('zip-input');
    if (searchBtn && zipInput) {
      searchBtn.addEventListener('click', () => this.handleSearch(zipInput.value));
      zipInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleSearch(zipInput.value);
      });
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.currentSearchText = e.target.value;
        this.applyFilters();
      });
    }

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.currentSort = e.target.value;
        this.applyFilters();
      });
    }

    const catBtns = document.querySelectorAll('.filter-btn');
    catBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        catBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentCategory = e.currentTarget.dataset.category;
        this.applyFilters();
      });
    });

    // Handle PDF Report Generation Button
    const reportBtn = document.getElementById('generate-report-btn');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => this.generatePDF());
    }

    // Handle Interactive Q&A Help Modal
    const helpFab = document.getElementById('help-fab');
    const helpModal = document.getElementById('help-modal');
    if (helpFab && helpModal) {
      helpFab.addEventListener('click', () => helpModal.style.display = 'block');
    }

    // Close Modals
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.modal').style.display = 'none';
      });
    });

    window.onclick = (event) => {
      if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
      }
    }
  }

  handleSearch(zipValue) {
    const cleanedZip = zipValue.trim();
    const zipInput = document.getElementById('zip-input');
    const grid = document.getElementById('business-grid');

    // --- UPDATED FRONTEND VALIDATION ---
    // Check if it's NOT 5 digits, OR if it's mathematically under 500
    if (!/^\d{5}$/.test(cleanedZip) || parseInt(cleanedZip, 10) < 500) {

      // Turn the outline red using the CSS class
      if (zipInput) {
        zipInput.classList.add('input-error');
      }

      // Inject the red error message specifically (bypassing renderBusinesses)
      if (grid) {
        grid.innerHTML = `
          <div class="empty-state" style="color: #ef4444; padding: 2rem;">
              <p style="font-size: 1.2rem;"><strong>Please enter a valid zip code.</strong></p>
          </div>
        `;
      }

      return; // Stop the function here so it doesn't fetch from the server
    }

    // If we made it here, the ZIP is valid! 
    // Remove the error class just in case they are fixing a previous typo.
    if (zipInput) {
      zipInput.classList.remove('input-error');
    }

    this.currentZip = cleanedZip;
    this.currentCategory = 'all';
    this.currentSearchText = '';
    this.currentSort = 'default';

    const catBtns = document.querySelectorAll('.filter-btn');
    catBtns.forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('[data-category="all"]');
    if (allBtn) allBtn.classList.add('active');

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) sortSelect.value = 'default';

    this.loadBusinesses();
  }

  async loadBusinesses() {
    const grid = document.getElementById('business-grid');
    grid.innerHTML = '<p class="loading">Searching for small businesses...</p>';

    try {
      const res = await fetch(`/api/businesses?zip=${encodeURIComponent(this.currentZip)}`);
      this.businesses = await res.json();
      this.applyFilters();
    } catch (error) {
      console.error('Error:', error);
      grid.innerHTML = '<p class="error">Failed to load data. Make sure server is running.</p>';
    }
  }

  applyFilters() {
    // Determine source array based on category
    let sourceArray = this.currentCategory === 'saved' ? this.savedBusinesses : this.businesses;

    if (!sourceArray) return;
    let result = [...sourceArray];

    // --- THE FIX IS HERE ---
    // Instead of ===, we use .includes() to catch categories like "Food & Dining"
    if (this.currentCategory !== 'saved' && this.currentCategory !== 'all') {
      result = result.filter(b => {
        const businessCat = (b.category || "").toLowerCase();
        const filterCat = this.currentCategory.toLowerCase();
        return businessCat.includes(filterCat);
      });
    }

    // Apply text search
    if (this.currentSearchText.trim() !== '') {
      const lowerQuery = this.currentSearchText.toLowerCase();
      result = result.filter(b =>
        b.name.toLowerCase().includes(lowerQuery) ||
        (b.category && b.category.toLowerCase().includes(lowerQuery))
      );
    }

    // Apply sorting
    if (this.currentSort === 'rating') {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (this.currentSort === 'reviews') {
      result.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
    } else if (this.currentSort === 'name') {
      result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    this.renderBusinesses(result);
  }

  toggleBookmark(id) {
    // BUG FIX: Check if it's already saved by finding its index in the objects array
    const savedIndex = this.savedBusinesses.findIndex(b => b.id === id);

    if (savedIndex >= 0) {
      // Remove it if it exists
      this.savedBusinesses.splice(savedIndex, 1);
    } else {
      // Find the full object from the current search results and add it
      const businessToSave = this.businesses.find(b => b.id === id);
      if (businessToSave) {
        this.savedBusinesses.push(businessToSave);
      }
    }

    // Save the entire array of objects to localStorage
    localStorage.setItem('localhub_saved_data', JSON.stringify(this.savedBusinesses));
    this.applyFilters();
  }

  // PDF GENERATION FEATURE (Replaces CSV)
  generatePDF() {
    if (this.savedBusinesses.length === 0) {
      alert("You haven't saved any businesses yet! Save some local businesses first to generate a report.");
      return;
    }

    // Generate formatted HTML table rows for the PDF
    const tableRows = this.savedBusinesses.map(b => `
      <tr>
        <td><strong>${this.escapeHTML(b.name)}</strong></td>
        <td class="category">${this.escapeHTML(b.category)}</td>
        <td>${b.rating} ⭐ (${b.review_count} reviews on LocalHub)</td>
        <td>${this.escapeHTML(b.address)}</td>
      </tr>
    `).join('');

    // Create a beautiful HTML template for the print window
    const pdfHtml = `
      <html>
        <head>
          <title>LocalHub - My Saved Directory</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #222; padding: 40px; margin: 0; }
            .header { text-align: center; border-bottom: 3px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 32px; font-weight: 800; color: #000; margin: 0; }
            .subtitle { font-size: 16px; color: #555; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            th, td { padding: 15px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f8f9fa; font-weight: bold; color: #333; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
            .category { text-transform: capitalize; color: #10b981; font-weight: 600; }
            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { 
              body { -webkit-print-color-adjust: exact; color-adjust: exact; }
              @page { margin: 1cm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">LocalHub</h1>
            <p class="subtitle">Your Guide to Local Businesses</p>
            <p style="font-size: 12px; color: #888;">Generated on: ${new Date().toLocaleDateString()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Business Name</th>
                <th>Category</th>
                <th>Community Rating</th>
                <th>Zip Code / Address</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <div class="footer">
            <p>Thank you for supporting small businesses and your local community.</p>
            <p><strong>localhub.app</strong></p>
          </div>
        </body>
      </html>
    `;

    // Open a hidden window, write the HTML, and trigger the native Print/Save as PDF dialog
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.open();
    printWindow.document.write(pdfHtml);
    printWindow.document.close();

    // Wait for styles to load, then print
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
  }

  renderBusinesses(data) {
    const grid = document.getElementById('business-grid');
    if (!grid) return;

    if (data.length === 0) {
      grid.innerHTML =
        `<div class="empty-state">
            <p style="color: #FFCC00;"><strong>No businesses found!</strong></p>
        </div>`;
      return;
    }

    grid.innerHTML = data.map(business => {
      // BUG FIX: Check if business object exists in saved array
      const isSaved = this.savedBusinesses.some(saved => saved.id === business.id);
      const heartClass = isSaved ? 'saved' : '';
      const heartIcon = isSaved ? '&#9829;' : '&#9825;';

      return `
          <div class="business-card">
              <div class="card-header">
                  <div class="header-text">
                      <h3>${this.escapeHTML(business.name)}</h3>
                      <span class="category-badge">${business.category}</span>
                  </div>
                  <button class="btn-bookmark ${heartClass}" onclick="window.app.toggleBookmark('${business.id}')" aria-label="Save this business">
                      ${heartIcon}
                  </button>
              </div>
              
              <div class="rating">${business.rating} <span style="color:#666; font-size:0.8em">(${business.review_count} verified reviews)</span></div>
              
              ${business.deals && business.deals.length > 0
          ? `<div class="deal-badge">${this.escapeHTML(business.deals[0].discount)} (Code: ${this.escapeHTML(business.deals[0].code)})</div>`
          : ''}
              
              <button class="btn-details" onclick="window.app.openModal('${business.id}')">View Details & Coupons</button>
          </div>
          `;
    }).join('');
  }

  async openModal(id) {
    // BUG FIX: Check both arrays so the modal opens even if clicked from the "Saved" tab
    const business = this.businesses.find(b => b.id === id) || this.savedBusinesses.find(b => b.id === id);
    if (!business) return;

    const modal = document.getElementById('business-modal');
    const modalBody = document.getElementById('modal-body');

    const res = await fetch(`/api/reviews/${id}`);
    const reviews = await res.json();

    const couponsHtml = business.deals && business.deals.length > 0
      ? business.deals.map(d => `<div class="deal-badge" style="margin-top:5px"><strong>${this.escapeHTML(d.discount)}</strong> - Use Code: ${this.escapeHTML(d.code)}</div>`).join('')
      : '<p>No coupons yet. Do you know one?</p>';

    const reviewsHtml = reviews.map(r => `
          <div class="review-item">
              <strong>${this.escapeHTML(r.user)}</strong> <span>${r.rating} ⭐</span>
              <p>${this.escapeHTML(r.text)}</p>
              <small style="color:#666">${r.date}</small>
          </div>
      `).join('');

    modalBody.innerHTML = `
          <h2>${this.escapeHTML(business.name)}</h2>
          <p><strong>Category:</strong> <span style="text-transform: capitalize">${business.category}</span></p>
          <p><strong>Community Rating:</strong> ${business.rating} / 5</p>
          
          <hr style="border-color: #333; margin: 1rem 0;">
          
          <h3>Community Coupons</h3>
          <div id="coupons-list">${couponsHtml}</div>
          <button id="toggle-coupon-form" class="btn-details" style="margin-top:10px; font-size: 0.9rem;">Know about a coupon? Click here</button>
          
          <div id="coupon-form-container" style="display:none; margin-top:15px; background:#111; padding:15px; border-radius:8px; border:1px solid #333;">
              <h4>Share a Coupon</h4>
              <input type="text" id="coupon-code" placeholder="Coupon Code (e.g. SAVE10)" required>
              <input type="text" id="coupon-desc" placeholder="What does it do? (e.g. 10% Off)" required>
              <div class="captcha-section">
                  <p id="captcha-q-c">Loading...</p>
                  <input type="text" id="captcha-a-c" placeholder="Math Answer">
              </div>
              <button id="submit-coupon-btn" class="btn-primary" style="width:100%; margin-top:10px;">Submit Coupon</button>
          </div>

          <hr style="border-color: #333; margin: 1rem 0;">
          
          <h3>Reviews</h3>
          <div class="reviews-list">${reviews.length ? reviewsHtml : '<p>No reviews yet. Be the first!</p>'}</div>
          
          <h4 style="margin-top:20px">Leave a Review</h4>
          <form id="review-form">
              <input type="text" id="review-user" placeholder="Your Name" required>
              <select id="review-rating">
                  <option value="5">5 Stars</option>
                  <option value="4">4 Stars</option>
                  <option value="3">3 Stars</option>
                  <option value="2">2 Stars</option>
                  <option value="1">1 Star</option>
              </select>
              <textarea id="review-text" placeholder="Share your experience..." required></textarea>
              
              <div class="captcha-section">
                  <p id="captcha-q-r">Loading...</p>
                  <input type="text" id="captcha-a-r" placeholder="Math Answer" required>
              </div>
              
              <button type="submit" class="btn-primary">Submit Review</button>
          </form>
      `;

    modal.style.display = 'block';
    this.loadCaptcha('r');

    document.getElementById('toggle-coupon-form').addEventListener('click', () => {
      const form = document.getElementById('coupon-form-container');
      if (form.style.display === 'none') {
        form.style.display = 'block';
        this.loadCaptcha('c');
      } else {
        form.style.display = 'none';
      }
    });

    document.getElementById('submit-coupon-btn').addEventListener('click', () => this.submitCoupon(id));
    document.getElementById('review-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitReview(id);
    });
  }

  async loadCaptcha(type) {
    const res = await fetch('/api/captcha');
    const data = await res.json();
    const el = document.getElementById(`captcha-q-${type}`);
    if (el) el.innerText = data.question + " = ?";
  }

  async verifyCaptcha(answer) {
    const verifyRes = await fetch('/api/verify-captcha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: answer })
    });
    const verifyData = await verifyRes.json();
    return verifyData.success;
  }

  async submitReview(businessId) {
    const answer = document.getElementById('captcha-a-r').value;
    const isHuman = await this.verifyCaptcha(answer);

    if (!isHuman) {
      alert("Incorrect Math Answer! Please prove you are human.");
      return;
    }

    const reviewData = {
      businessId: businessId,
      user: document.getElementById('review-user').value,
      rating: document.getElementById('review-rating').value,
      text: document.getElementById('review-text').value
    };

    await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewData)
    });

    alert("Review Submitted! Thank you for supporting local.");
    document.getElementById('business-modal').style.display = 'none';
    this.loadBusinesses();
  }

  async submitCoupon(businessId) {
    const answer = document.getElementById('captcha-a-c').value;
    const code = document.getElementById('coupon-code').value;
    const disc = document.getElementById('coupon-desc').value;

    if (!code || !disc) {
      alert("Please fill in coupon details");
      return;
    }

    const isHuman = await this.verifyCaptcha(answer);
    if (!isHuman) {
      alert("Incorrect Math Answer! Please prove you are human.");
      return;
    }

    await fetch('/api/coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: businessId,
        code: code,
        discount: disc
      })
    });

    alert("Coupon Shared! Thank you for supporting the community.");
    document.getElementById('business-modal').style.display = 'none';
    this.loadBusinesses();
  }
}

window.app = null;
document.addEventListener('DOMContentLoaded', () => {
  window.app = new LocalHub();
});