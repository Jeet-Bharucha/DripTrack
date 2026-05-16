const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'driptrack_secret_key_change_in_production';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ── LANDING PAGE as root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'landing.html'));
});
// ── APP lives at /app
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ─────────────────────────────────────────────
// MONGODB CONNECTION
// ─────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/driptrack')
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.log('⚠️  Running without database — user data will not persist');
  });

// ─────────────────────────────────────────────
// USER SCHEMA
// ─────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  firstName:        { type: String, required: true, trim: true },
  lastName:         { type: String, required: true, trim: true },
  email:            { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:         { type: String, required: false },   // optional — Google users have no password
  googleId:         { type: String, default: null },     // Google OAuth subject ID
  verified:         { type: Boolean, default: false },
  verifyToken:      { type: String },
  resetToken:       { type: String },
  resetTokenExpiry: { type: Date },
  watchlist:        [{ type: String }],
  priceAlerts:      { type: mongoose.Schema.Types.Mixed, default: {} },
  avatar:           { type: String, default: '' },
  createdAt:        { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

// ─────────────────────────────────────────────
// EMAIL SERVICE (Nodemailer)
// Uses Gmail — set GMAIL_USER and GMAIL_PASS in .env
// For Gmail: use an App Password, not your real password
// Get App Password: myaccount.google.com → Security → App Passwords
// ─────────────────────────────────────────────
function createTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.log('⚠️  Email not configured — add GMAIL_USER and GMAIL_PASS to .env');
    return null;
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });
  // Verify connection on startup
  transporter.verify((error) => {
    if (error) {
      console.error('❌ Email connection failed:', error.message);
      console.log('   Check your GMAIL_USER and GMAIL_PASS in .env');
      console.log('   Make sure you are using an App Password, not your real Gmail password');
    } else {
      console.log('✅ Email service connected — ready to send emails');
    }
  });
  return transporter;
}

// Initialize transporter on startup
const emailTransporter = createTransporter();

async function sendVerificationEmail(email, firstName, token) {
  const transporter = emailTransporter;
  if (!transporter) {
    console.log('⚠️  Email not configured — skipping verification email');
    console.log(`   Verify link: http://localhost:${PORT}/auth/verify?token=${token}`);
    return false;
  }
  console.log(`📧 Sending verification email to ${email}...`);
  const verifyUrl = `http://localhost:${PORT}/auth/verify?token=${token}`;
  await transporter.sendMail({
    from: `"DRIPTRACK" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Verify your DRIPTRACK account',
    html: `
      <div style="background:#0a0a0a;padding:40px;font-family:monospace;color:#f0f0f0;max-width:500px;margin:0 auto">
        <h1 style="color:#e8ff00;font-size:32px;letter-spacing:6px;margin-bottom:8px">DRIPTRACK</h1>
        <p style="color:#666;font-size:11px;letter-spacing:2px;margin-bottom:32px">REAL PRICES. REAL PRODUCTS.</p>
        <h2 style="font-size:20px;margin-bottom:16px">Hey ${firstName}, verify your email</h2>
        <p style="color:#aaa;margin-bottom:32px;line-height:1.6">
          Click the button below to verify your email address and activate your account.
        </p>
        <a href="${verifyUrl}" style="background:#e8ff00;color:#000;padding:14px 28px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:2px;display:inline-block">
          VERIFY EMAIL →
        </a>
        <p style="color:#444;font-size:11px;margin-top:32px">
          Link expires in 24 hours. If you didn't create this account, ignore this email.
        </p>
      </div>`,
  });
  return true;
}

async function sendPasswordResetEmail(email, firstName, token) {
  const transporter = emailTransporter;
  if (!transporter) {
    console.log('⚠️  Email not configured — skipping reset email');
    console.log(`   Reset link: http://localhost:${PORT}/reset-password.html?token=${token}`);
    return false;
  }
  console.log(`📧 Sending password reset email to ${email}...`);
  const resetUrl = `http://localhost:${PORT}/resetpassword.html?token=${token}`;
  await transporter.sendMail({
    from: `"DRIPTRACK" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Reset your DRIPTRACK password',
    html: `
      <div style="background:#0a0a0a;padding:40px;font-family:monospace;color:#f0f0f0;max-width:500px;margin:0 auto">
        <h1 style="color:#e8ff00;font-size:32px;letter-spacing:6px;margin-bottom:32px">DRIPTRACK</h1>
        <h2 style="font-size:20px;margin-bottom:16px">Password Reset Request</h2>
        <p style="color:#aaa;margin-bottom:32px;line-height:1.6">
          Hi ${firstName}, click below to reset your password. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="background:#ff3c3c;color:#fff;padding:14px 28px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:2px;display:inline-block">
          RESET PASSWORD →
        </a>
        <p style="color:#444;font-size:11px;margin-top:32px">
          If you didn't request this, your account is safe — just ignore this email.
        </p>
      </div>`,
  });
  return true;
}

// ─────────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// ─────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────

// REGISTER
app.post('/auth/register', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || !lastName || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });
  if (password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters' });

  try {
    // Check if email already exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(400).json({ message: 'An account with this email already exists' });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create verify token
    const verifyToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: '24h' });

    // Save user
    const user = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      verifyToken,
      verified: false,
    });
    await user.save();

    // Send verification email
    const emailSent = await sendVerificationEmail(email, firstName, verifyToken);

    console.log(`✅ New user registered: ${email}`);
    res.json({
      success: true,
      message: 'Account created successfully',
      emailSent,
      user: { firstName, lastName, email },
    });

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ message: 'Server error — please try again' });
  }
});

// LOGIN
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ message: 'No account found with this email' });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch)
      return res.status(401).json({ message: 'Incorrect password' });

    // Generate JWT token — expires in 7 days
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`✅ User logged in: ${email}`);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        verified: user.verified,
        createdAt: user.createdAt,
      },
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error — please try again' });
  }
});

// VERIFY EMAIL
app.get('/auth/verify', async (req, res) => {
  const { token } = req.query;
  try {
    const { email } = jwt.verify(token, JWT_SECRET);
    await User.findOneAndUpdate({ email }, { verified: true, verifyToken: null });
    res.redirect('/login.html?verified=true');
  } catch {
    res.redirect('/login.html?error=invalid_token');
  }
});

// GET CURRENT USER
app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password -verifyToken -resetToken');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// FORGOT PASSWORD
app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  console.log(`\n🔑 Password reset requested for: ${email}`);

  // Check if MongoDB is connected
  if (mongoose.connection.readyState !== 1) {
    console.error('❌ Cannot reset password — MongoDB is not connected');
    console.error('   Fix your MONGODB_URI in .env and restart the server');
    return res.status(503).json({ message: 'Database not available — please contact support' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log(`⚠️  No account found for: ${email}`);
      return res.json({ success: true, message: 'If this email exists, a reset link has been sent' });
    }

    console.log(`✅ User found: ${user.firstName} — generating reset token...`);
    const resetToken = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
    await user.save();
    console.log(`✅ Reset token saved to database`);

    const emailSent = await sendPasswordResetEmail(email, user.firstName, resetToken);
    if (emailSent) {
      console.log(`✅ Reset email sent successfully to ${email}`);
    } else {
      console.log(`⚠️  Email not sent — check GMAIL_USER and GMAIL_PASS in .env`);
    }
    // Always print the direct link in terminal for easy access during development
    console.log(`🔗 Direct reset link: http://localhost:${PORT}/resetpassword.html?token=${resetToken}`);

    res.json({ success: true, message: 'Password reset email sent' });

  } catch (err) {
    console.error('❌ Forgot password error:', err.message);
    res.status(500).json({ message: 'Server error — ' + err.message });
  }
});

// RESET PASSWORD
app.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    return res.status(400).json({ message: 'Token and new password are required' });
  if (newPassword.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters' });

  try {
    const { userId } = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(userId);
    if (!user || user.resetToken !== token)
      return res.status(400).json({ message: 'Invalid or expired reset link' });
    if (user.resetTokenExpiry < new Date())
      return res.status(400).json({ message: 'Reset link has expired — request a new one' });

    user.password = await bcrypt.hash(newPassword, 12);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch {
    res.status(400).json({ message: 'Invalid or expired reset link' });
  }
});

// ─────────────────────────────────────────────
// GOOGLE OAUTH 2.0
// Redirect flow — no Passport needed
// ─────────────────────────────────────────────
const GOOGLE_REDIRECT_URI = `http://localhost:${PORT}/auth/google/callback`;

app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect('/login.html?error=google_not_configured');
  }
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/login.html?error=google_cancelled');

  try {
    // 1. Exchange code → access token
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  GOOGLE_REDIRECT_URI,
      grant_type:    'authorization_code',
    });
    const { access_token } = tokenRes.data;

    // 2. Fetch Google profile
    const profileRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const { sub: googleId, email, given_name, family_name, picture } = profileRes.data;
    if (!email) return res.redirect('/login.html?error=google_no_email');

    // 3. Find existing user by googleId OR email
    let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

    if (!user) {
      // Brand new user — create account (Google already verified the email)
      const crypto = require('crypto');
      user = new User({
        firstName: given_name  || 'Google',
        lastName:  family_name || 'User',
        email:     email.toLowerCase(),
        password:  await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        googleId,
        avatar:    picture || '',
        verified:  true,
      });
      await user.save();
      console.log(`✅ New Google user: ${email}`);
    } else if (!user.googleId) {
      // Existing email/password user — link their Google account
      user.googleId = googleId;
      if (picture && !user.avatar) user.avatar = picture;
      user.verified = true;
      await user.save();
      console.log(`✅ Google linked to existing account: ${email}`);
    }

    // 4. Issue JWT (same 7-day token as normal login)
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userData = encodeURIComponent(JSON.stringify({
      id:        user._id,
      firstName: user.firstName,
      lastName:  user.lastName,
      email:     user.email,
      verified:  user.verified,
      avatar:    user.avatar,
      createdAt: user.createdAt,
    }));

    // 5. Redirect to frontend — login.html reads ?token= and ?user= from URL
    res.redirect(`/login.html?token=${token}&user=${userData}`);

  } catch (err) {
    console.error('Google OAuth error:', err.response?.data || err.message);
    res.redirect('/login.html?error=google_failed');
  }
});

// WATCHLIST — add product
app.post('/auth/watchlist', authMiddleware, async (req, res) => {
  const { product } = req.body;
  if (!product) return res.status(400).json({ message: 'Product is required' });
  try {
    await User.findByIdAndUpdate(req.user.userId, { $addToSet: { watchlist: product } });
    res.json({ success: true, message: 'Added to watchlist' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// WATCHLIST — get
app.get('/auth/watchlist', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('watchlist');
    res.json({ watchlist: user?.watchlist || [] });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// WATCHLIST — remove product by index
app.delete('/auth/watchlist/:index', authMiddleware, async (req, res) => {
  const index = parseInt(req.params.index);
  if (isNaN(index)) return res.status(400).json({ message: 'Invalid index' });
  try {
    const user = await User.findById(req.user.userId).select('watchlist');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (index < 0 || index >= user.watchlist.length)
      return res.status(400).json({ message: 'Index out of range' });
    user.watchlist.splice(index, 1);
    await user.save();
    res.json({ success: true, message: 'Removed from watchlist' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE ACCOUNT
app.delete('/auth/account', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.userId);
    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────
// PRICE HISTORY — persisted in MongoDB
// ─────────────────────────────────────────────
const priceHistorySchema = new mongoose.Schema({
  productId: { type: String, required: true, index: true },
  price:     { type: Number, required: true },
  source:    { type: String },
  timestamp: { type: Date, default: Date.now },
});
const PriceHistory = mongoose.model('PriceHistory', priceHistorySchema);

// In-memory fallback when MongoDB is not connected
const priceHistoryCache = {};

async function savePriceHistory(id, price, source) {
  // Always save to in-memory cache
  if (!priceHistoryCache[id]) priceHistoryCache[id] = [];
  priceHistoryCache[id].push({ price, source, timestamp: Date.now() });
  if (priceHistoryCache[id].length > 90) priceHistoryCache[id].shift();

  // Also persist to MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      await PriceHistory.create({ productId: id, price, source });
      // Keep only last 90 data points per product
      const count = await PriceHistory.countDocuments({ productId: id });
      if (count > 90) {
        const oldest = await PriceHistory.find({ productId: id }).sort({ timestamp: 1 }).limit(count - 90);
        await PriceHistory.deleteMany({ _id: { $in: oldest.map(d => d._id) } });
      }
    } catch (err) { /* fall back to in-memory only */ }
  }
}

// ─────────────────────────────────────────────
// TRUSTED RETAILERS
// ─────────────────────────────────────────────
const TRUSTED_RETAILERS = [
  'nike', 'adidas', 'stockx', 'goat', 'foot locker', 'footlocker',
  'zappos', 'nordstrom', 'ray-ban', 'oakley', 'finish line',
  'jd sports', 'hibbett', 'champs sports', 'new balance',
  'amazon', 'ebay', 'walmart', 'dick\'s sporting goods',
  'sunglass hut', 'louis vuitton', 'gucci', 'prada',
  'chrono24', 'watchbox',
];
function isTrustedRetailer(source) {
  if (!source) return false;
  const s = source.toLowerCase();
  return TRUSTED_RETAILERS.some(r => s.includes(r));
}

const JUNK_KEYWORDS = [
  'wire','cable','battery','charger','extension','sticker','decal','patch',
  'pin','badge','keychain','charm','party favor','cake topper','box only',
  'empty box','dust bag only','case only','lot of','pack of','set of',
  '6 pc','8 pc','10 pc','replica','inspired by','lego','toy','poster',
  'photo','print','pawn',
];
function isJunkListing(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return JUNK_KEYWORDS.some(k => t.includes(k));
}
function isKidsProduct(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return t.includes('kids')||t.includes('grade school')||t.includes('(gs)')||
    t.includes('preschool')||t.includes('toddler')||t.includes('infant')||
    t.includes('big kids')||t.includes('little kids')||t.includes('youth');
}
function getMinPrice(s) {
  s = (s||'').toLowerCase();
  if (s.includes('rolex')||s.includes('audemars')||s.includes('patek')) return 1000;
  if (s.includes('louis vuitton')||s.includes('hermes')||s.includes('chanel')) return 300;
  if (s.includes('gucci')||s.includes('prada')||s.includes('balenciaga')) return 150;
  if (s.includes('supreme')||s.includes('off-white')) return 60;
  if (s.includes('yeezy')||s.includes('jordan')||s.includes('dunk')) return 50;
  if (s.includes('ray-ban')||s.includes('oakley')) return 40;
  if (s.includes('nike')||s.includes('adidas')||s.includes('new balance')) return 40;
  return 15;
}
function isValidListing(result, searchTerm) {
  if (!result||!result.price) return false;
  if (result.price < getMinPrice(searchTerm)) return false;
  if (isJunkListing(result.title)) return false;
  if (isKidsProduct(result.title)) return false;
  return true;
}
function deduplicateBySource(results) {
  const seen = {};
  for (const r of results) {
    const key = (r.source||'unknown').toLowerCase();
    if (!seen[key]||r.price < seen[key].price) seen[key] = r;
  }
  return Object.values(seen);
}
function authenticityCheck(prices) {
  const validPrices = prices.filter(p=>p&&p.price>0).map(p=>p.price);
  if (validPrices.length<2) return prices;
  const avg = validPrices.reduce((a,b)=>a+b,0)/validPrices.length;
  const threshold = avg * 0.45;
  return prices.map(p => p ? {
    ...p,
    suspicious: p.price < threshold,
    authenticityNote: p.price < threshold ? '⚠️ Price unusually low' : '✓ Price within normal market range',
  } : p);
}

// URL builders
const URL_BUILDERS = {
  'nike': t=>`https://www.nike.com/search/results/?q=${encodeURIComponent(t)}`,
  'goat': t=>`https://www.goat.com/search?query=${encodeURIComponent(t)}`,
  'stockx': t=>`https://stockx.com/search?s=${encodeURIComponent(t)}`,
  'foot locker': t=>`https://www.footlocker.com/search?query=${encodeURIComponent(t)}`,
  'footlocker': t=>`https://www.footlocker.com/search?query=${encodeURIComponent(t)}`,
  'zappos': t=>`https://www.zappos.com/search/term/${encodeURIComponent(t)}`,
  'nordstrom': t=>`https://www.nordstrom.com/sr?origin=keywordsearch&keyword=${encodeURIComponent(t)}`,
  'adidas': t=>`https://www.adidas.com/us/search?q=${encodeURIComponent(t)}`,
  'ray-ban': t=>`https://www.ray-ban.com/usa/search/${encodeURIComponent(t)}`,
  'oakley': t=>`https://www.oakley.com/en-us/search#q=${encodeURIComponent(t)}`,
  'amazon': t=>`https://www.amazon.com/s?k=${encodeURIComponent(t)}`,
  'ebay': t=>`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(t)}`,
  'finish line': t=>`https://www.finishline.com/store/search?query=${encodeURIComponent(t)}`,
  'jd sports': t=>`https://www.jdsports.com/search/?q=${encodeURIComponent(t)}`,
  'new balance': t=>`https://www.newbalance.com/search?q=${encodeURIComponent(t)}`,
  'chrono24': t=>`https://www.chrono24.com/search/index.htm?query=${encodeURIComponent(t)}`,
};
function buildFallbackUrl(source, title) {
  if (!source) return null;
  const key = source.toLowerCase();
  for (const [retailer, builder] of Object.entries(URL_BUILDERS)) {
    if (key.includes(retailer)) return builder(title||'');
  }
  return null;
}
function getBestUrl(serpLink, source, title, searchTerm) {
  if (serpLink&&serpLink.startsWith('http')&&!serpLink.includes('google.com/search')) return serpLink;
  return buildFallbackUrl(source, title||searchTerm);
}

// AMAZON
async function getAmazonPrice(searchTerm) {
  if (!process.env.RAINFOREST_API_KEY) return null;
  try {
    const res = await axios.get('https://api.rainforestapi.com/request', {
      params: { api_key: process.env.RAINFOREST_API_KEY, type: 'search', amazon_domain: 'amazon.com', search_term: searchTerm, sort_by: 'featured' },
      timeout: 8000,
    });
    const results = (res.data.search_results||[]).filter(r=>isValidListing({price:r.price?.value,title:r.title},searchTerm));
    const item = results.find(r=>r.is_prime||r.fulfillment?.type==='AMAZON')||results[0];
    if (!item) return null;
    const url = item.asin ? `https://www.amazon.com/dp/${item.asin}` : `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm)}`;
    return { source:'Amazon', price:item.price?.value||null, currency:'USD', url, title:item.title, image:item.image, verified:true };
  } catch (err) { console.error('Amazon error:',err.message); return null; }
}

// EBAY
async function getEbayPrice(searchTerm) {
  if (!process.env.EBAY_CLIENT_ID||!process.env.EBAY_CLIENT_SECRET) return null;
  try {
    const tokenRes = await axios.post('https://api.ebay.com/identity/v1/oauth2/token',
      'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
      { headers:{'Content-Type':'application/x-www-form-urlencoded'}, auth:{username:process.env.EBAY_CLIENT_ID,password:process.env.EBAY_CLIENT_SECRET} }
    );
    const res = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
      headers:{Authorization:`Bearer ${tokenRes.data.access_token}`},
      params:{q:searchTerm,filter:'conditionIds:{1000}',sort:'price',limit:10},
      timeout:8000,
    });
    const items = (res.data.itemSummaries||[])
      .filter(i=>isValidListing({price:parseFloat(i.price?.value),title:i.title},searchTerm))
      .filter(i=>(i.seller?.feedbackScore||0)>50);
    if (!items[0]) return null;
    const item = items[0];
    return { source:'eBay', price:parseFloat(item.price?.value)||null, currency:'USD', url:item.itemWebUrl||`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchTerm)}`, title:item.title, image:item.image?.imageUrl, verified:(item.seller?.feedbackScore||0)>100 };
  } catch (err) { console.error('eBay error:',err.message); return null; }
}

// SERPAPI
async function getGoogleShoppingPrices(searchTerm) {
  if (!process.env.SERPAPI_KEY) return [];
  try {
    const res = await axios.get('https://serpapi.com/search', {
      params:{engine:'google_shopping',q:searchTerm,api_key:process.env.SERPAPI_KEY,num:20},
      timeout:10000,
    });
    const results = res.data.shopping_results||[];
    const trusted = results.filter(r=>isTrustedRetailer(r.source));
    const clean = (trusted.length?trusted:results).filter(r=>isValidListing({price:r.extracted_price,title:r.title},searchTerm));
    clean.sort((a,b)=>(a.extracted_price||0)-(b.extracted_price||0));
    return clean.slice(0,8).map(r=>({
      source:r.source||'Unknown', price:r.extracted_price||null, currency:'USD',
      url:getBestUrl(r.link,r.source,r.title,searchTerm),
      title:r.title||'', image:r.thumbnail||null, verified:isTrustedRetailer(r.source),
    })).filter(r=>r.price);
  } catch (err) { console.error('SerpAPI error:',err.message); return []; }
}

// ─────────────────────────────────────────────
// PRICE ROUTES
// ─────────────────────────────────────────────
app.get('/api/prices', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing ?q=' });
  console.log(`\n🔍 Searching: ${q}`);
  const [amazon, ebay, googleResults] = await Promise.all([getAmazonPrice(q), getEbayPrice(q), getGoogleShoppingPrices(q)]);
  const combined = [amazon, ebay, ...googleResults].filter(Boolean);
  const deduped = deduplicateBySource(combined);
  const checked = authenticityCheck(deduped);

  // Find best quality image: Amazon > eBay > SerpAPI (in that order)
  const bestImage = amazon?.image || ebay?.image || googleResults.find(r => r?.image)?.image || null;

  // Apply best image to any result that has no image
  const enriched = checked.map(r => ({
    ...r,
    image: (r.image && r.image.startsWith('http')) ? r.image : bestImage,
  }));

  const lowestPrice = enriched.filter(p=>!p.suspicious&&p.price).sort((a,b)=>a.price-b.price)[0];
  if (lowestPrice) savePriceHistory(q.toLowerCase().replace(/\s+/g,'-'), lowestPrice.price, lowestPrice.source);
  console.log(`✅ ${enriched.length} results`);
  res.json({ query:q, timestamp:new Date().toISOString(), results:enriched, bestPrice:lowestPrice||null, totalSources:enriched.length });
});

app.get('/api/history', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing ?q=' });
  const id = q.toLowerCase().replace(/\s+/g, '-');
  try {
    if (mongoose.connection.readyState === 1) {
      const history = await PriceHistory.find({ productId: id }).sort({ timestamp: 1 }).limit(90);
      return res.json({ productId: id, history, dataPoints: history.length });
    }
  } catch (err) { /* fall back to in-memory */ }
  const fallback = priceHistoryCache[id] || [];
  res.json({ productId: id, history: fallback, dataPoints: fallback.length });
});

app.get('/api/status', (req, res) => {
  res.json({ status:'running', apis:{
    rainforest: process.env.RAINFOREST_API_KEY ? '✅ Connected' : '❌ Missing key',
    ebay: process.env.EBAY_CLIENT_ID ? '✅ Connected' : '❌ Missing key',
    serpapi: process.env.SERPAPI_KEY ? '✅ Connected' : '❌ Missing key',
    mongodb: mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Not connected',
    email: process.env.GMAIL_USER ? '✅ Configured' : '⚠️ Not configured',
  }});
});

app.get('/api/image', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing ?q=' });
  try {
    if (process.env.SERPAPI_KEY) {
      // Use google_images engine for full-size images instead of tiny shopping thumbnails
      const r = await axios.get('https://serpapi.com/search', {
        params: { engine: 'google_images', q, api_key: process.env.SERPAPI_KEY, num: 5 },
        timeout: 6000,
      });
      const item = (r.data.images_results || []).find(x =>
        x.original && !isJunkListing(x.title) && !isKidsProduct(x.title)
      );
      if (item?.original) return res.json({ image: item.original });
      // Fallback to thumbnail if original not available
      if (item?.thumbnail) return res.json({ image: item.thumbnail });
    }
    res.json({ image: null });
  } catch { res.json({ image: null }); }
});

app.get('/api/angles', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing ?q=' });
  const angles = [];
  try {
    if (process.env.SERPAPI_KEY) {
      // Only fetch Side, Back, Detail — Front is always the card's own image (handled client-side)
      const angleQueries = [
        { label: 'Side',   query: `${q} side view` },
        { label: 'Back',   query: `${q} back view` },
        { label: 'Detail', query: `${q} detail shot` },
      ];
      const results = await Promise.all(angleQueries.map(({ query }) =>
        axios.get('https://serpapi.com/search', {
          params: { engine: 'google_images', q: query, api_key: process.env.SERPAPI_KEY, num: 5 },
          timeout: 6000,
        }).catch(() => null)
      ));
      results.forEach((r, i) => {
        if (!r) return;
        const items = r.data.images_results || [];
        // Prefer original full-size image, fall back to thumbnail
        const item = items.find(x => (x.original || x.thumbnail) && !isJunkListing(x.title));
        const url = item?.original || item?.thumbnail;
        if (url) angles.push({ url, label: angleQueries[i].label });
      });
    }
    res.json({ query: q, angles, total: angles.length });
  } catch { res.json({ query: q, angles: [], total: 0 }); }
});

// ─────────────────────────────────────────────
// PRICE DROP ALERT CHECKER
// Runs every 30 minutes, checks all users' watchlists
// ─────────────────────────────────────────────
async function checkPriceAlerts() {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const users = await User.find({ 'watchlist.0': { $exists: true } });
    console.log(`\n🔔 Checking price alerts for ${users.length} users...`);
    for (const user of users) {
      if (!user.priceAlerts || !Object.keys(user.priceAlerts).length) continue;
      for (const [index, alertData] of Object.entries(user.priceAlerts)) {
        if (!alertData.enabled || !alertData.targetPrice || !alertData.productName) continue;
        try {
          const res = await axios.get(`http://localhost:${PORT}/api/prices?q=${encodeURIComponent(alertData.productName)}`, { timeout: 15000 });
          const results = res.data.results || [];
          const best = results.filter(r => r && r.price && !r.suspicious).sort((a, b) => a.price - b.price)[0];
          if (!best) continue;
          if (best.price <= alertData.targetPrice) {
            console.log(`📉 Price drop! ${alertData.productName} now $${best.price} (target: $${alertData.targetPrice}) — alerting ${user.email}`);
            await sendPriceDropEmail(user.email, user.firstName, alertData.productName, best.price, alertData.targetPrice, best.url, best.source);
            // Also send push notification
            await sendPushToUser(user._id, {
              title: '📉 Price Drop Alert — DripTrack',
              body: `${alertData.productName} is now $${best.price.toFixed(2)} on ${best.source} (your target: $${parseFloat(alertData.targetPrice).toFixed(2)})`,
              url: best.url || '/',
              icon: '/icon-192.png',
            });
          }
        } catch (err) { /* skip this item */ }
      }
    }
  } catch (err) { console.error('Alert check error:', err.message); }
}

async function sendPriceDropEmail(email, firstName, productName, currentPrice, targetPrice, url, source) {
  if (!emailTransporter) return;
  try {
    await emailTransporter.sendMail({
      from: `"DRIPTRACK" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `📉 Price Drop Alert: ${productName}`,
      html: `
        <div style="background:#0a0a0a;padding:40px;font-family:monospace;color:#f0f0f0;max-width:500px;margin:0 auto">
          <h1 style="color:#e8ff00;font-size:32px;letter-spacing:6px;margin-bottom:8px">DRIPTRACK</h1>
          <p style="color:#666;font-size:11px;letter-spacing:2px;margin-bottom:32px">PRICE DROP ALERT</p>
          <h2 style="font-size:20px;margin-bottom:8px">Hey ${firstName}, prices dropped! 📉</h2>
          <p style="color:#aaa;margin-bottom:8px;font-size:14px">${productName}</p>
          <div style="background:#111;padding:20px;margin:20px 0;border-left:3px solid #39ff14">
            <div style="color:#666;font-size:11px;letter-spacing:2px;margin-bottom:4px">CURRENT BEST PRICE</div>
            <div style="color:#39ff14;font-size:36px;font-weight:700;letter-spacing:2px">$${currentPrice.toFixed(2)}</div>
            <div style="color:#666;font-size:11px;margin-top:4px">on ${source} · Your target was $${parseFloat(targetPrice).toFixed(2)}</div>
          </div>
          ${url ? `<a href="${url}" style="background:#e8ff00;color:#000;padding:14px 28px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:2px;display:inline-block;margin-bottom:24px">BUY NOW →</a>` : ''}
          <p style="color:#444;font-size:11px;margin-top:24px">You're receiving this because you set a price alert on DRIPTRACK.</p>
        </div>`,
    });
  } catch (err) { console.error('Price drop email error:', err.message); }
}

// Run price alert check every 30 minutes
setInterval(checkPriceAlerts, 30 * 60 * 1000);

// SAVE PRICE ALERTS (called from account page)
app.post('/auth/price-alerts', authMiddleware, async (req, res) => {
  const { alerts } = req.body;
  if (!alerts) return res.status(400).json({ message: 'Alerts data required' });
  try {
    await User.findByIdAndUpdate(req.user.userId, { priceAlerts: alerts });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ─────────────────────────────────────────────
// PRICE ALERTS — per-product CRUD
// ─────────────────────────────────────────────
app.post('/auth/alerts', authMiddleware, async (req, res) => {
  const { productName, targetPrice, productImage } = req.body;
  if (!productName || targetPrice == null) return res.status(400).json({ message: 'productName and targetPrice required' });
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.priceAlerts) user.priceAlerts = {};
    const key = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    user.priceAlerts[key] = { productName, targetPrice: parseFloat(targetPrice), productImage: productImage || null, enabled: true, createdAt: new Date() };
    user.markModified('priceAlerts');
    await user.save();
    res.json({ success: true, key });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.get('/auth/alerts', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('priceAlerts');
    res.json({ alerts: user?.priceAlerts || {} });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/auth/alerts/:key', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.priceAlerts) { delete user.priceAlerts[req.params.key]; user.markModified('priceAlerts'); }
    await user.save();
    res.json({ success: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ─────────────────────────────────────────────
// WEB PUSH NOTIFICATIONS
// Run: npm install web-push  (in backend/)
// Generate VAPID keys:
//   node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log(JSON.stringify(k))"
// Add VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY to backend/.env
// ─────────────────────────────────────────────
let webPush = null;
try {
  webPush = require('web-push');
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
      `mailto:${process.env.GMAIL_USER || 'admin@driptrack.com'}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    console.log('✅ Web Push configured');
  } else {
    console.log('⚠️  Web Push: add VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY to .env');
    webPush = null;
  }
} catch {
  console.log('⚠️  Web Push disabled — run: cd backend && npm install web-push');
}

const pushSubSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  endpoint: { type: String, required: true, unique: true },
  keys:     { p256dh: String, auth: String },
  createdAt:{ type: Date, default: Date.now },
});
const PushSubscription = mongoose.model('PushSubscription', pushSubSchema);

app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

app.post('/api/push/subscribe', authMiddleware, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ message: 'Invalid subscription' });
  try {
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      { userId: req.user.userId, endpoint: subscription.endpoint, keys: subscription.keys },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/push/unsubscribe', authMiddleware, async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) await PushSubscription.deleteOne({ endpoint }).catch(() => {});
  res.json({ success: true });
});

async function sendPushToUser(userId, payload) {
  if (!webPush || mongoose.connection.readyState !== 1) return;
  try {
    const subs = await PushSubscription.find({ userId });
    for (const sub of subs) {
      try {
        await webPush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id });
        }
      }
    }
  } catch {}
}

// ─────────────────────────────────────────────
// BIGGEST MOVERS ENDPOINT
// Returns products with largest price swings in last 48h
// ─────────────────────────────────────────────
app.get('/api/movers', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.json({ gainers: [], losers: [] });
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const products = await PriceHistory.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $sort: { timestamp: 1 } },
      { $group: { _id: '$productId', first: { $first: '$price' }, last: { $last: '$price' }, count: { $sum: 1 } } },
      { $match: { count: { $gte: 2 } } },
    ]);
    const all = products.map(p => ({
      name: p._id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      productId: p._id,
      firstPrice: parseFloat(p.first.toFixed(2)),
      currentPrice: parseFloat(p.last.toFixed(2)),
      changePct: parseFloat(((p.last - p.first) / p.first * 100).toFixed(1)),
    })).filter(m => Math.abs(m.changePct) >= 0.3);
    all.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    res.json({ gainers: all.filter(m => m.changePct > 0).slice(0, 6), losers: all.filter(m => m.changePct < 0).slice(0, 6) });
  } catch { res.json({ gainers: [], losers: [] }); }
});

// ─────────────────────────────────────────────
// SEARCH AUTOCOMPLETE SUGGESTIONS
// ─────────────────────────────────────────────
const SUGGESTION_LIST = [
  // Nike
  'Nike Air Jordan 1 Retro High OG','Nike Air Jordan 1 Low','Nike Air Jordan 4 Retro',
  'Nike Air Jordan 4 Military Black','Nike Air Jordan 11 Retro','Nike Air Jordan 3 Retro',
  'Nike Air Jordan 6 Retro','Nike Dunk Low Panda','Nike Dunk High','Nike Dunk Low Retro',
  'Nike Air Max 90','Nike Air Max 97 Silver Bullet','Nike Air Max 95',
  'Nike Air Force 1 Low','Nike Air Force 1 High','Nike Air Max 270',
  'Nike Blazer Mid 77','Nike React Element 55','Nike Pegasus 40',
  'Nike x Off-White Air Force 1','Nike x Sacai Vaporwaffle',
  // Adidas
  'Adidas Yeezy Boost 350 V2 Zebra','Adidas Yeezy Boost 350 V2 Beluga',
  'Adidas Yeezy Slide','Adidas Yeezy 700 V3','Adidas Yeezy Foam Runner',
  'Adidas Stan Smith','Adidas Samba OG','Adidas Gazelle Indoor',
  'Adidas Campus 00s','Adidas Forum Low','Adidas Ultraboost 22',
  // New Balance
  'New Balance 550 White Green','New Balance 574 Legacy','New Balance 990v5',
  'New Balance 993 Made in USA','New Balance 2002R Protection Pack',
  'New Balance 1906R','New Balance 327','New Balance 9060',
  // Other Sneakers
  'Asics Gel-Kayano 14','Asics Gel-Lyte III','Asics Gel-1090',
  'Converse Chuck Taylor All Star 70','Converse Run Star Hike',
  'Vans Old Skool Black White','Vans Sk8-Hi','Vans Authentic',
  'Reebok Classic Leather','Reebok Club C 85',
  'Salomon XT-6','On Running Cloudmonster',
  'Balenciaga Triple S','Balenciaga Track','Dior B23 Sneaker',
  'Jordan 4 Military Black','Jordan 1 Chicago','Jordan 3 White Cement',
  // Watches
  'Rolex Submariner Date','Rolex Daytona 116500LN','Rolex GMT Master II Pepsi',
  'Rolex Datejust 41','Rolex Day-Date 40','AP Royal Oak 15500ST',
  'AP Royal Oak Offshore','Patek Philippe Nautilus 5711','Patek Philippe Aquanaut',
  'Omega Speedmaster Professional','Omega Seamaster 300M','Omega Constellation',
  'Casio G-Shock GW-M5610','Casio G-Shock GA-2100','Seiko Prospex Turtle',
  'Tag Heuer Carrera','IWC Pilot Mark XVIII','Cartier Santos Medium',
  'Breitling Navitimer','Longines Hydroconquest',
  // Bags
  'Louis Vuitton Neverfull MM','Louis Vuitton Speedy 30','Louis Vuitton OnTheGo',
  'Louis Vuitton Pochette Accessoires','Louis Vuitton Keepall 45',
  'Gucci GG Marmont Matelasse','Gucci Dionysus Bag','Gucci Horsebit 1955',
  'Hermès Birkin 30','Hermès Kelly 25','Hermès Picotin',
  'Chanel Classic Flap Medium','Chanel Boy Bag','Chanel 19 Bag',
  'Prada Re-Nylon Backpack','Prada Cleo Bag','Coach Tabby Shoulder Bag',
  'Bottega Veneta Jodie','Celine Box Bag','Dior Lady Dior',
  // Streetwear
  'Supreme Box Logo Hoodie','Supreme Box Logo Tee','Supreme Crewneck',
  'Off-White Industrial Belt','Off-White Arrows Hoodie','Palace Tri-Ferg Hoodie',
  'Stussy 8 Ball Fleece','Essentials Fear of God Hoodie','Kith Box Logo Tee',
  'Ami Paris Ami De Coeur Hoodie','Stone Island Shadow Project',
  'Carhartt WIP Active Jacket',
  // Sunglasses
  'Ray-Ban Aviator Classic','Ray-Ban Wayfarer Original','Ray-Ban Clubmaster',
  'Oakley Frogskins Prizm','Oakley Radar EV Path','Oakley Holbrook',
  'Gentle Monster Sunglasses','Celine Sunglasses',
  // Accessories
  'Chrome Hearts Ring','Chrome Hearts Belt','Cartier Love Bracelet',
  'Van Cleef Alhambra Necklace','Tiffany T Wire Bracelet',
];

app.get('/api/suggestions', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ suggestions: [] });
  const ql = q.toLowerCase();
  const matches = SUGGESTION_LIST.filter(s => s.toLowerCase().includes(ql)).slice(0, 7);
  res.json({ suggestions: matches });
});

// ─────────────────────────────────────────────
// PRICE HISTORY CRON JOB
// Fetches popular products every hour to build real price history
// ─────────────────────────────────────────────
const TRACKED_PRODUCTS = [
  // Sneakers
  'Nike Air Jordan 1 Chicago','Nike Air Jordan 4 Military Black','Nike Dunk Low Panda',
  'Nike Air Force 1 Low','Nike Air Max 90','Nike Blazer Mid 77',
  'Adidas Yeezy Boost 350 V2 Zebra','Adidas Yeezy Slide','Adidas Samba OG',
  'Adidas Stan Smith','New Balance 550 White Green','New Balance 2002R',
  'Asics Gel-Kayano 14','Converse Chuck Taylor 70','Vans Old Skool',
  'Jordan 4 Military Black','Jordan 1 Retro High OG',
  // Watches
  'Rolex Submariner Date','Rolex Daytona 116500LN','AP Royal Oak 15500ST',
  'Omega Speedmaster Professional','Casio G-Shock GW-M5610',
  // Bags
  'Louis Vuitton Neverfull MM','Gucci GG Marmont','Hermès Birkin 30',
  'Chanel Classic Flap','Prada Re-Nylon Backpack',
  // Streetwear
  'Supreme Box Logo Hoodie','Off-White Industrial Belt','Essentials Fear of God Hoodie',
  // Sunglasses
  'Ray-Ban Aviator Classic','Oakley Frogskins',
];

async function runPriceHistoryCron() {
  if (mongoose.connection.readyState !== 1) return;
  console.log('\n⏰ Hourly price history cron running...');
  for (const product of TRACKED_PRODUCTS) {
    try {
      const [amazon, ebay] = await Promise.all([getAmazonPrice(product), getEbayPrice(product)]);
      const best = [amazon, ebay].filter(Boolean).sort((a, b) => (a.price || 1e9) - (b.price || 1e9))[0];
      if (best?.price) {
        const key = product.toLowerCase().replace(/\s+/g, '-');
        await savePriceHistory(key, best.price, best.source);
        console.log(`  ✓ ${product}: $${best.price} (${best.source})`);
      }
      await new Promise(r => setTimeout(r, 2500)); // avoid rate limits
    } catch {}
  }
  console.log('✅ Cron complete');
}
// First run after 60s (server is fully up), then every hour
setTimeout(runPriceHistoryCron, 60000);
setInterval(runPriceHistoryCron, 60 * 60 * 1000);

// ── UPDATE PROFILE
app.post('/auth/update-profile', authMiddleware, async (req, res) => {
  const { firstName, lastName } = req.body;
  if (!firstName || !lastName) return res.status(400).json({ message: 'Name fields required' });
  try {
    await User.findByIdAndUpdate(req.user.userId, { firstName, lastName });
    res.json({ success: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── CHANGE PASSWORD
app.post('/auth/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'All fields required' });
  if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  try {
    const user = await User.findById(req.user.userId);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ message: 'Current password is incorrect' });
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ success: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.listen(PORT, '0.0.0.0', () => {
  // Get local network IP so you can open on phone
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'YOUR_IP';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
  }
  console.log(`\n🚀 DRIPTRACK running`);
  console.log(`💻 Laptop:  http://localhost:${PORT}`);
  console.log(`📱 Phone:   http://${localIP}:${PORT}  ← open this on your phone`);
  console.log(`👤 Register: http://localhost:${PORT}/register.html`);
  console.log(`🔑 Login:    http://localhost:${PORT}/login.html\n`);
});