/**
 * SciTemper — SciBot Chat Widget
 * Drop this script + socket.io client into any page.
 * Connects via Socket.io, sends/receives messages in real time.
 *
 * Dependencies (add to your HTML before this script):
 *   <script src="/socket.io/socket.io.js"></script>
 *   <script src="chatbot.js"></script>
 */

(function () {
  'use strict';

  // ── Prevent double-init ────────────────────────────────────────────────────
  if (window.__scibotLoaded) return;
  window.__scibotLoaded = true;

  // ── Inject styles ──────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = `
    /* ── Widget container ── */
    #scibot-widget {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
    }

    /* ── Floating button ── */
    #scibot-btn {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00e5c3, #00b89c);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0,229,195,0.4);
      transition: transform 0.2s, box-shadow 0.2s;
      outline: none;
      margin-left: auto;
    }
    #scibot-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 28px rgba(0,229,195,0.55);
    }
    #scibot-btn svg {
      width: 26px;
      height: 26px;
      fill: #0a0e0f;
      transition: opacity 0.2s;
    }
    #scibot-btn .icon-close { display: none; }
    #scibot-widget.open #scibot-btn .icon-chat  { display: none; }
    #scibot-widget.open #scibot-btn .icon-close { display: block; }

    /* ── Unread badge ── */
    #scibot-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #e05a7a;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      display: none;
      align-items: center;
      justify-content: center;
      border: 2px solid #0a0e0f;
    }
    #scibot-badge.visible { display: flex; }

    /* ── Chat window ── */
    #scibot-window {
      position: absolute;
      bottom: 68px;
      right: 0;
      width: 340px;
      max-height: 480px;
      background: #111819;
      border: 1px solid #1e2c2f;
      border-radius: 16px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transform: translateY(12px) scale(0.97);
      pointer-events: none;
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    #scibot-widget.open #scibot-window {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    /* Mobile: full-width at bottom */
    @media (max-width: 420px) {
      #scibot-widget {
        bottom: 0;
        right: 0;
        left: 0;
      }
      #scibot-btn { margin-right: 16px; margin-bottom: 16px; }
      #scibot-window {
        width: 100vw;
        max-height: 70vh;
        border-radius: 16px 16px 0 0;
        bottom: 72px;
        right: 0;
        left: 0;
      }
    }

    /* ── Header ── */
    #scibot-header {
      background: linear-gradient(135deg, #0e1a1c, #131f21);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid #1e2c2f;
      flex-shrink: 0;
    }
    #scibot-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00e5c3, #00b89c);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 17px;
      flex-shrink: 0;
    }
    #scibot-title { flex: 1; }
    #scibot-title strong {
      display: block;
      color: #e8f0f2;
      font-size: 14px;
      font-weight: 600;
    }
    #scibot-title span {
      font-size: 11px;
      color: #00e5c3;
    }
    #scibot-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00e5c3;
      box-shadow: 0 0 6px #00e5c3;
      flex-shrink: 0;
    }
    #scibot-status-dot.offline {
      background: #6a8891;
      box-shadow: none;
    }

    /* ── Messages area ── */
    #scibot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }
    #scibot-messages::-webkit-scrollbar { width: 4px; }
    #scibot-messages::-webkit-scrollbar-track { background: transparent; }
    #scibot-messages::-webkit-scrollbar-thumb { background: #243034; border-radius: 4px; }

    /* ── Message bubbles ── */
    .scibot-msg {
      display: flex;
      flex-direction: column;
      max-width: 88%;
      animation: scibotFadeIn 0.18s ease;
    }
    @keyframes scibotFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .scibot-msg.bot  { align-self: flex-start; }
    .scibot-msg.user { align-self: flex-end; }

    .scibot-bubble {
      padding: 9px 13px;
      border-radius: 14px;
      line-height: 1.55;
      font-size: 13px;
      word-break: break-word;
    }
    .scibot-msg.bot .scibot-bubble {
      background: #1a2629;
      color: #d0e0e3;
      border-bottom-left-radius: 4px;
    }
    .scibot-msg.user .scibot-bubble {
      background: linear-gradient(135deg, #00c4a8, #009e87);
      color: #0a0e0f;
      font-weight: 500;
      border-bottom-right-radius: 4px;
    }
    .scibot-bubble strong { font-weight: 700; }

    /* ── Typing indicator ── */
    #scibot-typing {
      display: none;
      align-items: center;
      gap: 4px;
      padding: 10px 13px;
      background: #1a2629;
      border-radius: 14px;
      border-bottom-left-radius: 4px;
      width: fit-content;
      max-width: 80px;
    }
    #scibot-typing.visible { display: flex; }
    #scibot-typing span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #00e5c3;
      animation: scibotBounce 1.2s infinite;
    }
    #scibot-typing span:nth-child(2) { animation-delay: 0.18s; }
    #scibot-typing span:nth-child(3) { animation-delay: 0.36s; }
    @keyframes scibotBounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
      30%            { transform: translateY(-5px); opacity: 1; }
    }

    /* ── Input row ── */
    #scibot-input-row {
      display: flex;
      gap: 8px;
      padding: 10px 12px;
      border-top: 1px solid #1e2c2f;
      flex-shrink: 0;
      background: #0e1a1c;
    }
    #scibot-input {
      flex: 1;
      background: #182224;
      border: 1px solid #243034;
      border-radius: 10px;
      color: #e8f0f2;
      font-size: 13px;
      padding: 9px 12px;
      outline: none;
      resize: none;
      font-family: inherit;
      line-height: 1.4;
      max-height: 80px;
      transition: border-color 0.18s;
    }
    #scibot-input:focus { border-color: #00e5c3; }
    #scibot-input::placeholder { color: #4a6468; }
    #scibot-send {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #00e5c3, #00b89c);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.18s, transform 0.18s;
      align-self: flex-end;
    }
    #scibot-send:hover { opacity: 0.88; transform: scale(1.05); }
    #scibot-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    #scibot-send svg { width: 16px; height: 16px; fill: #0a0e0f; }

    /* ── Error banner ── */
    #scibot-error {
      display: none;
      padding: 6px 12px;
      background: rgba(224,90,122,0.18);
      color: #e05a7a;
      font-size: 11px;
      text-align: center;
      border-top: 1px solid rgba(224,90,122,0.25);
    }
    #scibot-error.visible { display: block; }
  `;
  document.head.appendChild(style);

  // ── Build DOM ───────────────────────────────────────────────────────────────
  var widget = document.createElement('div');
  widget.id  = 'scibot-widget';
  widget.innerHTML = `
    <div id="scibot-window" role="dialog" aria-label="SciBot chat">
      <div id="scibot-header">
        <div id="scibot-avatar">🤖</div>
        <div id="scibot-title">
          <strong>SciBot</strong>
          <span id="scibot-status-text">Connecting...</span>
        </div>
        <div id="scibot-status-dot" class="offline"></div>
      </div>
      <div id="scibot-messages" aria-live="polite"></div>
      <div id="scibot-error"></div>
      <div id="scibot-input-row">
        <textarea id="scibot-input" rows="1" placeholder="Ask about science, the quiz, your results…" maxlength="500" aria-label="Chat message"></textarea>
        <button id="scibot-send" aria-label="Send message" disabled>
          <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
    <div id="scibot-badge" aria-label="Unread messages"></div>
    <button id="scibot-btn" aria-label="Open SciBot chat">
      <svg class="icon-chat" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>
      <svg class="icon-close" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </button>
  `;
  document.body.appendChild(widget);

  // ── Element refs ───────────────────────────────────────────────────────────
  var btn        = document.getElementById('scibot-btn');
  var win        = document.getElementById('scibot-window');
  var messages   = document.getElementById('scibot-messages');
  var inputEl    = document.getElementById('scibot-input');
  var sendBtn    = document.getElementById('scibot-send');
  var badge      = document.getElementById('scibot-badge');
  var statusDot  = document.getElementById('scibot-status-dot');
  var statusText = document.getElementById('scibot-status-text');
  var errorBanner= document.getElementById('scibot-error');
  var typingEl;

  // ── State ──────────────────────────────────────────────────────────────────
  var isOpen    = false;
  var unread    = 0;
  var connected = false;
  var socket    = null;

  // ── Toggle open/close ──────────────────────────────────────────────────────
  function toggleChat() {
    isOpen = !isOpen;
    if (isOpen) {
      widget.classList.add('open');
      unread = 0;
      badge.classList.remove('visible');
      setTimeout(function () { inputEl.focus(); }, 220);
      scrollToBottom();
    } else {
      widget.classList.remove('open');
    }
  }
  btn.addEventListener('click', toggleChat);

  // ── Close on Escape ────────────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) toggleChat();
  });

  // ── Render a message bubble ────────────────────────────────────────────────
  function addMessage(text, sender) {
    // Remove typing indicator before adding message
    removeTyping();

    var wrap = document.createElement('div');
    wrap.className = 'scibot-msg ' + sender;

    var bubble = document.createElement('div');
    bubble.className = 'scibot-bubble';

    // Simple markdown: **bold**
    var safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    bubble.innerHTML = safe;

    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    scrollToBottom();

    if (sender === 'bot' && !isOpen) {
      unread++;
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.classList.add('visible');
    }
  }

  // ── Typing indicator ───────────────────────────────────────────────────────
  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement('div');
    typingEl.id = 'scibot-typing';
    typingEl.className = 'visible';
    typingEl.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(typingEl);
    scrollToBottom();
  }
  function removeTyping() {
    if (typingEl && typingEl.parentNode) {
      typingEl.parentNode.removeChild(typingEl);
    }
    typingEl = null;
  }

  // ── Scroll messages to bottom ──────────────────────────────────────────────
  function scrollToBottom() {
    setTimeout(function () {
      messages.scrollTop = messages.scrollHeight;
    }, 30);
  }

  // ── Set connection status ──────────────────────────────────────────────────
  function setStatus(online) {
    connected = online;
    if (online) {
      statusDot.className  = '';
      statusText.textContent = 'Online — ready to help';
      sendBtn.disabled     = false;
      errorBanner.classList.remove('visible');
    } else {
      statusDot.className  = 'offline';
      statusText.textContent = 'Reconnecting…';
      sendBtn.disabled     = true;
    }
  }

  // ── Send message ───────────────────────────────────────────────────────────
  function sendMessage() {
    var text = inputEl.value.trim();
    if (!text || !connected) return;

    addMessage(text, 'user');
    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;

    socket.emit('user_message', { text: text });
  }

  // ── Input listeners ────────────────────────────────────────────────────────
  sendBtn.addEventListener('click', sendMessage);

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 80) + 'px';
    sendBtn.disabled = !this.value.trim() || !connected;
  });

  // ── Socket.io connection ───────────────────────────────────────────────────
  function initSocket() {
    // io() auto-connects to the current origin
    try {
      socket = io({
        reconnection:        true,
        reconnectionAttempts: 10,
        reconnectionDelay:   1500,
        reconnectionDelayMax: 8000,
        timeout:             20000,
      });
    } catch (e) {
      console.error('[SciBot] Could not init socket:', e);
      setStatus(false);
      errorBanner.textContent = 'Chat unavailable. Please refresh the page.';
      errorBanner.classList.add('visible');
      return;
    }

    socket.on('connect', function () {
      console.log('[SciBot] Connected:', socket.id);
      setStatus(true);
    });

    socket.on('disconnect', function (reason) {
      console.warn('[SciBot] Disconnected:', reason);
      setStatus(false);
      removeTyping();
    });

    socket.on('connect_error', function (err) {
      console.warn('[SciBot] Connect error:', err.message);
      setStatus(false);
    });

    socket.on('bot_message', function (data) {
      removeTyping();
      sendBtn.disabled = !inputEl.value.trim();
      addMessage(data.text || '...', 'bot');
    });

    socket.on('bot_typing', function (isTyping) {
      if (isTyping) showTyping();
      else removeTyping();
    });
  }

  // Delay socket init slightly so page finishes loading
  setTimeout(initSocket, 300);

})();
