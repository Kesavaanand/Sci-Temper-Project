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
const twilio     = require('twilio');
 
const app  = express();
const PORT = process.env.PORT || 3000;
 
// ─── Email Transporter (Nodemailer) ───────────────────────────────────────────
// Set SMTP_USER and SMTP_PASS in Render environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
 
async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[EMAIL SKIPPED — no SMTP config] To:', to, '| Subject:', subject);
    return;
  }
  await transporter.sendMail({ from: `"SciTemper" <${process.env.SMTP_USER}>`, to, subject, html });
}  // ← Render sets PORT automatically
 
// ─── Twilio Verify Client ─────────────────────────────────────────────────────
// Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Render environment variables
const TWILIO_SERVICE_SID = 'VAf66ad6a5c075d0b65b847961ec941b85';
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('✅  Twilio client initialised');
} else {
  console.warn('⚠️   Twilio env vars not set — SMS will be skipped, falling back to email');
}
 
/**
 * sendOTP — sends OTP via BOTH SMS (Twilio Verify) AND email simultaneously.
 *
 * IMPORTANT — Two separate codes are in play:
 *   • SMS  : Twilio Verify generates its OWN code and sends it to the phone.
 *            Verify via twilioClient.verify.v2.services(...).verificationChecks
 *   • Email: Our locally generated `otp` from otpStore is sent here.
 *            Verify via validateOTP() / otpStore.
 *
 * The user can use EITHER code to authenticate. Both channels fire in parallel.
 *
 * @param {string} phone  — E.164 number e.g. "+919876543210" (may be empty string)
 * @param {string} email  — user email address
 * @param {string} otp    — locally generated OTP (sent via email)
 * @param {string} label  — display label e.g. 'Verify Your Account' or 'Login OTP'
 * @returns {{ channels: string[] }}  — list of channels that succeeded
 */
async function sendOTP(phone, email, otp, label = 'OTP') {
  const channels = [];
  const errors   = [];
 
  // ── Fire SMS via Twilio Verify (Twilio generates its own code)
  if (phone && twilioClient) {
    try {
      await twilioClient.verify.v2
        .services(TWILIO_SERVICE_SID)
        .verifications
        .create({ to: phone, channel: 'sms' });
      channels.push('sms');
      console.log(`[SMS OTP sent] To: ${phone}`);
    } catch (smsErr) {
      errors.push(`SMS: ${smsErr.message}`);
      console.warn(`[SMS failed] ${smsErr.message}`);
    }
  }
 
  // ── Always send email as well (carries our local OTP from otpStore)
  try {
    await sendEmail(
      email,
      `SciTemper — ${label}`,
      `<div style="font-family:monospace;background:#0a0e0f;color:#e8f0f2;padding:2rem;max-width:500px;">
        <h2 style="color:#00e5c3;">SciTemper</h2>
        <p>Your OTP is:</p>
        <div style="font-size:2rem;letter-spacing:0.5em;color:#00e5c3;padding:1rem;border:1px solid #243034;text-align:center;">${otp}</div>
        <p style="color:#6a8891;font-size:0.8rem;">This OTP expires in 5 minutes. Do not share it with anyone.</p>
      </div>`
    );
    channels.push('email');
    console.log(`[Email OTP sent] To: ${email}`);
  } catch (emailErr) {
    errors.push(`Email: ${emailErr.message}`);
    console.warn(`[Email failed] ${emailErr.message}`);
  }
 
  if (channels.length === 0) {
    throw new Error(`All OTP channels failed: ${errors.join(' | ')}`);
  }
 
  return { channels };
}
 
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
 
// ─── OTP Schema & Model (persisted — survives server restarts) ─────────────────
const otpSchema = new mongoose.Schema({
  email:   { type: String, required: true, unique: true },
  otp:     { type: String, required: true },
  type:    { type: String, required: true },
  expires: { type: Number, required: true },
  verified: { type: Boolean, default: false },
});
const OTPRecord = mongoose.model('OTPRecord', otpSchema);
 
// ─── In-memory stores ──────────────────────────────────────────────────────────
/**
 * otpStore  — holds active OTPs (registration & login)
 * Shape: { [email]: { otp, expires, type: 'register'|'login' } }
 *
 * ⚠️  WARNING: This store is in-memory only. If the server restarts (e.g. Render
 * free-tier spin-down), all pending OTPs are lost and users will see
 * "OTP not found" even if they enter the correct code. For production,
 * persist OTPs in MongoDB or Redis.
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
 
// ─── OTP helpers (DB-backed — survives server restarts) ───────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
 
async function storeOTP(email, type) {
  const otp     = generateOTP();
  const expires = Date.now() + OTP_EXPIRY_MS;
  await OTPRecord.findOneAndUpdate(
    { email },
    { otp, type, expires, verified: false },
    { upsert: true, new: true }
  );
  // Keep in-memory mirror for backward compat with sync checks
  otpStore[email] = { otp, expires, type };
  return otp;
}
 
async function validateOTP(email, otp, expectedType) {
  // Check DB first (survives restarts), fall back to in-memory
  let entry = null;
  try {
    const record = await OTPRecord.findOne({ email });
    if (record) {
      entry = { otp: record.otp, expires: record.expires, type: record.type, verified: record.verified };
    }
  } catch (_) {
    // DB unavailable — fall back to in-memory store
    entry = otpStore[email] || null;
  }
  if (!entry)                           return { valid: false, reason: 'OTP not found — please request a new one.' };
  if (entry.type !== expectedType)      return { valid: false, reason: 'OTP type mismatch — please request a new OTP.' };
  if (Date.now() > entry.expires)       return { valid: false, reason: 'OTP has expired. Please request a new one.' };
  if (entry.otp !== String(otp).trim()) return { valid: false, reason: 'Incorrect OTP. Please check and try again.' };
  return { valid: true };
}
 
async function clearOTP(email) {
  delete otpStore[email];
  try { await OTPRecord.deleteOne({ email }); } catch (_) {}
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
  const otp = await storeOTP(email.toLowerCase(), 'register');
 
  // ── Send OTP via both SMS and email
  let regChannels = ['email'];
  try {
    const result = await sendOTP(
      phone || '',
      email.toLowerCase(),
      otp,
      'Verify Your Account'
    );
    regChannels = result.channels;
  } catch (e) {
    console.error('OTP send error:', e.message);
  }
 
  ok(res, `Registration initiated. OTP sent via ${regChannels.join(' and ')}.`, {
    email: email.toLowerCase(),
    channels: regChannels,
    note: 'OTP expires in 5 minutes. Use the OTP from SMS or email.',
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
 
  // ── OTP valid → move from pending to confirmed users
  const pending = pendingUsers[normalEmail];
  if (!pending)
    return err(res, 'No pending registration found. Please register again.');
 
  // ── Check local OTP (email channel) first
  const localResult = await validateOTP(normalEmail, otp, 'register');
 
  // ── If local fails AND user has a phone, also check Twilio (SMS channel)
  let verified = localResult.valid;
  if (!verified && pending.phone && twilioClient) {
    try {
      const check = await twilioClient.verify.v2
        .services(TWILIO_SERVICE_SID)
        .verificationChecks
        .create({ to: pending.phone, code: String(otp) });
      verified = (check.status === 'approved');
      if (verified) console.log(`[Twilio SMS OTP verified] For: ${normalEmail}`);
    } catch (twilioErr) {
      console.warn(`[Twilio check failed] ${twilioErr.message}`);
    }
  }
 
  if (!verified)
    return err(res, localResult.reason || 'Incorrect OTP.');
 
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
  await clearOTP(normalEmail);
 
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
  const otp = await storeOTP(user.email, 'login');
 
  // Send OTP via both SMS and email
  let loginChannels = ['email'];
  try {
    const result = await sendOTP(
      user.phone || '',
      user.email,
      otp,
      'Login OTP'
    );
    loginChannels = result.channels;
  } catch (e) {
    console.error('OTP send error:', e.message);
  }
 
  ok(res, `Credentials verified. OTP sent via ${loginChannels.join(' and ')}.`, {
    email: user.email,
    channels: loginChannels,
    note:  'OTP expires in 5 minutes. Use the OTP from SMS or email.',
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
 
  // ── Find user first so we have their phone for Twilio check
  let user;
  try {
    user = await User.findOne({ email: normalEmail });
  } catch {
    return err(res, 'Server error.', 500);
  }
 
  if (!user)
    return err(res, 'User not found.', 404);
 
  // ── Check local OTP (email channel) first
  const localResult = await validateOTP(normalEmail, otp, 'login');
 
  // ── If local fails AND user has a phone, also check Twilio (SMS channel)
  let verified = localResult.valid;
  if (!verified && user.phone && twilioClient) {
    try {
      const check = await twilioClient.verify.v2
        .services(TWILIO_SERVICE_SID)
        .verificationChecks
        .create({ to: user.phone, code: String(otp) });
      verified = (check.status === 'approved');
      if (verified) console.log(`[Twilio SMS OTP verified] For: ${normalEmail}`);
    } catch (twilioErr) {
      console.warn(`[Twilio check failed] ${twilioErr.message}`);
    }
  }
 
  if (!verified)
    return err(res, localResult.reason || 'Incorrect OTP.', 401);
 
  // ── OTP valid
  await clearOTP(normalEmail);
 
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
 
  const otp = await storeOTP(normalEmail, type);
 
  // Send OTP: SMS first, email fallback
  // Retrieve phone for confirmed users (login resend); pending users may have phone too
  let resendPhone = '';
  if (type === 'login') {
    try {
      const resendUser = await User.findOne({ email: normalEmail });
      resendPhone = resendUser?.phone || '';
    } catch (_) {}
  } else if (pendingUsers[normalEmail]) {
    resendPhone = pendingUsers[normalEmail].phone || '';
  }
 
  let resendChannels = ['email'];
  try {
    const result = await sendOTP(resendPhone, normalEmail, otp, 'New OTP');
    resendChannels = result.channels;
  } catch (e) {
    console.error('OTP send error:', e.message);
  }
 
  ok(res, `A new OTP has been sent via ${resendChannels.join(' and ')}.`, {
    email: normalEmail,
    channels: resendChannels,
    note:  'New OTP expires in 5 minutes. Use the OTP from SMS or email.',
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
//  ROUTE — POST /forgot-password  (step 1: send reset OTP to email)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
 
  if (!email || !isValidEmail(email))
    return err(res, 'A valid email address is required.');
 
  const normalEmail = email.toLowerCase();
 
  let user;
  try {
    user = await User.findOne({ email: normalEmail });
  } catch {
    return err(res, 'Server error.', 500);
  }
 
  // Always respond with success to prevent email enumeration attacks
  if (!user) {
    return ok(res, 'If that email is registered, a reset code has been sent.');
  }
 
  const otp = await storeOTP(normalEmail, 'reset');
 
  try {
    await sendEmail(
      normalEmail,
      'SciTemper — Password Reset Code',
      `<div style="font-family:monospace;background:#0a0e0f;color:#e8f0f2;padding:2rem;max-width:500px;">
        <h2 style="color:#00e5c3;">SciTemper</h2>
        <p>Hello <strong>${user.username}</strong>,</p>
        <p>You requested a password reset. Your one-time reset code is:</p>
        <div style="font-size:2rem;letter-spacing:0.5em;color:#00e5c3;padding:1rem;border:1px solid #243034;text-align:center;">${otp}</div>
        <p style="color:#6a8891;font-size:0.8rem;">This code expires in 5 minutes. If you did not request a reset, please ignore this email.</p>
        <p style="color:#6a8891;font-size:0.8rem;">— The SciTemper Team</p>
      </div>`
    );
    console.log(`[Password Reset OTP sent] To: ${normalEmail}`);
  } catch (e) {
    console.error('Reset OTP send error:', e.message);
    return err(res, 'Failed to send reset code. Please try again later.', 500);
  }
 
  ok(res, 'If that email is registered, a reset code has been sent.');
});
 
 
// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE — POST /verify-reset-otp  (step 2: confirm OTP before allowing reset)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/verify-reset-otp', async (req, res) => {
  const { email, otp } = req.body;
 
  if (!email || !otp)
    return err(res, 'Email and OTP are required.');
 
  const normalEmail = email.toLowerCase();
  const result = await validateOTP(normalEmail, otp, 'reset');
 
  if (!result.valid)
    return err(res, result.reason || 'Invalid or expired reset code.', 401);
 
  // Mark OTP as verified in both DB and in-memory store
  try { await OTPRecord.findOneAndUpdate({ email: normalEmail }, { verified: true }); } catch (_) {}
  if (otpStore[normalEmail]) otpStore[normalEmail].verified = true;
 
  ok(res, 'Reset code verified. You may now set a new password.');
});
 
 
// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE — POST /reset-password  (step 3: set the new password)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
 
  if (!email || !newPassword)
    return err(res, 'Email and new password are required.');
 
  if (newPassword.length < 6)
    return err(res, 'Password must be at least 6 characters long.');
 
  const normalEmail = email.toLowerCase();
 
  // Ensure OTP was verified in this session (check DB first, then in-memory)
  let entry = otpStore[normalEmail] || null;
  try {
    const dbRecord = await OTPRecord.findOne({ email: normalEmail });
    if (dbRecord) entry = { type: dbRecord.type, verified: dbRecord.verified, expires: dbRecord.expires };
  } catch (_) {}
  if (!entry || entry.type !== 'reset' || !entry.verified)
    return err(res, 'Reset session expired or invalid. Please start over.', 401);
 
  if (Date.now() > entry.expires)
    return err(res, 'Reset session has expired. Please request a new code.', 401);
 
  let passwordHash;
  try {
    passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  } catch {
    return err(res, 'Server error while hashing password.', 500);
  }
 
  try {
    const updated = await User.findOneAndUpdate(
      { email: normalEmail },
      { passwordHash },
      { new: true }
    );
    if (!updated)
      return err(res, 'No account found with this email address.', 404);
  } catch {
    return err(res, 'Server error while updating password.', 500);
  }
 
  await clearOTP(normalEmail);
  console.log(`[Password Reset] Completed for: ${normalEmail}`);
 
  ok(res, 'Password reset successfully! You can now log in with your new password.');
});
 
 
// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE — POST /send-assessment-link  (contact page → send link to any email)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/send-assessment-link', async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email))
    return err(res, 'A valid email is required.');
 
  const siteUrl = process.env.SITE_URL || 'https://scitemper.onrender.com';
  const assessmentLink = `${siteUrl}/quiz.html`;
 
  try {
    await sendEmail(
      email,
      'Your SciTemper Assessment Link 🔬',
      `<div style="font-family:monospace;background:#0a0e0f;color:#e8f0f2;padding:2rem;max-width:500px;">
        <h2 style="color:#00e5c3;">SciTemper</h2>
        <p>Hello,</p>
        <p>Someone shared the SciTemper Scientific Temper Assessment with you!</p>
        <div style="padding:1rem;border:1px solid #243034;text-align:center;margin:1rem 0;">
          <a href="${assessmentLink}" style="color:#00e5c3;font-size:1rem;">${assessmentLink}</a>
        </div>
        <p>Measure your scientific temper across multiple dimensions and start your learning journey.</p>
        <p style="color:#6a8891;font-size:0.8rem;">— The SciTemper Team</p>
      </div>`
    );
    ok(res, 'Assessment link sent successfully!');
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
 
