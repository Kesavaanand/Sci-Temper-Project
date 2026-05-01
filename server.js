/**
 * SciTemper — Auth Backend + AI Chat Server
 * Node.js + Express + Socket.io | Secure user auth with OTP verification
 */

const express    = require('express');
const bcrypt     = require('bcrypt');
const cors       = require('cors');
const mongoose   = require('mongoose');
const path       = require('path');
const dns        = require('dns');
const http       = require('http');
const { Server } = require('socket.io');
const twilio     = require('twilio');

const app    = express();
const server = http.createServer(app);   // ← wrap Express in http.Server for Socket.io
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Keep-alive settings so Render free tier doesn't drop sockets
  pingTimeout:  60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 3000;

// ─── Email via SendGrid API ───────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[EMAIL SKIPPED — no SENDGRID_API_KEY] To:', to, '| Subject:', subject);
    return;
  }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'kesavaanand2257@gmail.com', name: 'SciTemper' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data.errors && data.errors[0].message) || 'SendGrid API error');
  }
}

// ─── Twilio Verify Client ─────────────────────────────────────────────────────
const TWILIO_SERVICE_SID = 'VAf66ad6a5c075d0b65b847961ec941b85';
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('✅  Twilio client initialised');
} else {
  console.warn('⚠️   Twilio env vars not set — SMS will be skipped, falling back to email');
}

async function sendOTP(phone, email, otp, label = 'OTP') {
  const channels = [];
  const errors   = [];

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

  try {
    await sendEmail(
      email,
      `SciTemper — ${label}`,
      `<div style="font-family:Arial,sans-serif;background:#ffffff;color:#222222;padding:2rem;max-width:500px;border:1px solid #e0e0e0;">
        <h2 style="color:#00b89c;">SciTemper</h2>
        <p>Hello,</p>
        <p>Your one-time password (OTP) for SciTemper is:</p>
        <div style="font-size:2rem;letter-spacing:0.5em;color:#00b89c;padding:1rem;border:1px solid #e0e0e0;text-align:center;background:#f9f9f9;">${otp}</div>
        <p>This OTP expires in 5 minutes. Do not share it with anyone.</p>
        <p style="color:#888888;font-size:0.8rem;">If you did not request this, please ignore this email.</p>
        <p style="color:#888888;font-size:0.8rem;">— The SciTemper Team</p>
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
app.use(express.static(path.join(__dirname)));

// ─── Constants ─────────────────────────────────────────────────────────────────
const OTP_EXPIRY_MS   = 5 * 60 * 1000;
const MAX_LOGIN_TRIES = 3;
const SALT_ROUNDS     = 10;

// ─── MongoDB Connection ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
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

// ─── OTP Schema & Model ────────────────────────────────────────────────────────
const otpSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true },
  otp:      { type: String, required: true },
  type:     { type: String, required: true },
  expires:  { type: Number, required: true },
  verified: { type: Boolean, default: false },
});
const OTPRecord = mongoose.model('OTPRecord', otpSchema);

// ─── In-memory stores ──────────────────────────────────────────────────────────
const otpStore     = {};
const pendingUsers = {};
const loginAttempts = {};

// ─── OTP helpers ──────────────────────────────────────────────────────────────
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
  otpStore[email] = { otp, expires, type };
  return otp;
}

async function validateOTP(email, otp, expectedType) {
  let entry = null;
  try {
    const record = await OTPRecord.findOne({ email });
    if (record) {
      entry = { otp: record.otp, expires: record.expires, type: record.type, verified: record.verified };
    }
  } catch (_) {
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
    loginAttempts[email].lockedUntil = Date.now() + OTP_EXPIRY_MS;
    loginAttempts[email].count = 0;
  }
}

function clearLoginAttempts(email) {
  delete loginAttempts[email];
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const ok  = (res, message, data = null) =>
  res.json({ success: true,  message, ...(data && { data }) });

const err = (res, message, status = 400) =>
  res.status(status).json({ success: false, message });


// ══════════════════════════════════════════════════════════════════════════════
//  AI CHAT — Socket.io handler
//  Uses Anthropic API. Set ANTHROPIC_API_KEY in Render environment variables.
//  Falls back to rule-based answers if the key is missing.
// ══════════════════════════════════════════════════════════════════════════════

// Per-socket conversation history (in-memory, cleared on disconnect)
const chatHistories = new Map();

// Rate limit: max 20 messages per socket per session
const CHAT_MSG_LIMIT = 20;
const chatMsgCount   = new Map();

const SCITEMPER_SYSTEM_PROMPT = `You are SciBot, the friendly AI assistant for SciTemper — a scientific literacy platform that helps users measure and grow their scientific temper.

Your role:
- Answer questions about scientific temper, the SciTemper platform, the quiz, and scientific topics
- Help users understand their quiz results and what they mean
- Give short, clear, encouraging replies (2-4 sentences max unless the question needs more detail)
- Be warm, encouraging, and enthusiastic about science
- Guide users to relevant platform features (quiz, temper scale, registration, login)

Platform facts:
- SciTemper assesses 6 dimensions: Conceptual Literacy, Critical Thinking, Statistical Reasoning, Scientific Method, Science-Society Interface, Misinformation Resistance
- 5 Temper Levels: Novice → Curious → Informed → Analytical → Scientific
- The quiz has 5 sample questions drawn from a 30-question bank
- Article 51A(h) of the Indian Constitution calls for scientific temper in every citizen
- Users must be logged in to take the full assessment

If someone asks about something completely unrelated to science or the platform, gently redirect them back to SciTemper topics.`;

async function getAIReply(socketId, userMessage) {
  // Build conversation history
  if (!chatHistories.has(socketId)) {
    chatHistories.set(socketId, []);
  }
  const history = chatHistories.get(socketId);
  history.push({ role: 'user', content: userMessage });

  // Keep last 10 turns to avoid token bloat
  const trimmedHistory = history.slice(-10);

  // Try Anthropic API
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',   // fast + cheap for chat
          max_tokens: 400,
          system:     SCITEMPER_SYSTEM_PROMPT,
          messages:   trimmedHistory,
        }),
      });

      if (response.ok) {
        const data  = await response.json();
        const reply = data.content[0].text;
        history.push({ role: 'assistant', content: reply });
        return reply;
      } else {
        console.warn('[Chat AI] Anthropic API error:', response.status);
      }
    } catch (fetchErr) {
      console.warn('[Chat AI] Fetch error:', fetchErr.message);
    }
  }

  // ── Fallback: rule-based replies (works even without API key)
  const msg = userMessage.toLowerCase();
  let reply = "I'm here to help with anything about SciTemper or scientific literacy! What would you like to know?";

  if (msg.includes('quiz') || msg.includes('assessment') || msg.includes('test')) {
    reply = "Our sample quiz has 5 questions from a 30-question bank covering 6 dimensions of scientific thinking. Log in first, then hit 'Take Free Assessment' to get started! 🔬";
  } else if (msg.includes('level') || msg.includes('temper') || msg.includes('score')) {
    reply = "SciTemper has 5 levels: Novice → Curious → Informed → Analytical → Scientific. Each level reflects how deeply you reason from evidence. Complete the quiz to see where you land! 📊";
  } else if (msg.includes('register') || msg.includes('sign up') || msg.includes('account')) {
    reply = "Creating an account is free! Click 'Login' in the nav bar and then choose Sign Up. You'll verify with an OTP sent to your email. 🎉";
  } else if (msg.includes('login') || msg.includes('log in') || msg.includes('password')) {
    reply = "Head to the Login page from the nav bar. Enter your credentials and verify with the OTP sent to your email. Forgot your password? Use the 'Forgot Password' link! 🔑";
  } else if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    reply = "Hello! 👋 I'm SciBot, your guide on SciTemper. I can help you understand scientific temper, navigate the platform, or answer science questions. What's on your mind?";
  } else if (msg.includes('what is') && msg.includes('scientific temper')) {
    reply = "Scientific temper is the disposition to approach all claims with evidence, scepticism, and rational inquiry. Article 51A(h) of the Indian Constitution actually makes it a fundamental duty of every citizen! 🇮🇳";
  } else if (msg.includes('dimension') || msg.includes('measure') || msg.includes('assess')) {
    reply = "We assess 6 dimensions: Conceptual Literacy, Critical Thinking, Statistical Reasoning, Scientific Method, Science-Society Interface, and Misinformation Resistance. Each gives you a unique slice of your scientific mind!";
  }

  history.push({ role: 'assistant', content: reply });
  return reply;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Socket.io connection handler
// ──────────────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Chat] Client connected: ${socket.id}`);
  chatMsgCount.set(socket.id, 0);

  // Send welcome message
  socket.emit('bot_message', {
    text: "👋 Hi! I'm **SciBot**, your SciTemper assistant. Ask me anything about scientific temper, the quiz, your results, or science in general!",
    timestamp: Date.now(),
  });

  socket.on('user_message', async (data) => {
    const text = (data && typeof data.text === 'string') ? data.text.trim() : '';

    // Guard: empty message
    if (!text) return;

    // Guard: message too long
    if (text.length > 500) {
      socket.emit('bot_message', { text: "Please keep your message under 500 characters.", timestamp: Date.now() });
      return;
    }

    // Guard: rate limit per session
    const count = (chatMsgCount.get(socket.id) || 0) + 1;
    chatMsgCount.set(socket.id, count);
    if (count > CHAT_MSG_LIMIT) {
      socket.emit('bot_message', {
        text: "You've reached the message limit for this session. Please refresh to start a new chat! 🔄",
        timestamp: Date.now(),
      });
      return;
    }

    // Emit typing indicator
    socket.emit('bot_typing', true);

    try {
      const reply = await getAIReply(socket.id, text);
      socket.emit('bot_typing', false);
      socket.emit('bot_message', { text: reply, timestamp: Date.now() });
    } catch (e) {
      console.error('[Chat] Error generating reply:', e.message);
      socket.emit('bot_typing', false);
      socket.emit('bot_message', {
        text: "Sorry, I ran into a hiccup! Please try again. 🙏",
        timestamp: Date.now(),
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Chat] Client disconnected: ${socket.id}`);
    chatHistories.delete(socket.id);
    chatMsgCount.delete(socket.id);
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE 1 — POST /register
// ══════════════════════════════════════════════════════════════════════════════
app.post('/register', async (req, res) => {
  const { username, email, phone, password } = req.body;

  if (!username || !email || !password)
    return err(res, 'All fields (username, email, password) are required.');

  if (!isValidEmail(email))
    return err(res, 'Please provide a valid email address.');

  if (password.length < 6)
    return err(res, 'Password must be at least 6 characters long.');

  if (username.trim().length < 3)
    return err(res, 'Username must be at least 3 characters long.');

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

  const otp = await storeOTP(email.toLowerCase(), 'register');

  let regChannels = ['email'];
  try {
    const result = await sendOTP(phone || '', email.toLowerCase(), otp, 'Verify Your Account');
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
//  ROUTE 2 — POST /verify-otp
// ══════════════════════════════════════════════════════════════════════════════
app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return err(res, 'Email and OTP are required.');

  const normalEmail = email.toLowerCase();
  const pending = pendingUsers[normalEmail];
  if (!pending)
    return err(res, 'No pending registration found. Please register again.');

  const localResult = await validateOTP(normalEmail, otp, 'register');

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

  delete pendingUsers[normalEmail];
  await clearOTP(normalEmail);

  ok(res, 'Account verified successfully! You can now log in.', {
    username: pending.username,
    email:    normalEmail,
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE 3 — POST /login
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

  const lock = checkLoginLock(user.email);
  if (lock.locked)
    return err(res,
      `Too many failed attempts. Account locked for ${lock.remaining} more seconds.`,
      429
    );

  let match;
  try {
    match = await bcrypt.compare(password, user.passwordHash);
  } catch {
    return err(res, 'Server error during authentication.', 500);
  }

  if (!match) {
    recordFailedAttempt(user.email);
    const attempts  = loginAttempts[user.email]?.count ?? 1;
    const remaining = MAX_LOGIN_TRIES - attempts;
    return err(res,
      remaining > 0
        ? `Invalid credentials. ${remaining} attempt(s) remaining.`
        : 'Invalid credentials. Account has been temporarily locked.',
      401
    );
  }

  clearLoginAttempts(user.email);
  const otp = await storeOTP(user.email, 'login');

  let loginChannels = ['email'];
  try {
    const result = await sendOTP(user.phone || '', user.email, otp, 'Login OTP');
    loginChannels = result.channels;
  } catch (e) {
    console.error('OTP send error:', e.message);
  }

  ok(res, `Credentials verified. OTP sent via ${loginChannels.join(' and ')}.`, {
    email: user.email,
    channels: loginChannels,
    note: 'OTP expires in 5 minutes. Use the OTP from SMS or email.',
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE 4 — POST /verify-login-otp
// ══════════════════════════════════════════════════════════════════════════════
app.post('/verify-login-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return err(res, 'Email and OTP are required.');

  const normalEmail = email.toLowerCase();

  let user;
  try {
    user = await User.findOne({ email: normalEmail });
  } catch {
    return err(res, 'Server error.', 500);
  }

  if (!user)
    return err(res, 'User not found.', 404);

  const localResult = await validateOTP(normalEmail, otp, 'login');

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

  await clearOTP(normalEmail);

  ok(res, 'Login successful! Welcome back.', {
    username: user.username,
    email:    normalEmail,
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE 5 — POST /resend-otp
// ══════════════════════════════════════════════════════════════════════════════
app.post('/resend-otp', async (req, res) => {
  const { email, type } = req.body;

  if (!email)       return err(res, 'Email is required.');
  if (!['register', 'login'].includes(type))
    return err(res, 'type must be "register" or "login".');

  const normalEmail = email.toLowerCase();

  if (type === 'register' && !pendingUsers[normalEmail])
    return err(res, 'No pending registration found for this email. Please register first.');

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
    note: 'New OTP expires in 5 minutes. Use the OTP from SMS or email.',
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE — GET /users  (dev only)
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
//  ROUTE — POST /check-email
// ══════════════════════════════════════════════════════════════════════════════
app.post('/check-email', async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email))
    return res.json({ valid: false });

  const domain = email.split('@')[1];
  dns.resolveMx(domain, (dnsErr, addresses) => {
    if (dnsErr || !addresses || addresses.length === 0) {
      return res.json({ valid: false });
    }
    res.json({ valid: true });
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE — POST /forgot-password
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
//  ROUTE — POST /verify-reset-otp
// ══════════════════════════════════════════════════════════════════════════════
app.post('/verify-reset-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return err(res, 'Email and OTP are required.');

  const normalEmail = email.toLowerCase();
  const result = await validateOTP(normalEmail, otp, 'reset');

  if (!result.valid)
    return err(res, result.reason || 'Invalid or expired reset code.', 401);

  try { await OTPRecord.findOneAndUpdate({ email: normalEmail }, { verified: true }); } catch (_) {}
  if (otpStore[normalEmail]) otpStore[normalEmail].verified = true;

  ok(res, 'Reset code verified. You may now set a new password.');
});


// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE — POST /reset-password
// ══════════════════════════════════════════════════════════════════════════════
app.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword)
    return err(res, 'Email and new password are required.');

  if (newPassword.length < 6)
    return err(res, 'Password must be at least 6 characters long.');

  const normalEmail = email.toLowerCase();

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
//  ROUTE — POST /send-assessment-link
// ══════════════════════════════════════════════════════════════════════════════
app.post('/send-assessment-link', async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email))
    return err(res, 'A valid email is required.');

  const siteUrl        = process.env.SITE_URL || 'https://scitemper.onrender.com';
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


// ─── Start server (use `server.listen`, NOT `app.listen`) ─────────────────────
server.listen(PORT, () => {
  console.log(`\n✅  SciTemper Server running on port ${PORT}`);
  console.log(`\n  Endpoints:`);
  console.log(`    POST /register          — Register new user`);
  console.log(`    POST /verify-otp        — Verify registration OTP`);
  console.log(`    POST /login             — Login (step 1: credentials)`);
  console.log(`    POST /verify-login-otp  — Login (step 2: OTP)`);
  console.log(`    POST /resend-otp        — Resend any OTP`);
  console.log(`    GET  /users             — List users (dev only)`);
  console.log(`    WS   Socket.io          — AI chat on /`);
  console.log(`\n  Database: ${process.env.MONGODB_URI}\n`);
});
