/**
 * SciTemper — Auth Backend
 * Node.js + Express | Secure user auth with OTP verification
 */

const express  = require('express');
const bcrypt   = require('bcrypt');
const cors     = require('cors');
const mongoose = require('mongoose');
const path     = require('path');
const dns      = require('dns');
const nodemailer = require('nodemailer');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Email Transporter (Nodemailer) ───────────────────────────────────────────
// Set SMTP_USER and SMTP_PASS in Render environment variables
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,  // Use Gmail App Password
  },
});

async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[EMAIL SKIPPED — no SMTP config] To:', to, '| Subject:', subject);
    return;
  }
  await transporter.sendMail({ from: `"SciTemper" <${process.env.SMTP_USER}>`, to, subject, html });
}  // ← Render sets PORT automatically

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));  // ← Serves all your HTML/CSS/JS files

// ─── Constants ─────────────────────────────────────────────────────────────────
const OTP_EXPIRY_MS   = 5 * 60 * 1000;   // 5 minutes
const MAX_LOGIN_TRIES = 3;
const SALT_ROUNDS     = 10;

// ─── MongoDB Connection ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)  // ← Reads from Render environment variable
  .then(() => console.log('✅  Connected to MongoDB (scitemper)'))
  .catch(e  => { console.error('❌  MongoDB connection error:', e); process.exit(1); });

// ─── User Schema & Model ───────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username:     { type: String, required: true },
  email:        { type: String, required: true, unique: true },
  phone:        { type: String, default: '' },
  passwordHash: { type: String, required: true },
  createdAt:    { type: Date,   default: Date.now },
});

const User = mongoose.model('User', userSchema);

// ─── In-memory stores ──────────────────────────────────────────────────────────
/**
 * otpStore  — holds active OTPs (registration & login)
 * Shape: { [email]: { otp, expires, type: 'register'|'login' } }
 */
const otpStore = {};

/**
 * pendingUsers — temporarily holds unverified registrations
 * Shape: { [email]: { username, email, passwordHash } }
 */
const pendingUsers = {};

/**
 * loginAttempts — tracks failed login attempts per email
 * Shape: { [email]: { count, lockedUntil } }
 */
const loginAttempts = {};

// ─── OTP helpers ──────────────────────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function storeOTP(email, type) {
  const otp     = generateOTP();
  const expires = Date.now() + OTP_EXPIRY_MS;
  otpStore[email] = { otp, expires, type };
  return otp;
}

function validateOTP(email, otp, expectedType) {
  const entry = otpStore[email];
  if (!entry)                         return { valid: false, reason: 'No OTP found for this email' };
  if (entry.type !== expectedType)    return { valid: false, reason: 'OTP type mismatch' };
  if (Date.now() > entry.expires)     return { valid: false, reason: 'OTP has expired' };
  if (entry.otp !== String(otp))      return { valid: false, reason: 'Incorrect OTP' };
  return { valid: true };
}

function clearOTP(email) {
  delete otpStore[email];
}

// ─── Rate-limiting helpers ─────────────────────────────────────────────────────
function checkLoginLock(email) {
  const record = loginAttempts[email];
  if (!record) return { locked: false };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { locked: true, remaining };
  }
  return { locked: false };
}

function recordFailedAttempt(email) {
  if (!loginAttempts[email]) loginAttempts[email] = { count: 0, lockedUntil: null };
  loginAttempts[email].count++;
  if (loginAttempts[email].count >= MAX_LOGIN_TRIES) {
    loginAttempts[email].lockedUntil = Date.now() + OTP_EXPIRY_MS; // lock for 5 min
    loginAttempts[email].count = 0;
  }
}

function clearLoginAttempts(email) {
  delete loginAttempts[email];
}

// ─── Validation helper ─────────────────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Response helper ───────────────────────────────────────────────────────────
const ok  = (res, message, data = null) =>
  res.json({ success: true,  message, ...(data && { data }) });

const err = (res, message, status = 400) =>
  res.status(status).json({ success: false, message });


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE 1 — POST /register
// ══════════════════════════════════════════════════════════════════════════════
app.post('/register', async (req, res) => {
  const { username, email, phone, password } = req.body;

  // ── Input validation
  if (!username || !email || !password)
    return err(res, 'All fields (username, email, password) are required.');

  if (!isValidEmail(email))
    return err(res, 'Please provide a valid email address.');

  if (password.length < 6)
    return err(res, 'Password must be at least 6 characters long.');

  if (username.trim().length < 3)
    return err(res, 'Username must be at least 3 characters long.');

  // ── Check for duplicate email / username in confirmed users
  try {
    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists)
      return err(res, 'An account with this email already exists.');

    const usernameExists = await User.findOne({
      username: { $regex: new RegExp(`^${username.trim()}$`, 'i') },
    });
    if (usernameExists)
      return err(res, 'This username is already taken.');
  } catch {
    return err(res, 'Server error while checking existing accounts.', 500);
  }

  // ── Hash password and hold user in pending store
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    pendingUsers[email.toLowerCase()] = {
      username: username.trim(),
      email: email.toLowerCase(),
      phone: phone || '',
      passwordHash,
    };
  } catch {
    return err(res, 'Server error while processing registration.', 500);
  }

  // ── Generate and store OTP
  const otp = storeOTP(email.toLowerCase(), 'register');

  // ── Send OTP via email
  try {
    await sendEmail(
      email,
      'SciTemper — Verify Your Account',
      `<div style="font-family:monospace;background:#0a0e0f;color:#e8f0f2;padding:2rem;max-width:500px;">
        <h2 style="color:#00e5c3;">SciTemper</h2>
        <p>Your registration OTP is:</p>
        <div style="font-size:2rem;letter-spacing:0.5em;color:#00e5c3;padding:1rem;border:1px solid #243034;text-align:center;">${otp}</div>
        <p style="color:#6a8891;font-size:0.8rem;">This OTP expires in 5 minutes. Do not share it with anyone.</p>
      </div>`
    );
  } catch (e) {
    console.error('Email send error:', e.message);
  }

  ok(res, 'Registration initiated. OTP sent to your email.', {
    email: email.toLowerCase(),
    note: 'OTP expires in 5 minutes.',
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE 2 — POST /verify-otp  (complete registration)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return err(res, 'Email and OTP are required.');

  const normalEmail = email.toLowerCase();
  const result = validateOTP(normalEmail, otp, 'register');

  if (!result.valid)
    return err(res, result.reason);

  // ── OTP valid → move from pending to confirmed users
  const pending = pendingUsers[normalEmail];
  if (!pending)
    return err(res, 'No pending registration found. Please register again.');

  try {
    await User.create({
      username:     pending.username,
      email:        pending.email,
      phone:        pending.phone || '',
      passwordHash: pending.passwordHash,
      createdAt:    new Date(),
    });
  } catch {
    return err(res, 'Server error while saving account.', 500);
  }

  // Cleanup
  delete pendingUsers[normalEmail];
  clearOTP(normalEmail);

  ok(res, 'Account verified successfully! You can now log in.', {
    username: pending.username,
    email:    normalEmail,
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE 3 — POST /login  (step 1: credentials check)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return err(res, 'Username and password are required.');

  let user;
  try {
    user = await User.findOne({
      username: { $regex: new RegExp(`^${username}$`, 'i') },
    });
  } catch {
    return err(res, 'Server error during authentication.', 500);
  }

  if (!user)
    return err(res, 'Invalid credentials.', 401);

  // ── Check account lock
  const lock = checkLoginLock(user.email);
  if (lock.locked)
    return err(res,
      `Too many failed attempts. Account locked for ${lock.remaining} more seconds.`,
      429
    );

  // ── Verify password
  let match;
  try {
    match = await bcrypt.compare(password, user.passwordHash);
  } catch {
    return err(res, 'Server error during authentication.', 500);
  }

  if (!match) {
    recordFailedAttempt(user.email);
    const attempts = loginAttempts[user.email]?.count ?? 1;
    const remaining = MAX_LOGIN_TRIES - attempts;
    return err(res,
      remaining > 0
        ? `Invalid credentials. ${remaining} attempt(s) remaining.`
        : 'Invalid credentials. Account has been temporarily locked.',
      401
    );
  }

  // ── Credentials correct — generate login OTP
  clearLoginAttempts(user.email);
  const otp = storeOTP(user.email, 'login');

  // Send OTP via email
  try {
    await sendEmail(
      user.email,
      'SciTemper — Login OTP',
      `<div style="font-family:monospace;background:#0a0e0f;color:#e8f0f2;padding:2rem;max-width:500px;">
        <h2 style="color:#00e5c3;">SciTemper</h2>
        <p>Your login OTP is:</p>
        <div style="font-size:2rem;letter-spacing:0.5em;color:#00e5c3;padding:1rem;border:1px solid #243034;text-align:center;">${otp}</div>
        <p style="color:#6a8891;font-size:0.8rem;">This OTP expires in 5 minutes. Do not share it with anyone.</p>
      </div>`
    );
  } catch (e) {
    console.error('Email send error:', e.message);
  }

  ok(res, 'Credentials verified. OTP sent to your registered email.', {
    email: user.email,
    note:  'OTP expires in 5 minutes.',
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE 4 — POST /verify-login-otp  (step 2: OTP check → logged in)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/verify-login-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return err(res, 'Email and OTP are required.');

  const normalEmail = email.toLowerCase();
  const result = validateOTP(normalEmail, otp, 'login');

  if (!result.valid)
    return err(res, result.reason, 401);

  // ── OTP valid
  clearOTP(normalEmail);

  let user;
  try {
    user = await User.findOne({ email: normalEmail });
  } catch {
    return err(res, 'Server error.', 500);
  }

  if (!user)
    return err(res, 'User not found.', 404);

  ok(res, 'Login successful! Welcome back.', {
    username: user.username,
    email:    normalEmail,
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  BONUS ROUTE — POST /resend-otp
// ══════════════════════════════════════════════════════════════════════════════
app.post('/resend-otp', async (req, res) => {
  const { email, type } = req.body;

  if (!email)       return err(res, 'Email is required.');
  if (!['register', 'login'].includes(type))
    return err(res, 'type must be "register" or "login".');

  const normalEmail = email.toLowerCase();

  // For registration: pending user must exist
  if (type === 'register' && !pendingUsers[normalEmail])
    return err(res, 'No pending registration found for this email. Please register first.');

  // For login: confirmed user must exist
  if (type === 'login') {
    try {
      const user = await User.findOne({ email: normalEmail });
      if (!user)
        return err(res, 'No account found with this email.');
    } catch {
      return err(res, 'Server error.', 500);
    }
  }

  const otp = storeOTP(normalEmail, type);

  // Send via email
  try {
    await sendEmail(
      normalEmail,
      'SciTemper — New OTP',
      `<div style="font-family:monospace;background:#0a0e0f;color:#e8f0f2;padding:2rem;max-width:500px;">
        <h2 style="color:#00e5c3;">SciTemper</h2>
        <p>Your new OTP is:</p>
        <div style="font-size:2rem;letter-spacing:0.5em;color:#00e5c3;padding:1rem;border:1px solid #243034;text-align:center;">${otp}</div>
        <p style="color:#6a8891;font-size:0.8rem;">This OTP expires in 5 minutes.</p>
      </div>`
    );
  } catch (e) {
    console.error('Email send error:', e.message);
  }

  ok(res, 'A new OTP has been sent to your email.', {
    email: normalEmail,
    note:  'New OTP expires in 5 minutes.',
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  BONUS ROUTE — GET /users  (dev only — list all registered users)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username email createdAt -_id');
    ok(res, `${users.length} registered user(s).`, { users });
  } catch {
    return err(res, 'Server error while fetching users.', 500);
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE — POST /check-email  (validate email domain via DNS MX lookup)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/check-email', async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email))
    return res.json({ valid: false });

  const domain = email.split('@')[1];
  dns.resolveMx(domain, (err, addresses) => {
    if (err || !addresses || addresses.length === 0) {
      return res.json({ valid: false });
    }
    res.json({ valid: true });
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE — POST /send-assessment-link  (contact page → send link to user email)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/send-assessment-link', async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email))
    return err(res, 'A valid email is required.');

  // Find user by email
  let user;
  try {
    user = await User.findOne({ email: email.toLowerCase() });
  } catch {
    return err(res, 'Server error.', 500);
  }

  if (!user)
    return err(res, 'No account found with this email address. Please sign up first.');

  const siteUrl = process.env.SITE_URL || 'https://scitemper.onrender.com';
  const assessmentLink = `${siteUrl}/quiz.html`;

  try {
    await sendEmail(
      user.email,
      'Your SciTemper Assessment Link 🔬',
      `<div style="font-family:monospace;background:#0a0e0f;color:#e8f0f2;padding:2rem;max-width:500px;">
        <h2 style="color:#00e5c3;">SciTemper</h2>
        <p>Hello <strong>${user.username}</strong>,</p>
        <p>Here is your personalised assessment link:</p>
        <div style="padding:1rem;border:1px solid #243034;text-align:center;margin:1rem 0;">
          <a href="${assessmentLink}" style="color:#00e5c3;font-size:1rem;">${assessmentLink}</a>
        </div>
        <p>Measure your scientific temper across 12 dimensions and start your learning journey.</p>
        <p style="color:#6a8891;font-size:0.8rem;">— The SciTemper Team</p>
      </div>`
    );
    ok(res, 'Assessment link sent to your registered email!');
  } catch (e) {
    console.error('Email send error:', e.message);
    err(res, 'Failed to send email. Please try again later.', 500);
  }
});


// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => err(res, `Route ${req.method} ${req.path} not found.`, 404));


// ─── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  SciTemper Auth Server running on port ${PORT}`);
  console.log(`\n  Endpoints:`);
  console.log(`    POST /register          — Register new user`);
  console.log(`    POST /verify-otp        — Verify registration OTP`);
  console.log(`    POST /login             — Login (step 1: credentials)`);
  console.log(`    POST /verify-login-otp  — Login (step 2: OTP)`);
  console.log(`    POST /resend-otp        — Resend any OTP`);
  console.log(`    GET  /users             — List users (dev only)`);
  console.log(`\n  Database: ${process.env.MONGODB_URI}\n`);
});
