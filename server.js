/**
 * SciTemper — Auth Backend
 * Node.js + Express | Secure user auth with OTP verification
 */

const express  = require('express');
const bcrypt   = require('bcrypt');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Constants ─────────────────────────────────────────────────────────────────
const USERS_FILE      = path.join(__dirname, 'users.json');
const OTP_EXPIRY_MS   = 5 * 60 * 1000;   // 5 minutes
const MAX_LOGIN_TRIES = 3;
const SALT_ROUNDS     = 10;

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

// ─── File-based user storage helpers ──────────────────────────────────────────
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

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
  const { username, email, password } = req.body;

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
  const users = loadUsers();
  if (Object.values(users).find(u => u.email === email.toLowerCase()))
    return err(res, 'An account with this email already exists.');

  if (Object.values(users).find(u => u.username.toLowerCase() === username.toLowerCase()))
    return err(res, 'This username is already taken.');

  // ── Hash password and hold user in pending store
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    pendingUsers[email.toLowerCase()] = {
      username: username.trim(),
      email: email.toLowerCase(),
      passwordHash,
    };
  } catch {
    return err(res, 'Server error while processing registration.', 500);
  }

  // ── Generate and store OTP
  const otp = storeOTP(email.toLowerCase(), 'register');

  // In production: send OTP via email (e.g. nodemailer / SendGrid)
  // For development: return it in the response
  ok(res, 'Registration initiated. Please verify your email with the OTP.', {
    email: email.toLowerCase(),
    otp,                          // ← remove in production
    note: 'OTP expires in 5 minutes.',
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE 2 — POST /verify-otp  (complete registration)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/verify-otp', (req, res) => {
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

  const users = loadUsers();
  users[normalEmail] = {
    username:     pending.username,
    email:        pending.email,
    passwordHash: pending.passwordHash,
    createdAt:    new Date().toISOString(),
  };
  saveUsers(users);

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

  const users = loadUsers();
  const user  = Object.values(users).find(
    u => u.username.toLowerCase() === username.toLowerCase()
  );

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

  // In production: send OTP via email
  ok(res, 'Credentials verified. Please enter the OTP sent to your email.', {
    email: user.email,
    otp,           // ← remove in production
    note:  'OTP expires in 5 minutes.',
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE 4 — POST /verify-login-otp  (step 2: OTP check → logged in)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/verify-login-otp', (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return err(res, 'Email and OTP are required.');

  const normalEmail = email.toLowerCase();
  const result = validateOTP(normalEmail, otp, 'login');

  if (!result.valid)
    return err(res, result.reason, 401);

  // ── OTP valid
  clearOTP(normalEmail);

  const users = loadUsers();
  const user  = users[normalEmail];
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
app.post('/resend-otp', (req, res) => {
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
    const users = loadUsers();
    if (!users[normalEmail])
      return err(res, 'No account found with this email.');
  }

  const otp = storeOTP(normalEmail, type);

  ok(res, 'A new OTP has been generated.', {
    email: normalEmail,
    otp,   // ← remove in production
    note:  'New OTP expires in 5 minutes.',
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  BONUS ROUTE — GET /users  (dev only — list all registered users)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/users', (req, res) => {
  const users = loadUsers();
  const safeUsers = Object.values(users).map(({ username, email, createdAt }) => ({
    username, email, createdAt,
  }));
  ok(res, `${safeUsers.length} registered user(s).`, { users: safeUsers });
});


// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  ok(res, 'SciTemper Auth API is running.', { port: PORT });
});


// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => err(res, `Route ${req.method} ${req.path} not found.`, 404));


// ─── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  SciTemper Auth Server running on http://localhost:${PORT}`);
  console.log(`\n  Endpoints:`);
  console.log(`    POST /register          — Register new user`);
  console.log(`    POST /verify-otp        — Verify registration OTP`);
  console.log(`    POST /login             — Login (step 1: credentials)`);
  console.log(`    POST /verify-login-otp  — Login (step 2: OTP)`);
  console.log(`    POST /resend-otp        — Resend any OTP`);
  console.log(`    GET  /users             — List users (dev only)`);
  console.log(`\n  Data file: ${USERS_FILE}\n`);
});
