// LocalHub Application Logic
class LocalHub {
  constructor() {
    this.businesses = []
    this.bookmarks = []
    this.currentCategory = "all"
    this.currentSort = "rating"
    this.isVerified = false
    this.selectedRating = 5

    this.init()
  }

  async init() {
    await this.loadBusinesses()
    await this.loadDeals()
    await this.loadBookmarks()
    this.setupEventListeners()
    this.setupSmoothScroll()
  }

  // API Methods
  async loadBusinesses() {
    try {
      const params = new URLSearchParams({
        category: this.currentCategory,
        sort: this.currentSort,
        search: document.getElementById("search-input")?.value || "",
      })

      const response = await fetch(`/api/businesses?${params}`)
      this.businesses = await response.json()
      this.renderBusinesses()
    } catch (error) {
      console.error("Failed to load businesses:", error)
    }
  }

  async loadDeals() {
    try {
      const response = await fetch("/api/deals")
      const deals = await response.json()
      this.renderDeals(deals)
    } catch (error) {
      console.error("Failed to load deals:", error)
    }
  }

  async loadBookmarks() {
    try {
      const response = await fetch("/api/bookmarks")
      const bookmarked = await response.json()
      this.bookmarks = bookmarked.map((b) => b.id)
      this.renderBookmarks(bookmarked)
    } catch (error) {
      console.error("Failed to load bookmarks:", error)
    }
  }

  async toggleBookmark(businessId, event) {
    event.stopPropagation()

    const isBookmarked = this.bookmarks.includes(businessId)
    const method = isBookmarked ? "DELETE" : "POST"

    try {
      const response = await fetch("/api/bookmarks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId }),
      })

      const result = await response.json()
      this.bookmarks = result.bookmarks

      // Update UI
      this.updateBookmarkButtons()
      await this.loadBookmarks()

      this.showToast(isBookmarked ? "Removed from saved" : "Saved to favorites")
    } catch (error) {
      console.error("Failed to toggle bookmark:", error)
    }
  }

  async loadBusinessDetail(businessId) {
    try {
      const [businessRes, reviewsRes] = await Promise.all([
        fetch(`/api/business/${businessId}`),
        fetch(`/api/reviews/${businessId}`),
      ])

      const business = await businessRes.json()
      const reviews = await reviewsRes.json()

      this.renderBusinessDetail(business, reviews)
      this.openModal("business-modal")
    } catch (error) {
      console.error("Failed to load business detail:", error)
    }
  }

  async submitReview(businessId) {
    if (!this.isVerified) {
      await this.showVerification()
      return
    }

    const name = document.getElementById("reviewer-name").value.trim() || "Anonymous"
    const text = document.getElementById("review-text").value.trim()

    if (!text) {
      this.showToast("Please write a review")
      return
    }

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          user: name,
          rating: this.selectedRating,
          text: text,
        }),
      })

      const result = await response.json()

      if (result.success) {
        this.showToast("Review submitted successfully!")
        await this.loadBusinessDetail(businessId)
        await this.loadBusinesses()
      } else {
        this.showToast(result.error || "Failed to submit review")
      }
    } catch (error) {
      console.error("Failed to submit review:", error)
    }
  }

  async showVerification() {
    try {
      const response = await fetch("/api/captcha")
      const { question } = await response.json()

      document.getElementById("captcha-question").textContent = question
      document.getElementById("captcha-input").value = ""
      document.getElementById("captcha-error").textContent = ""

      this.openModal("verification-modal")
    } catch (error) {
      console.error("Failed to load captcha:", error)
    }
  }

  async verifyCaptcha() {
    const answer = document.getElementById("captcha-input").value.trim()

    try {
      const response = await fetch("/api/verify-captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      })

      const result = await response.json()

      if (result.success) {
        this.isVerified = true
        this.closeModal("verification-modal")
        this.showToast("Verification successful! You can now leave reviews.")
      } else {
        document.getElementById("captcha-error").textContent = result.message
        await this.showVerification() // Refresh captcha
      }
    } catch (error) {
      console.error("Failed to verify captcha:", error)
    }
  }

  // Render Methods
  renderBusinesses() {
    const grid = document.getElementById("businesses-grid")
    grid.innerHTML = this.businesses.map((business) => this.createBusinessCard(business)).join("")
  }

  createBusinessCard(business) {
    const isBookmarked = this.bookmarks.includes(business.id)
    const icon = this.getCategoryIcon(business.category)

    return `
            <div class="business-card" onclick="app.loadBusinessDetail(${business.id})">
                <div class="card-image">
                    ${icon}
                    ${business.verified ? '<span class="card-badge">Verified</span>' : ""}
                    <button class="card-bookmark ${isBookmarked ? "bookmarked" : ""}" 
                            onclick="app.toggleBookmark(${business.id}, event)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="${isBookmarked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </button>
                </div>
                <div class="card-content">
                    <h3>
                        ${business.name}
                        ${
                          business.verified
                            ? `
                            <svg class="verified-badge" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        `
                            : ""
                        }
                    </h3>
                    <span class="card-category">${business.category}</span>
                    <p class="card-description">${business.description}</p>
                    <div class="card-meta">
                        <div class="rating">
                            <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            <span>${business.rating}</span>
                            <span class="review-count">(${business.review_count})</span>
                        </div>
                    </div>
                </div>
            </div>
        `
  }

  renderDeals(deals) {
    const container = document.getElementById("deals-container")

    if (deals.length === 0) {
      container.innerHTML = '<p class="empty-state visible">No active deals at the moment.</p>'
      return
    }

    container.innerHTML = deals
      .map(
        (deal) => `
            <div class="deal-card">
                <div class="deal-content">
                    <p class="deal-business">${deal.business_name}</p>
                    <h3 class="deal-title">${deal.title}</h3>
                    <div class="deal-code" onclick="app.copyCode('${deal.code}')">
                        <span>${deal.code}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </div>
                    <p class="deal-expires">Expires: ${deal.expires}</p>
                </div>
            </div>
        `,
      )
      .join("")
  }

  renderBookmarks(bookmarked) {
    const container = document.getElementById("bookmarks-container")
    const emptyState = document.getElementById("no-bookmarks")

    if (bookmarked.length === 0) {
      container.innerHTML = ""
      emptyState.classList.add("visible")
      return
    }

    emptyState.classList.remove("visible")
    container.innerHTML = bookmarked.map((business) => this.createBusinessCard(business)).join("")
  }

  renderBusinessDetail(business, reviews) {
    const icon = this.getCategoryIcon(business.category)
    const isBookmarked = this.bookmarks.includes(business.id)

    const modalBody = document.getElementById("modal-body")
    modalBody.innerHTML = `
            <div class="business-detail">
                <div class="detail-header">
                    <div>
                        <h2>
                            ${business.name}
                            ${
                              business.verified
                                ? `
                                <svg class="verified-badge" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                            `
                                : ""
                            }
                        </h2>
                        <span class="card-category">${business.category}</span>
                    </div>
                    <button class="btn-secondary ${isBookmarked ? "bookmarked" : ""}" 
                            onclick="app.toggleBookmark(${business.id}, event)">
                        ${isBookmarked ? "Saved" : "Save"}
                    </button>
                </div>
                
                <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">${business.description}</p>
                
                <div class="detail-info">
                    <div class="info-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <span>${business.address}</span>
                    </div>
                    <div class="info-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        <span>${business.phone}</span>
                    </div>
                    <div class="info-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>${business.hours}</span>
                    </div>
                    <div class="info-row">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                        <span><strong>${business.rating}</strong> (${business.review_count} reviews)</span>
                    </div>
                </div>
                
                ${
                  business.deals.length > 0
                    ? `
                    <div style="background: var(--accent-dim); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 2rem;">
                        <p style="color: var(--accent); font-weight: 600; margin-bottom: 0.5rem;">Active Deal</p>
                        <p style="font-weight: 500;">${business.deals[0].title}</p>
                        <div class="deal-code" onclick="app.copyCode('${business.deals[0].code}')" style="margin-top: 0.5rem;">
                            <span>${business.deals[0].code}</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </div>
                    </div>
                `
                    : ""
                }
                
                <div class="reviews-section">
                    <h3>Reviews</h3>
                    
                    <div class="review-form">
                        <h4>Write a Review</h4>
                        <div class="form-group">
                            <label>Your Rating</label>
                            <div class="star-rating" id="star-rating">
                                ${[1, 2, 3, 4, 5]
                                  .map(
                                    (i) => `
                                    <button class="${i <= this.selectedRating ? "active" : ""}" 
                                            onclick="app.setRating(${i})">
                                        <svg viewBox="0 0 24 24" fill="${i <= this.selectedRating ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
                                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                        </svg>
                                    </button>
                                `,
                                  )
                                  .join("")}
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="reviewer-name">Your Name (optional)</label>
                            <input type="text" id="reviewer-name" placeholder="Anonymous">
                        </div>
                        <div class="form-group">
                            <label for="review-text">Your Review</label>
                            <textarea id="review-text" rows="3" placeholder="Share your experience..."></textarea>
                        </div>
                        <button class="btn-primary" onclick="app.submitReview(${business.id})">
                            ${this.isVerified ? "Submit Review" : "Verify & Submit"}
                        </button>
                    </div>
                    
                    <div class="review-list">
                        ${
                          reviews.length > 0
                            ? reviews
                                .map(
                                  (review) => `
                            <div class="review-item">
                                <div class="review-header">
                                    <span class="review-user">${review.user}</span>
                                    <span class="review-date">${review.date}</span>
                                </div>
                                <div class="review-rating">
                                    ${[1, 2, 3, 4, 5]
                                      .map(
                                        (i) => `
                                        <svg viewBox="0 0 24 24" fill="${i <= review.rating ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" style="color: ${i <= review.rating ? "var(--warning)" : "var(--border)"}">
                                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                        </svg>
                                    `,
                                      )
                                      .join("")}
                                </div>
                                <p class="review-text">${review.text}</p>
                            </div>
                        `,
                                )
                                .join("")
                            : '<p style="color: var(--text-secondary);">No reviews yet. Be the first to share your experience!</p>'
                        }
                    </div>
                </div>
            </div>
        `
  }

  getCategoryIcon(category) {
    const icons = {
      food: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                <line x1="6" y1="1" x2="6" y2="4"></line>
                <line x1="10" y1="1" x2="10" y2="4"></line>
                <line x1="14" y1="1" x2="14" y2="4"></line>
            </svg>`,
      retail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>`,
      services: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
            </svg>`,
    }
    return icons[category] || icons.services
  }

  // Event Handlers
  setupEventListeners() {
    // Category filters
    document.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"))
        btn.classList.add("active")
        this.currentCategory = btn.dataset.category
        this.loadBusinesses()
      })
    })

    // Sort select
    document.getElementById("sort-select").addEventListener("change", (e) => {
      this.currentSort = e.target.value
      this.loadBusinesses()
    })

    // Search
    const searchInput = document.getElementById("search-input")
    const searchBtn = document.getElementById("search-btn")

    searchBtn.addEventListener("click", () => this.loadBusinesses())
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.loadBusinesses()
    })

    // Explore button
    document.getElementById("explore-btn").addEventListener("click", () => {
      document.getElementById("explore").scrollIntoView({ behavior: "smooth" })
    })

    // Modal close buttons
    document.querySelectorAll(".modal-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest(".modal").classList.remove("active")
      })
    })

    // Close modal on backdrop click
    document.querySelectorAll(".modal").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("active")
      })
    })

    // Verification
    document.getElementById("verify-btn").addEventListener("click", () => this.verifyCaptcha())
    document.getElementById("captcha-input").addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.verifyCaptcha()
    })
  }

  setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (e) => {
        e.preventDefault()
        const target = document.querySelector(anchor.getAttribute("href"))
        if (target) {
          target.scrollIntoView({ behavior: "smooth" })
        }
      })
    })
  }

  // Utility Methods
  setRating(rating) {
    this.selectedRating = rating
    const buttons = document.querySelectorAll("#star-rating button")
    buttons.forEach((btn, i) => {
      const svg = btn.querySelector("svg")
      if (i < rating) {
        btn.classList.add("active")
        svg.setAttribute("fill", "currentColor")
      } else {
        btn.classList.remove("active")
        svg.setAttribute("fill", "none")
      }
    })
  }

  updateBookmarkButtons() {
    document.querySelectorAll(".card-bookmark").forEach((btn) => {
      const card = btn.closest(".business-card")
      if (card) {
        const businessId = Number.parseInt(card.getAttribute("onclick").match(/\d+/)[0])
        if (this.bookmarks.includes(businessId)) {
          btn.classList.add("bookmarked")
          btn.querySelector("svg").setAttribute("fill", "currentColor")
        } else {
          btn.classList.remove("bookmarked")
          btn.querySelector("svg").setAttribute("fill", "none")
        }
      }
    })
  }

  openModal(modalId) {
    document.getElementById(modalId).classList.add("active")
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove("active")
  }

  copyCode(code) {
    navigator.clipboard.writeText(code).then(() => {
      this.showToast(`Copied: ${code}`)
    })
  }

  showToast(message) {
    // Remove existing toast
    const existingToast = document.querySelector(".toast")
    if (existingToast) existingToast.remove()

    const toast = document.createElement("div")
    toast.className = "toast"
    toast.textContent = message
    document.body.appendChild(toast)

    // Trigger animation
    setTimeout(() => toast.classList.add("show"), 10)

    // Remove after delay
    setTimeout(() => {
      toast.classList.remove("show")
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }
}

// Initialize app
let app
document.addEventListener("DOMContentLoaded", () => {
  app = new LocalHub()
})
