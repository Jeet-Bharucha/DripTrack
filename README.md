# DRIPTRACK — Real-Time Price Intelligence

Real-time price tracking for sneakers, watches, bags, and streetwear across Nike, GOAT, StockX, Amazon, and more. Only authentic products.

---

## Features

- **Live price ticker** — scrolling price feed updated every 15 minutes
- **Product search & tracking** — search across multiple resale platforms
- **Watchlist** — save products and monitor price changes
- **Price alerts** — get notified by email when a product hits your target price
- **Price comparison** — compare prices across platforms side by side
- **Dark / light mode**
- **User accounts** — register, login, email verification, password reset

---

## Tech Stack

**Frontend**
- Vanilla HTML, CSS, JavaScript
- Google Fonts (Bebas Neue, Space Mono, Barlow Condensed)

**Backend**
- Node.js + Express
- MongoDB + Mongoose
- JWT authentication
- Nodemailer (Gmail) for transactional emails
- Axios for external API calls

**APIs**
- Rainforest API
- eBay API
- SerpAPI

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas account (or local MongoDB)
- Gmail account with App Password enabled

### Installation

1. **Clone the repo**
   ```bash
   git clone https://github.com/Jeet-Bharucha/DripTrack.git
   cd DripTrack
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Create your `.env` file** inside the `backend/` folder
   ```
   RAINFOREST_API_KEY=your_key_here
   EBAY_CLIENT_ID=your_key_here
   EBAY_CLIENT_SECRET=your_secret_here
   SERPAPI_KEY=your_key_here
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_random_secret_string
   GMAIL_USER=your_gmail@gmail.com
   GMAIL_PASS=your_gmail_app_password
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

---

## Pages

| Page | URL |
|------|-----|
| Home | `/` |
| Products | `/index.html#products` |
| Login | `/login.html` |
| Register | `/register.html` |
| Account | `/account.html` |
| Reset Password | `/resetpassword.html` |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `RAINFOREST_API_KEY` | Rainforest API key for Amazon product data |
| `EBAY_CLIENT_ID` | eBay Developer App Client ID |
| `EBAY_CLIENT_SECRET` | eBay Developer App Client Secret |
| `SERPAPI_KEY` | SerpAPI key for search results |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `GMAIL_USER` | Gmail address used to send emails |
| `GMAIL_PASS` | Gmail App Password (not your real password) |

> Never commit your `.env` file. It is already listed in `.gitignore`.
