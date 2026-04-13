class Localyze {
  constructor() {
    this.businesses = []; // holds current zip search results
    this.currentZip = '';

    this.currentCategory = 'all';
    this.currentSort = 'default';
    this.currentSearchText = '';

    // store full business objects so saved view works offline
    this.savedBusinesses = JSON.parse(localStorage.getItem('localyze_saved_data')) || [];

    // help chat history stores {role, text} objects for conversation display
    this.chatHistory = [];

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

    // handle pdf report generation button
    const reportBtn = document.getElementById('generate-report-btn');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => this.generatePdf());
    }

    // handle help fab: opens modal and renders chat ui
    const helpFab = document.getElementById('help-fab');
    const helpModal = document.getElementById('help-modal');
    if (helpFab && helpModal) {
      helpFab.addEventListener('click', () => {
        helpModal.style.display = 'block';
        this.renderHelpChat();
      });
    }

    // close modals
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

  // ─────────────────────────────────────────────
  // help chat
  // ─────────────────────────────────────────────

  /**
   * renders the chat ui into the help modal.
   * called once when the modal opens. if already rendered, skips re-render.
   * injects a welcome message on first open.
   */
  renderHelpChat() {
    const modalContent = document.querySelector('#help-modal .modal-content');
    if (!modalContent) return;

    // only build ui once
    if (document.getElementById('chat-messages')) {
      this.scrollChatToBottom();
      return;
    }

    modalContent.innerHTML = `
      <button class="modal-close" aria-label="Close help modal" style="float:right; background:none; border:none; color:white; font-size:1.5rem; cursor:pointer; line-height:1;">&times;</button>
      <h3 style="margin-top:0; margin-bottom: 4px;">Localyze Assistant</h3>
      <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0; margin-bottom: 16px;">Intelligent Help. Ask me anything about the app</p>

      <div id="chat-messages" style="
        height: 320px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        background: #0a0a0a;
        border: 1px solid var(--border);
        border-radius: 10px;
        margin-bottom: 12px;
        scroll-behavior: smooth;
      "></div>

      <div style="display: flex; gap: 8px;">
        <input
          type="text"
          id="chat-input"
          placeholder="Ask a question..."
          aria-label="Type your help question"
          style="flex: 1; border-radius: 8px;"
          maxlength="500"
        />
        <button id="chat-send-btn" class="btn-primary" style="padding: 12px 20px; font-size: 0.9rem;" aria-label="Send message">
          Send
        </button>
      </div>

      <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px;">
        <span style="font-size: 0.75rem; color: var(--text-secondary); width: 100%; margin-bottom: 2px;">Quick questions:</span>
        <button class="chat-suggestion" data-q="How do I find businesses near me?">Find businesses</button>
        <button class="chat-suggestion" data-q="How do I save a favorite business?">Save favorites</button>
        <button class="chat-suggestion" data-q="How do coupons work?">Coupons</button>
        <button class="chat-suggestion" data-q="How do I leave a review?">Leave a review</button>
        <button class="chat-suggestion" data-q="How do I export a PDF report?">Export PDF</button>
        <button class="chat-suggestion" data-q="What are the floating 3D shapes?">3D shapes</button>
      </div>
    `;

    // rebind close button since we replaced innerhtml
    modalContent.querySelector('.modal-close').addEventListener('click', () => {
      document.getElementById('help-modal').style.display = 'none';
    });

    // send button
    document.getElementById('chat-send-btn').addEventListener('click', () => this.sendHelpMessage());

    // enter key to send
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendHelpMessage();
    });

    // quick suggestion chips
    modalContent.querySelectorAll('.chat-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('chat-input').value = btn.dataset.q;
        this.sendHelpMessage();
      });
    });

    // style suggestion chips
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .chat-suggestion {
        background: transparent;
        border: 1px solid var(--border);
        color: var(--text-secondary);
        padding: 5px 10px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 0.78rem;
        transition: all 0.2s;
        font-family: var(--font-main);
      }
      .chat-suggestion:hover {
        border-color: var(--accent);
        color: var(--accent);
      }
      .chat-bubble {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 0.88rem;
        line-height: 1.5;
        word-wrap: break-word;
      }
      .chat-bubble.user {
        align-self: flex-end;
        background: var(--accent);
        color: #000;
        border-bottom-right-radius: 3px;
      }
      .chat-bubble.assistant {
        align-self: flex-start;
        background: #1a1a1a;
        color: var(--text-primary);
        border: 1px solid var(--border);
        border-bottom-left-radius: 3px;
      }
      .chat-bubble.typing {
        align-self: flex-start;
        background: #1a1a1a;
        border: 1px solid var(--border);
        color: var(--text-secondary);
        font-style: italic;
        border-bottom-left-radius: 3px;
      }
    `;
    document.head.appendChild(styleEl);

    // inject welcome message into history and render it
    if (this.chatHistory.length === 0) {
      this.chatHistory.push({
        role: 'assistant',
        text: "Hi! I'm the Localyze Help Assistant. Ask me anything about how to use the app, or tap a quick question below to get started!"
      });
    }
    this.renderChatHistory();
  }

  /**
   * renders the full chatHistory array into #chat-messages
   * called after every new message is added to history
   */
  renderChatHistory() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = this.chatHistory.map(msg => `
      <div class="chat-bubble ${msg.role}">
        ${this.escapeHTML(msg.text)}
      </div>
    `).join('');

    this.scrollChatToBottom();
  }

  scrollChatToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) container.scrollTop = container.scrollHeight;
  }

  /**
   * reads chat input, adds user message to history,
   * shows typing indicator, calls /api/help, then renders reply.
   */
  async sendHelpMessage() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    // add user message to history and clear input
    this.chatHistory.push({ role: 'user', text: message });
    input.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    // show typing indicator while waiting for response
    const container = document.getElementById('chat-messages');
    this.renderChatHistory();
    if (container) {
      const typingBubble = document.createElement('div');
      typingBubble.className = 'chat-bubble typing';
      typingBubble.id = 'typing-indicator';
      typingBubble.textContent = 'Assistant is typing…';
      container.appendChild(typingBubble);
      this.scrollChatToBottom();
    }

    try {
      const res = await fetch('/api/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      const data = await res.json();
      this.chatHistory.push({ role: 'assistant', text: data.reply });
    } catch (err) {
      this.chatHistory.push({
        role: 'assistant',
        text: "Sorry, I couldn't connect. Make sure the Localyze server is running and try again!"
      });
    }

    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    this.renderChatHistory();
  }

  // ─────────────────────────────────────────────
  // search and filter
  // ─────────────────────────────────────────────

  handleSearch(zipValue) {
    const cleanedZip = zipValue.trim();
    const zipInput = document.getElementById('zip-input');
    const grid = document.getElementById('business-grid');

    // syntax validation (5 digits) + semantic validation (valid US zip range)
    if (!/^\d{5}$/.test(cleanedZip) || parseInt(cleanedZip, 10) < 500) {
      if (zipInput) {
        zipInput.classList.add('input-error');
      }
      if (grid) {
        grid.innerHTML = `
          <div class="empty-state" style="color: #ef4444; padding: 2rem;">
              <p style="font-size: 1.2rem;"><strong>Please enter a valid zip code.</strong></p>
          </div>
        `;
      }
      return;
    }

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
    // switch source array based on whether user is viewing saved businesses
    let sourceArray = this.currentCategory === 'saved' ? this.savedBusinesses : this.businesses;
    if (!sourceArray) return;
    let result = [...sourceArray];

    // category filter
    if (this.currentCategory !== 'saved' && this.currentCategory !== 'all') {
      result = result.filter(b => {
        const businessCat = (b.category || "").toLowerCase();
        const filterCat = this.currentCategory.toLowerCase();
        return businessCat.includes(filterCat);
      });
    }

    // text search filter
    if (this.currentSearchText.trim() !== '') {
      const lowerQuery = this.currentSearchText.toLowerCase();
      result = result.filter(b =>
        b.name.toLowerCase().includes(lowerQuery) ||
        (b.category && b.category.toLowerCase().includes(lowerQuery))
      );
    }

    // sorting: applied after filtering
    if (this.currentSort === 'rating') {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (this.currentSort === 'reviews') {
      result.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
    } else if (this.currentSort === 'name') {
      result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    this.renderBusinesses(result);
  }

  // ─────────────────────────────────────────────
  // saved
  // ─────────────────────────────────────────────

  toggleBookmark(id) {
    const savedIndex = this.savedBusinesses.findIndex(b => b.id === id);

    if (savedIndex >= 0) {
      // already saved: remove it
      this.savedBusinesses.splice(savedIndex, 1);
    } else {
      // not saved: find full object from current results and persist it
      const businessToSave = this.businesses.find(b => b.id === id);
      if (businessToSave) {
        this.savedBusinesses.push(businessToSave);
      }
    }

    // persist entire array of full objects to localStorage
    localStorage.setItem('localyze_saved_data', JSON.stringify(this.savedBusinesses));
    this.applyFilters();
  }

  // ─────────────────────────────────────────────
  // pdf report
  // ─────────────────────────────────────────────

  /**
   * shows a customization modal asking the user to pick a category filter
   * and sort order before generating the report. once they confirm, calls
   * buildAndPrintPdf with their selections.
   */
  generatePdf() {
    if (this.savedBusinesses.length === 0) {
      alert("You haven't saved any businesses yet! Save some local businesses first to generate a report.");
      return;
    }

    // build and inject the pdf options modal if it doesn't exist yet
    if (!document.getElementById('pdf-options-modal')) {
      const modalEl = document.createElement('div');
      modalEl.id = 'pdf-options-modal';
      modalEl.className = 'modal';
      modalEl.setAttribute('role', 'dialog');
      modalEl.setAttribute('aria-modal', 'true');
      modalEl.innerHTML = `
        <div class="modal-content" style="max-width: 420px;">
          <button class="modal-close" aria-label="Close PDF options">&times;</button>
          <h3 style="margin-top: 0;">Customize Your Report</h3>
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 20px;">Choose what to include before we generate your PDF.</p>

          <label style="display:block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem;">Filter by Category</label>
          <select id="pdf-category-select" aria-label="Filter PDF by category" style="width: 100%; margin-bottom: 16px;">
            <option value="all">All Categories</option>
            <option value="food">Food Only</option>
            <option value="retail">Retail Only</option>
            <option value="services">Services Only</option>
          </select>

          <label style="display:block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem;">Sort Order</label>
          <select id="pdf-sort-select" aria-label="Sort PDF report" style="width: 100%; margin-bottom: 24px;">
            <option value="default">Default Order</option>
            <option value="rating">Top Rated First</option>
            <option value="name">Name A-Z</option>
            <option value="category">Group by Category</option>
          </select>

          <button id="pdf-confirm-btn" class="btn-primary" style="width: 100%;">Generate PDF</button>
        </div>
      `;
      document.body.appendChild(modalEl);

      // close on backdrop click
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) modalEl.style.display = 'none';
      });

      // close button
      modalEl.querySelector('.modal-close').addEventListener('click', () => {
        modalEl.style.display = 'none';
      });

      // confirm button: read selections and build the pdf
      document.getElementById('pdf-confirm-btn').addEventListener('click', () => {
        const categoryFilter = document.getElementById('pdf-category-select').value;
        const sortOrder = document.getElementById('pdf-sort-select').value;
        modalEl.style.display = 'none';
        this.buildAndPrintPdf(categoryFilter, sortOrder);
      });
    }

    // show the modal
    document.getElementById('pdf-options-modal').style.display = 'block';
  }

  /**
   * takes the user's chosen category and sort order, filters and sorts
   * the saved businesses array, then opens a styled print window.
   */
  buildAndPrintPdf(categoryFilter, sortOrder) {
    // apply category filter
    let reportData = [...this.savedBusinesses];

    if (categoryFilter !== 'all') {
      reportData = reportData.filter(b => b.category?.toLowerCase() === categoryFilter);
    }

    // apply sort order
    if (sortOrder === 'rating') {
      reportData.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortOrder === 'name') {
      reportData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortOrder === 'category') {
      reportData.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
    }

    // nothing left after filtering — tell the user instead of printing a blank page
    if (reportData.length === 0) {
      alert(`No saved businesses in the "${categoryFilter}" category. Try a different filter.`);
      return;
    }

    // human-readable labels for the report header
    const categoryLabel = categoryFilter === 'all' ? 'All Categories' : categoryFilter.charAt(0).toUpperCase() + categoryFilter.slice(1);
    const sortLabel = { default: 'Default Order', rating: 'Top Rated First', name: 'Name A-Z', category: 'Grouped by Category' }[sortOrder];

    // build formatted html table rows for each business in the report
    const tableRows = reportData.map(b => `
      <tr>
        <td><strong>${this.escapeHTML(b.name)}</strong></td>
        <td class="category">${this.escapeHTML(b.category)}</td>
        <td>${b.rating} ⭐ (${b.review_count} reviews on Localyze)</td>
        <td>${this.escapeHTML(b.address)}</td>
      </tr>
    `).join('');

    const pdfHtml = `
      <html>
        <head>
          <title>Localyze - My Saved Directory</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #222; padding: 40px; margin: 0; }
            .header { text-align: center; border-bottom: 3px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 32px; font-weight: 800; color: #000; margin: 0; }
            .subtitle { font-size: 16px; color: #555; margin-top: 5px; }
            .meta { font-size: 12px; color: #888; margin-top: 4px; }
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
            <h1 class="title">Localyze</h1>
            <p class="subtitle">Your Guide to Local Businesses</p>
            <p class="meta">Category: ${categoryLabel} &nbsp;|&nbsp; Sorted: ${sortLabel}</p>
            <p class="meta">Generated on: ${new Date().toLocaleDateString()} &nbsp;|&nbsp; ${reportData.length} business${reportData.length !== 1 ? 'es' : ''}</p>
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
            <p><strong>localyze.app</strong></p>
          </div>
        </body>
      </html>
    `;

    // open hidden window, write the html, and trigger browser print to pdf dialog
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.open();
    printWindow.document.write(pdfHtml);
    printWindow.document.close();

    // small delay to allow styles to load before print dialog fires
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  // ─────────────────────────────────────────────
  // rendering
  // ─────────────────────────────────────────────

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

  // ─────────────────────────────────────────────
  // bsiness modal
  // ─────────────────────────────────────────────

  async openModal(id) {
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

  // ─────────────────────────────────────────────
  // captcha
  // ─────────────────────────────────────────────

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

  // ─────────────────────────────────────────────
  // review and coupon submission handlers
  // ─────────────────────────────────────────────

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
  window.app = new Localyze();
});