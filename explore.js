var miniBank = [
  {
    cat: "01 — Conceptual Literacy",
    q: "Why are antibiotics ineffective against viral infections like the common cold?",
    opts: [
      "Viruses are too small for antibiotics to reach",
      "Antibiotics target bacterial cell structures absent in viruses",
      "The immune system blocks antibiotics when fighting viruses",
      "Viruses mutate too quickly for antibiotics to work"
    ],
    correct: 1,
    feedback: "Antibiotics work by targeting specific structures found only in bacteria — like cell walls and ribosomes. Since viruses lack these structures entirely, antibiotics have no mechanism to act on them. Using antibiotics for viral infections only contributes to antibiotic resistance."
  },
  {
    cat: "02 — Critical Thinking",
    q: "A study finds that regions with more ice cream sales have higher drowning rates. The best conclusion is:",
    opts: [
      "Ice cream consumption causes drowning",
      "Drowning leads people to eat more ice cream",
      "Hot weather independently increases both ice cream sales and swimming",
      "The sample size is too small to draw any conclusion"
    ],
    correct: 2,
    feedback: "This is a classic confounding variable. Hot weather drives both ice cream sales and swimming activity. This is never causation — a hidden third variable can explain both observations. Always ask: is there something else explaining both?"
  },
  {
    cat: "03 — Scientific Method",
    q: "True or False: A scientific theory is just an educated guess that has not yet been proven.",
    opts: ["True", "False"],
    correct: 1,
    type: "truefalse",
    feedback: "False. In science, a 'theory' is a well-substantiated explanation supported by extensive testing and peer review — not a guess. Germ theory and evolutionary theory are among the best-tested ideas in all of science."
  },
  {
    cat: "04 — Statistical Reasoning",
    q: "A coin is flipped 9 times and lands heads every time. What is the probability of heads on the 10th flip?",
    opts: [
      "Less than 50% — it's 'due' for tails",
      "More than 50% — it's on a streak",
      "Exactly 50% — each flip is independent",
      "Impossible to determine without more data"
    ],
    correct: 2,
    feedback: "This is the gambler's fallacy. A fair coin has no memory. Each flip is an independent event with exactly 50% probability regardless of past outcomes. The streak is surprising but does not change the physics of the next flip."
  },
  {
    cat: "05 — Misinformation Resistance",
    q: "Your friend says: 'I started taking herbal supplements and my cold went away in a week — proof they work!' What is the flaw in this reasoning?",
    opts: [
      "Herbal supplements are illegal and therefore cannot work",
      "Because the cold would likely have resolved on its own — there is no control condition to isolate the supplement's effect",
      "Because your friend is not a scientist and lacks the credentials to evaluate health outcomes",
      "Because supplements are not regulated, so they cannot possibly contain active ingredients"
    ],
    correct: 1,
    type: "reasoning",
    feedback: "This is the post hoc ergo propter hoc fallacy — 'after this, therefore because of this.' Common colds resolve in 5–10 days regardless of treatment. Without a control condition, it is impossible to know whether the supplement did anything."
  }
];

var miniQuestions = (function() {
  var arr = miniBank.slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
})();

var mqIndex   = 0;
var mqScore   = 0;
var mqWrong   = 0;
var mqAnswered = false;

function renderMiniQ() {
  var q = miniQuestions[mqIndex];
  document.getElementById('mq-cat-badge').textContent = q.cat;
  document.getElementById('mq-q-of').textContent = 'Q ' + (mqIndex + 1) + ' / ' + miniQuestions.length;
  document.getElementById('mq-question').textContent = q.q;
  document.getElementById('mq-feedback').className = 'mq-feedback';
  document.getElementById('mq-result-row').className = 'mq-result-row';
  document.getElementById('mq-ring-wrap').style.display = mqIndex > 0 ? 'flex' : 'none';
  document.getElementById('mq-tally').style.display = mqIndex > 0 ? 'flex' : 'none';
  mqAnswered = false;

  
  document.getElementById('mq-score-fill').style.width =
    Math.round((mqIndex / miniQuestions.length) * 100) + '%';

  var opts = document.getElementById('mq-options');
  opts.innerHTML = '';

  var isTF = q.type === 'truefalse';
  var isReason = q.type === 'reasoning';
  opts.style.flexDirection = isTF ? 'row' : 'column';

  q.opts.forEach(function(o, i) {
    var btn = document.createElement('button');
    btn.className = 'mq-option';
    if (isTF) {
      var icon = o === 'True' ? '✓' : '✗';
      var col  = o === 'True' ? '#00e5c3' : '#e05a7a';
      btn.innerHTML = '<span style="font-size:1.2rem;display:block;color:' + col + '">' + icon + '</span>' + o;
      btn.style.textAlign = 'center';
      btn.style.flex = '1';
    } else if (isReason) {
      var labels = ['A','B','C','D'];
      btn.innerHTML = '<span style="color:#00e5c3;font-weight:700;margin-right:0.5rem">' + labels[i] + '.</span>' + o;
    } else {
      btn.textContent = o;
    }
    btn.onclick = function() { miniSelect(i); };
    opts.appendChild(btn);
  });
}

function miniSelect(idx) {
  if (mqAnswered) return;
  mqAnswered = true;

  var q    = miniQuestions[mqIndex];
  var btns = document.getElementById('mq-options').querySelectorAll('.mq-option');
  btns.forEach(function(b) { b.disabled = true; });

  if (idx === q.correct) {
    btns[idx].classList.add('correct');
    mqScore++;
  } else {
    btns[idx].classList.add('incorrect');
    mqWrong++;
  }
  btns[q.correct].classList.add('correct');

  
  var fb = document.getElementById('mq-feedback');
  fb.textContent = q.feedback;
  fb.className = 'mq-feedback show';

  
  var rr = document.getElementById('mq-result-row');
  rr.className = 'mq-result-row show';

  var rtxt = document.getElementById('mq-result-text');
  if (idx === q.correct) {
    rtxt.innerHTML = '✓ Correct! Running score: <span>' + mqScore + ' / ' + (mqIndex + 1) + '</span>';
    rtxt.style.color = '#5ae0a2';
  } else {
    rtxt.innerHTML = '✗ Incorrect. Running score: <span>' + mqScore + ' / ' + (mqIndex + 1) + '</span>';
    rtxt.style.color = '#e05a7a';
  }

  
  if (mqIndex === miniQuestions.length - 1) {
    document.getElementById('mq-next-btn').textContent = 'See Result →';
    document.getElementById('mq-next-btn').onclick = miniFinish;
  }

  
  updateMiniRing();
  updateMiniTally();

  document.getElementById('mq-ring-wrap').style.display = 'flex';
  document.getElementById('mq-tally').style.display = 'flex';
}

function updateMiniRing() {
  var total   = miniQuestions.length;
  var circ    = 201;
  var offset  = circ - (circ * (mqScore / total));
  document.getElementById('mq-ring-circle').style.strokeDashoffset = offset;
  document.getElementById('mq-ring-score').textContent = mqScore;
  document.getElementById('mq-ring-total').textContent = total;
}

function updateMiniTally() {
  var pct = mqIndex > -1 ? Math.round((mqScore / (mqIndex + 1)) * 100) : 0;
  document.getElementById('tally-correct').textContent = mqScore;
  document.getElementById('tally-wrong').textContent   = mqWrong;
  document.getElementById('tally-pct').textContent     = pct + '%';
}

function miniNextQ() {
  mqIndex++;
  if (mqIndex >= miniQuestions.length) { miniFinish(); return; }
  renderMiniQ();
}

function miniFinish() {
  document.querySelector('.mini-quiz-card').style.display = 'none';
  var fin = document.getElementById('mq-final');
  fin.style.display = 'block';
  document.getElementById('mq-final-score').textContent = mqScore + ' / ' + miniQuestions.length;
  var levels = ['Novice','Curious','Informed','Analytical','Scientific'];
  var lvl = levels[Math.min(mqScore, levels.length - 1)];
  document.getElementById('mq-final-level').textContent =
    'Temper Level: ' + lvl + ' — Complete the full assessment for your real profile.';
}

function miniReset() {
  mqIndex = 0; mqScore = 0; mqWrong = 0; mqAnswered = false;
  // Reshuffle
  for (var i = miniQuestions.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = miniQuestions[i]; miniQuestions[i] = miniQuestions[j]; miniQuestions[j] = t;
  }
  document.querySelector('.mini-quiz-card').style.display = 'block';
  document.getElementById('mq-final').style.display = 'none';
  document.getElementById('mq-score-fill').style.width = '0%';
  document.getElementById('mq-ring-circle').style.strokeDashoffset = '201';
  document.getElementById('mq-next-btn').textContent = 'Next Question →';
  document.getElementById('mq-next-btn').onclick = miniNextQ;
  renderMiniQ();
}


renderMiniQ();

var dims = [
  { label: 'Conceptual',   val: 20, color: '#00e5c3' },
  { label: 'Critical',     val: 15, color: '#5ae0a2' },
  { label: 'Statistical',  val: 10, color: '#f7c35f' },
  { label: 'Method',       val: 25, color: '#00e5c3' }, 
  { label: 'Society',      val: 18, color: '#5ae0a2' },
  { label: 'Skepticism',   val: 12, color: '#f7c35f' }
];

function renderDimBars() {
  var container = document.getElementById('profile-dims');
  container.innerHTML = '';
  dims.forEach(function(d, i) {
    var row = document.createElement('div');
    row.className = 'profile-dim-row';
    row.innerHTML =
      '<div class="profile-dim-label">' + d.label + '</div>' +
      '<div class="profile-dim-bar"><div class="profile-dim-fill" id="dim-fill-' + i + '"></div></div>' +
      '<div class="profile-dim-val" id="dim-val-' + i + '">' + d.val + '%</div>';
    container.appendChild(row);
    setTimeout(function(idx){ return function() {
      document.getElementById('dim-fill-' + idx).style.width = dims[idx].val + '%';
    }; }(i), 100 + i * 80);
  });
}


var CENTER = 160, RINGS = [140, 105, 70, 35];

function getPoint(axisIdx, pct) {
  
  var angles = [-90, -30, 30, 90, 150, 210];
  var rad    = angles[axisIdx] * Math.PI / 180;
  var r      = (pct / 100) * RINGS[0];
  return (CENTER + r * Math.cos(rad)) + ',' + (CENTER + r * Math.sin(rad));
}

function updateRadar() {
  var pts = dims.map(function(d, i) { return getPoint(i, d.val); }).join(' ');
  document.getElementById('radar-poly').setAttribute('points', pts);
}

function simulateProfile() {
  dims = dims.map(function(d) {
    var newVal = Math.min(95, d.val + Math.floor(Math.random() * 30) + 10);
    return { label: d.label, val: newVal, color: d.color };
  });
  renderDimBars();
  updateRadar();
}

renderDimBars();
updateRadar();

var myths = [
  {
    myth: "We only use 10% of our brains.",
    fact: "Brain imaging studies show we use virtually all parts of the brain, and most of the brain is active almost all the time. Different regions handle different functions, and damage to almost any area has consequences. This myth likely originated from misquoted psychology research."
  },
  {
    myth: "Lightning never strikes the same place twice.",
    fact: "Lightning frequently strikes the same place multiple times. The Empire State Building is struck around 25 times per year. Lightning rods work precisely because tall conductive structures are repeatedly targeted by the same storm."
  },
  {
    myth: "Humans evolved from chimpanzees.",
    fact: "Humans and chimpanzees share a common ancestor — we did not descend from chimps. Both species evolved along different branches from that shared ancestor roughly 6–7 million years ago. Chimps are our closest living relatives, not our predecessors."
  },
  {
    myth: "Sugar makes children hyperactive.",
    fact: "Multiple double-blind studies have found no link between sugar consumption and hyperactivity in children. The effect is largely driven by expectation bias — parents who believed their children consumed sugar rated them as more hyperactive even when they had not."
  },
  {
    myth: "Vaccines cause autism.",
    fact: "The 1998 study claiming this link was retracted after investigators discovered the lead author had falsified data. Dozens of large-scale independent studies covering millions of children worldwide have found no connection between vaccines and autism."
  },
  {
    myth: "Seasons are caused by Earth's varying distance from the Sun.",
    fact: "Seasons are caused by Earth's axial tilt (~23.5°), not distance. The Northern Hemisphere actually experiences winter when Earth is slightly closer to the Sun. What matters is the angle of sunlight, which determines how concentrated the energy is per unit area."
  }
];

function buildMythGrid() {
  var grid = document.getElementById('myth-grid');
  myths.forEach(function(m, i) {
    var card = document.createElement('div');
    card.className = 'myth-card';
    card.innerHTML =
      '<div class="myth-top" onclick="toggleMyth(' + i + ')">' +
        '<div class="myth-label">Myth</div>' +
        '<div class="myth-text">' + m.myth + '</div>' +
        '<button class="myth-reveal-btn" id="myth-btn-' + i + '">Reveal Fact ↓</button>' +
      '</div>' +
      '<div class="myth-fact-panel" id="myth-panel-' + i + '">' +
        '<div class="fact-header">✓ Scientific Fact</div>' +
        m.fact +
      '</div>';
    grid.appendChild(card);
  });
}

function toggleMyth(i) {
  var panel = document.getElementById('myth-panel-' + i);
  var btn   = document.getElementById('myth-btn-' + i);
  var isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  btn.textContent = isOpen ? 'Reveal Fact ↓' : 'Hide ↑';
}

buildMythGrid();

var aiChips = [
  "Why is evolution a theory not a fact?",
  "What is p-hacking?",
  "How does peer review work?",
  "What is confirmation bias?",
  "Why do vaccines need boosters?",
  "What is Occam's Razor?"
];

var staticExplanations = {
  "why is evolution a theory not a fact?": "In science, a theory is the highest level of explanation — it means a well-tested, evidence-backed framework, not a guess. Evolution is called a theory because it explains a vast body of observed facts using genetics, fossils, and direct observation. Calling it 'just a theory' misunderstands how science uses the word.",
  "what is p-hacking?": "P-hacking is when researchers manipulate their data analysis — trying many different tests or subgroups — until they get a statistically significant result. It inflates false positives and makes random noise look like a real finding. It's a major reason why many published studies fail to replicate.",
  "how does peer review work?": "When a scientist submits a paper, the journal sends it to 2-3 independent experts in that field who evaluate the methods, data, and conclusions. These reviewers recommend acceptance, revisions, or rejection without knowing each other's identities. It's science's quality-control filter, though it's not perfect.",
  "what is confirmation bias?": "Confirmation bias is our tendency to search for, notice, and remember information that supports what we already believe. It causes us to unconsciously ignore or dismiss evidence that contradicts our existing views. It's one of the most powerful cognitive biases and affects scientists and non-scientists alike.",
  "why do vaccines need boosters?": "Immunity from vaccines fades over time as the body's antibody levels decline. Some viruses like influenza also mutate rapidly, making last year's vaccine less effective against new strains. Boosters either refresh waning immunity or update protection against evolved variants.",
  "what is occam's razor?": "Occam's Razor is the principle that, when two explanations fit the evidence equally well, the simpler one is preferable. It doesn't mean the simplest answer is always right, but that unnecessary complexity should not be added without evidence. Scientists use it as a guide to avoid over-complicated hypotheses."
};

// API key : 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.

function buildAIChips() {
  var container = document.getElementById('ai-chips');
  aiChips.forEach(function(chip) {
    var btn = document.createElement('button');
    btn.className = 'ai-chip';
    btn.textContent = chip;
    btn.onclick = function() {
      document.getElementById('ai-input').value = chip;
      askAI();
    };
    container.appendChild(btn);
  });
}
buildAIChips();

document.getElementById('ai-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') askAI();
});

function askAI() {
  var input   = document.getElementById('ai-input');
  var box     = document.getElementById('ai-response');
  var askBtn  = document.getElementById('ai-ask-btn');
  var question = input.value.trim();
  if (!question) return;

  askBtn.disabled = true;
  askBtn.textContent = 'Thinking…';
  box.innerHTML = '<span class="ai-cursor"></span>';

  var key = question.toLowerCase();
  var text = staticExplanations[key]
    || "No explanation found for that question. Try one of the suggested topics above.";

  setTimeout(function() {
    box.innerHTML = '';
    var cursor = document.createElement('span');
    cursor.className = 'ai-cursor';
    var i = 0;
    var interval = setInterval(function() {
      if (i < text.length) {
        box.textContent += text[i++];
        box.appendChild(cursor);
        box.scrollTop = box.scrollHeight;
      } else {
        clearInterval(interval);
        cursor.remove();
      }
    }, 18);
    askBtn.disabled = false;
    askBtn.textContent = 'Explain →';
  }, 400);
}

function checkLoginAndProceed(event) {
  event.preventDefault();
  if (sessionStorage.getItem("isLoggedIn") === "true") {
    window.location.href = "quiz.html";
  } else {
    alert("Please Login To Take Assessment");
    window.location.href = "login-page.html";
  }
}

function scrollTo(id) {
  var el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });  
  document.querySelectorAll('.fnav-pill').forEach(function(p) { p.classList.remove('active'); });
  event.target.classList.add('active');
}