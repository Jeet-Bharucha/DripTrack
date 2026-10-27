const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pricing = require('./pricing');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(48).toString('hex');
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`)).replace(/\/$/, '');

app.use(cors());
app.use(express.json());
app.use('/auth', (req, res, next) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Account services are temporarily unavailable. Please try again later.' });
  next();
});
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'DENY');
  if (req.path.startsWith('/auth/')) res.set('Cache-Control', 'no-store');
  next();
});
const requestWindows = new Map();
app.use(['/auth', '/api/prices', '/api/listing'], (req, res, next) => {
  const key = `${req.ip}:${req.baseUrl === '/auth' ? 'auth' : 'prices'}`;
  const now = Date.now();
  let window = requestWindows.get(key);
  if (!window || now > window.until) { window = { count: 0, until: now + 600000 }; requestWindows.set(key, window); }
  if (requestWindows.size > 5000) for (const [k,v] of requestWindows) if (v.until < now) requestWindows.delete(k);
  if (++window.count > 60) return res.status(429).json({ message: 'Too many requests. Please try again in a few minutes.' });
  next();
});

// ── ROUTES must come BEFORE express.static so they aren't overridden
// Landing page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'landing.html'));
});
// Main app at /app
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Static files (index: false prevents express from auto-serving index.html for /)
const publicFiles = new Set([
  'landing.html', 'index.html', 'login.html', 'register.html', 'resetpassword.html',
  'account.html', 'watchlist.html', 'product.html', '404.html', 'api-connector.js',
  'sw.js', 'manifest.json', 'Drip Track Logo.png', 'icon-192.png', 'icon-512.png',
  'site.css', 'site.js', 'about.html',
]);
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let file;
  try { file = decodeURIComponent(req.path).slice(1); } catch { return res.sendStatus(400); }
  if (!publicFiles.has(file)) return next();
  res.sendFile(path.join(__dirname, '..', file));
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
    return false;
  }
  console.log(`📧 Sending verification email to ${email}...`);
  const verifyUrl = `${PUBLIC_URL}/auth/verify?token=${encodeURIComponent(token)}`;
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
    return false;
  }
  console.log(`📧 Sending password reset email to ${email}...`);
  const resetUrl = `${PUBLIC_URL}/resetpassword.html?token=${encodeURIComponent(token)}`;
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

  if (![firstName, lastName, email, password].every(v => typeof v === 'string') ||
      firstName.trim().length < 1 || lastName.trim().length < 1 || firstName.length > 60 || lastName.length > 60 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length > 128 || /[<>]/.test(firstName + lastName))
    return res.status(400).json({ message: 'Enter a valid name, email and password.' });

  if (!firstName || !lastName || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });
  if (password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters' });

  try {
    // Check if email already exists
    const existing = await User.findOne({ email: email.trim().toLowerCase() });
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
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      verifyToken,
      verified: false,
    });
    await user.save();

    // Send verification email
    const emailSent = await sendVerificationEmail(email, firstName, verifyToken).catch(() => false);

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

  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 128)
    return res.status(400).json({ message: 'Enter your email and password.' });

  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user)
      return res.status(401).json({ message: 'Email or password is incorrect' });

    const passwordMatch = user.password && await bcrypt.compare(password, user.password);
    if (!passwordMatch)
      return res.status(401).json({ message: 'Email or password is incorrect' });

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
    const user = await User.findOneAndUpdate({ email, verifyToken: token }, { verified: true, verifyToken: null });
    if (!user) return res.redirect('/login.html?error=invalid_token');
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
  if (typeof email !== 'string' || email.length > 254) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (!email) return res.status(400).json({ message: 'Email is required' });

  console.log(`\n🔑 Password reset requested for: ${email}`);

  // Check if MongoDB is connected
  if (mongoose.connection.readyState !== 1) {
    console.error('❌ Cannot reset password — MongoDB is not connected');
    console.error('   Fix your MONGODB_URI in .env and restart the server');
    return res.status(503).json({ message: 'Database not available — please contact support' });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
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
    if (!emailSent) return res.status(503).json({ message: 'Password reset email is unavailable. Please try again later.' });
    res.json({ success: true, message: 'If this email exists, a reset link has been sent' });

  } catch (err) {
    console.error('❌ Forgot password error:', err.message);
    res.status(500).json({ message: 'Server error — ' + err.message });
  }
});

// RESET PASSWORD
app.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (typeof token !== 'string' || typeof newPassword !== 'string' || newPassword.length > 128)
    return res.status(400).json({ message: 'Enter a valid reset token and password.' });
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
// Use env var in production, fallback to localhost for dev
function getGoogleRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  return `${PUBLIC_URL}/auth/google/callback`;
}

app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect('/login.html?error=google_not_configured');
  }
  const state = require('crypto').randomBytes(32).toString('hex');
  res.cookie('oauth_state', state, { httpOnly: true, secure: PUBLIC_URL.startsWith('https:'), sameSite: 'lax', maxAge: 600000, path: '/auth/google' });
  const params = new URLSearchParams({
    state,
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  getGoogleRedirectUri(req),
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
  const cookieState = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('oauth_state='))?.slice('oauth_state='.length);
  res.clearCookie('oauth_state', { path: '/auth/google' });
  if (!cookieState || cookieState !== req.query.state) return res.redirect('/login.html?error=google_state');

  try {
    // 1. Exchange code → access token
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  getGoogleRedirectUri(req),
      grant_type:    'authorization_code',
    });
    const { access_token } = tokenRes.data;

    // 2. Fetch Google profile
    const profileRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const { sub: googleId, email, given_name, family_name, picture, email_verified } = profileRes.data;
    if (!email || !email_verified) return res.redirect('/login.html?error=google_no_email');

    // 3. Find existing user by googleId OR email
    let user = await User.findOne({ $or: [{ googleId }, { email: email.trim().toLowerCase() }] });

    if (!user) {
      // Brand new user — create account (Google already verified the email)
      const crypto = require('crypto');
      user = new User({
        firstName: given_name  || 'Google',
        lastName:  family_name || 'User',
        email:     email.trim().toLowerCase(),
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
    res.redirect(`/login.html#token=${encodeURIComponent(token)}`);

  } catch (err) {
    console.error('Google OAuth error:', err.response?.data || err.message);
    res.redirect('/login.html?error=google_failed');
  }
});

// WATCHLIST — add product
app.post('/auth/watchlist', authMiddleware, async (req, res) => {
  const { product } = req.body;
  if (typeof product !== 'string' || product.length > 10000) return res.status(400).json({ message: 'A valid listing is required' });
  let listing;
  try { listing = JSON.parse(product); } catch { return res.status(400).json({ message: 'A valid listing is required' }); }
  if (!/^[a-f0-9]{24}$/.test(listing.id) || typeof listing.title !== 'string') return res.status(400).json({ message: 'Save a current source listing.' });
  try {
    if (typeof listing.searchQuery !== 'string' || listing.searchQuery.length < 2 || listing.searchQuery.length > 120)
      return res.status(400).json({ message: 'This listing is missing its original search.' });
    const data = await pricing.search(listing.searchQuery);
    const sourceListing = data.results.find(r => r.id === listing.id);
    if (!sourceListing) return res.status(400).json({ message: 'This exact listing could not be confirmed. Search again before saving.' });
    const savedProduct = JSON.stringify({ ...sourceListing, searchQuery: listing.searchQuery });
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    if (user.watchlist.length >= 100) return res.status(400).json({ message: 'Your shortlist can hold up to 100 listings.' });
    if (!user.watchlist.some(raw => { try { return JSON.parse(raw).id === listing.id; } catch { return false; } })) user.watchlist.push(savedProduct);
    await user.save();
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
    await PushSubscription.deleteMany({ userId: req.user.userId });
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
  if (Object.keys(priceHistoryCache).length > 1500 && !priceHistoryCache[id]) delete priceHistoryCache[Object.keys(priceHistoryCache)[0]];
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
// PRICE ROUTES
// ─────────────────────────────────────────────
app.get('/api/prices', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2 || q.length > 120) return res.status(400).json({ message: 'Enter a search between 2 and 120 characters.' });
  try {
    const data = await pricing.search(q);
    // Store observations for the exact source listing, never a blended search-query minimum.
    if (!data.cached) await Promise.all(data.results.map(r => savePriceHistory(`listing-v2-${r.id}`, r.price, r.source)));
    res.json(data);
  } catch { res.status(503).json({ message: 'Price search is temporarily unavailable. Please try again.' }); }
});
app.get('/api/history', async (req, res) => {
  const listing = typeof req.query.listing === 'string' ? req.query.listing : '';
  if (!/^[a-f0-9]{24}$/.test(listing)) return res.status(400).json({ message: 'An exact listing ID is required for price history.' });
  const id = `listing-v2-${listing}`;
  try {
    if (mongoose.connection.readyState === 1) {
      const history = await PriceHistory.find({ productId: id }).sort({ timestamp: 1 }).limit(90);
      return res.json({ productId: id, history, dataPoints: history.length });
    }
  } catch (err) { /* fall back to in-memory */ }
  const fallback = priceHistoryCache[id] || [];
  res.json({ productId: id, history: fallback, dataPoints: fallback.length });
});

app.get('/api/listing', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (q.length < 2 || q.length > 120 || !/^[a-f0-9]{24}$/.test(id)) return res.status(400).json({ message: 'A search and exact listing ID are required.' });
  try {
    const item = await pricing.listing(q, id);
    if (!item) return res.status(404).json({ message: 'This exact listing is no longer in the source results.' });
    res.json({ item });
  } catch { res.status(503).json({ message: 'Listing details are temporarily unavailable.' }); }
});

app.get('/api/status', (req, res) => {
  res.json({ status:'running', providers:pricing.providerStatus(), googleLogin:!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), apis:{
    mongodb: mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Not connected',
    email: process.env.GMAIL_USER && process.env.GMAIL_PASS ? 'Configured' : 'Not configured',
  }});
});

// PRICE DROP ALERT CHECKER
// Runs every 30 minutes, checks all users' watchlists
// ─────────────────────────────────────────────
async function checkPriceAlerts() {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const users = await User.find({ priceAlerts: { $exists: true, $ne: {} } });
    console.log(`\n🔔 Checking price alerts for ${users.length} users...`);
    for (const user of users) {
      if (!user.priceAlerts || !Object.keys(user.priceAlerts).length) continue;
      for (const [index, alertData] of Object.entries(user.priceAlerts)) {
        if (!alertData.enabled || !alertData.targetPrice || !alertData.productName || !alertData.listingId || !alertData.searchQuery) continue;
        if (alertData.lastNotifiedAt && Date.now() - new Date(alertData.lastNotifiedAt).getTime() < 86400000) continue;
        try {
          const data = await pricing.search(alertData.searchQuery);
          const best = data.results.find(r => r.id === alertData.listingId);
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
            alertData.lastNotifiedAt = new Date();
            user.markModified('priceAlerts');
            await user.save();
          }
        } catch (err) { /* skip this item */ }
      }
    }
  } catch (err) { console.error('Alert check error:', err.message); }
}

async function sendPriceDropEmail(email, firstName, productName, currentPrice, targetPrice, url, source) {
  if (!emailTransporter) return;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  firstName = escape(firstName); productName = escape(productName); source = escape(source);
  url = escape(require('./catalog').safeUrl(url) || '');
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
  const { productName, targetPrice, productImage, listingId, searchQuery } = req.body;
  if (typeof productName !== 'string' || productName.length > 500 || typeof searchQuery !== 'string' || searchQuery.length > 120 ||
      typeof listingId !== 'string' || !/^[a-f0-9]{24}$/.test(listingId) || !Number.isFinite(Number(targetPrice)) || Number(targetPrice) <= 0 || Number(targetPrice) > 10000000)
    return res.status(400).json({ message: 'Select a current listing and enter a valid target price.' });
  if (!productName || targetPrice == null) return res.status(400).json({ message: 'productName and targetPrice required' });
  try {
    const data = await pricing.search(searchQuery);
    const sourceListing = data.results.find(r => r.id === listingId);
    if (!sourceListing) return res.status(400).json({ message: 'This exact listing could not be confirmed. Search again before creating an alert.' });
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.priceAlerts) user.priceAlerts = {};
    const key = listingId;
    if (!user.priceAlerts[key] && Object.keys(user.priceAlerts).length >= 100) return res.status(400).json({ message: 'You can save up to 100 alerts.' });
    user.priceAlerts[key] = { productName: sourceListing.title, targetPrice: Number(targetPrice), productImage: sourceListing.image || null, listingId, searchQuery, enabled: true, createdAt: new Date() };
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
    const endpoint = new URL(subscription.endpoint);
    if (endpoint.protocol !== 'https:' || !/(^|\.)(fcm.googleapis.com|push.services.mozilla.com|push.apple.com|notify.windows.com)$/.test(endpoint.hostname))
      return res.status(400).json({ message: 'Unsupported push service.' });
  } catch { return res.status(400).json({ message: 'Invalid subscription' }); }
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
        const endpoint = new URL(sub.endpoint);
        if (endpoint.protocol !== 'https:' || !/(^|\.)(fcm.googleapis.com|push.services.mozilla.com|push.apple.com|notify.windows.com)$/.test(endpoint.hostname)) continue;
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
// ── UPDATE PROFILE
app.post('/auth/update-profile', authMiddleware, async (req, res) => {
  const { firstName, lastName } = req.body;
  if (typeof firstName !== 'string' || typeof lastName !== 'string' || firstName.length > 60 || lastName.length > 60 || /[<>]/.test(firstName + lastName))
    return res.status(400).json({ message: 'Enter a valid first and last name.' });
  if (!firstName || !lastName) return res.status(400).json({ message: 'Name fields required' });
  try {
    await User.findByIdAndUpdate(req.user.userId, { firstName, lastName });
    res.json({ success: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── CHANGE PASSWORD
app.post('/auth/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length > 128)
    return res.status(400).json({ message: 'Enter valid passwords.' });
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'All fields required' });
  if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    const match = user.password && await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ message: 'Current password is incorrect' });
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ success: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return res.status(404).json({ message: 'Endpoint not found.' });
  res.status(404).sendFile(path.join(__dirname, '..', '404.html'));
});
app.use((err, req, res, next) => {
  res.status(err.status === 400 ? 400 : 500).json({ message: err.status === 400 ? 'Invalid request body.' : 'The request could not be completed.' });
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
