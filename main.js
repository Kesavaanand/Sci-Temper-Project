// ─── State ────────────────────────────────────────────────────────────────────
var questions = [];
var currentQ  = 0;
var score     = 0;
var answered  = false;
var answers   = [];
var userLevel = -1;

// ─── Temper Level Data ────────────────────────────────────────────────────────
var temperData = [
  {
    title: "Novice — Emerging Awareness",
    color: "#e05a7a",
    desc:  "You're beginning to engage with science. You may hold some misconceptions and find it hard to distinguish scientific consensus from fringe claims. This is the perfect starting point — curiosity is already there."
  },
  {
    title: "Curious — Building Foundation",
    color: "#e09a5a",
    desc:  "You have a genuine interest in science and can grasp basic concepts. You sometimes confuse correlation with causation and struggle with statistical arguments. You're ready to develop deeper analytical skills."
  },
  {
    title: "Informed — Competent Literacy",
    color: "#f7c35f",
    desc:  "You understand scientific principles and can follow scientific reporting. You identify some logical fallacies and are resistant to obvious misinformation. Strengthening your systematic reasoning will unlock the next level."
  },
  {
    title: "Analytical — Evidence-Based Reasoner",
    color: "#5ae0a2",
    desc:  "You reason systematically from evidence, understand experimental design, and can evaluate statistical claims. You're resistant to pseudoscience and misinformation. Focus on nuanced areas: risk communication and interdisciplinary thinking."
  },
  {
    title: "Scientific — Deep Temper",
    color: "#00e5c3",
    desc:  "You embody scientific temper as envisioned in India's Constitution: you approach all claims with evidence-based scepticism, understand the provisional nature of knowledge, and model rigorous thinking in all domains."
  }
];

// ─── Master Question Bank (30 questions, 6 per category) ─────────────────────
// correctText stores the answer string so option-shuffling stays correct.
var questionBank = [

  // ── 01 Conceptual Literacy ────────────────────────────────────────────────
  {
    category: "01 — Conceptual Literacy",
    text: "Why are antibiotics ineffective against viral infections like the common cold?",
    options: ["Viruses are too small for antibiotics to reach", "Antibiotics target bacterial cell structures absent in viruses", "The immune system blocks antibiotics when fighting viruses", "Viruses mutate too quickly for antibiotics to work"],
    correctText: "Antibiotics target bacterial cell structures absent in viruses",
    feedback: "Antibiotics work by targeting specific structures found only in bacteria — like cell walls, ribosomes, or DNA replication enzymes. Since viruses lack these structures entirely, antibiotics have no mechanism to act on them."
  },
  {
    category: "01 — Conceptual Literacy",
    text: "What is the primary reason the sky appears blue during the day?",
    options: ["The ocean reflects blue light upward into the atmosphere", "Oxygen molecules absorb all colours except blue", "Short-wavelength blue light scatters more than longer wavelengths in the atmosphere", "The sun emits mostly blue light during daylight hours"],
    correctText: "Short-wavelength blue light scatters more than longer wavelengths in the atmosphere",
    feedback: "Rayleigh scattering causes shorter (blue) wavelengths of sunlight to scatter in all directions far more than longer (red/yellow) wavelengths. This scattered blue light reaches our eyes from every direction in the sky."
  },
  {
    category: "01 — Conceptual Literacy",
    text: "Which statement best describes the role of DNA in a living cell?",
    options: ["DNA directly builds proteins by attaching amino acids together", "DNA stores genetic instructions that guide the synthesis of proteins via RNA", "DNA acts as the cell's energy currency, storing and releasing ATP", "DNA controls cell division by physically separating chromosomes"],
    correctText: "DNA stores genetic instructions that guide the synthesis of proteins via RNA",
    feedback: "DNA contains genes — sequences of nucleotides that encode instructions for making proteins. These instructions are transcribed into mRNA, which is then translated into proteins by ribosomes."
  },
  {
    category: "01 — Conceptual Literacy",
    text: "What causes seasons on Earth?",
    options: ["Earth's varying distance from the Sun during its elliptical orbit", "The tilt of Earth's axis relative to its orbital plane", "Changes in the Sun's energy output throughout the year", "The Moon's gravitational pull shifting Earth closer to the Sun"],
    correctText: "The tilt of Earth's axis relative to its orbital plane",
    feedback: "Earth's axis is tilted about 23.5°. Different hemispheres receive more direct sunlight at different points in the orbit, creating summer and winter. Earth is actually slightly closer to the Sun during the Northern Hemisphere's winter."
  },
  {
    category: "01 — Conceptual Literacy",
    text: "Which of the following is NOT a product of photosynthesis?",
    options: ["Glucose", "Oxygen", "Carbon dioxide", "Water vapour released as a byproduct"],
    correctText: "Carbon dioxide",
    feedback: "Photosynthesis consumes CO₂ and water, using sunlight to produce glucose and oxygen. Carbon dioxide is a reactant, not a product — plants take it in from the atmosphere through tiny pores called stomata."
  },
  {
    category: "01 — Conceptual Literacy",
    text: "What does it mean when scientists say a medication passed a double-blind randomised controlled trial?",
    options: ["The drug was tested on both humans and animals", "Neither participants nor researchers knew who received the drug or placebo", "The drug was tested twice in two different countries", "The trial was reviewed by two independent scientific committees"],
    correctText: "Neither participants nor researchers knew who received the drug or placebo",
    feedback: "In a double-blind trial, neither participants nor researchers know who is in the treatment or control group. This eliminates expectation bias and observer bias, making results far more reliable."
  },

  // ── 02 Critical Thinking ─────────────────────────────────────────────────
  {
    category: "02 — Critical Thinking",
    text: "A study finds that regions with more ice cream sales have higher drowning rates. The best conclusion is:",
    options: ["Ice cream consumption causes drowning", "Drowning leads people to eat more ice cream", "Hot weather independently increases both ice cream sales and swimming", "The sample size is too small to draw any conclusion"],
    correctText: "Hot weather independently increases both ice cream sales and swimming",
    feedback: "This is a classic confounding variable example. Hot weather drives both ice cream sales and swimming activity. Correlation never implies causation — a hidden third variable can explain both observations simultaneously."
  },
  {
    category: "02 — Critical Thinking",
    text: "A friend argues: 'My grandfather smoked all his life and lived to 95, so smoking can't be that harmful.' What logical error is this?",
    options: ["False dichotomy", "Anecdotal evidence fallacy", "Circular reasoning", "Appeal to authority"],
    correctText: "Anecdotal evidence fallacy",
    feedback: "Relying on a single personal story to contradict large-scale statistical evidence is the anecdotal fallacy. Population-level data from millions of people is far more reliable than any individual case, however striking."
  },
  {
    category: "02 — Critical Thinking",
    text: "An advertisement claims: '8 out of 10 dentists recommend BrightSmile.' What is the most important question to ask?",
    options: ["Which country were the dentists from?", "How many dentists were surveyed and what exactly were they asked?", "Is BrightSmile more expensive than competitors?", "Were the dentists paid to give their recommendation?"],
    correctText: "How many dentists were surveyed and what exactly were they asked?",
    feedback: "Statistical claims require context. '8 out of 10' could mean just 10 dentists surveyed — far too small a sample. The exact question asked also matters enormously in interpreting the statistic."
  },
  {
    category: "02 — Critical Thinking",
    text: "Which of the following is the strongest form of scientific evidence?",
    options: ["A single high-quality experiment with surprising results", "A meta-analysis of many well-designed randomised controlled trials", "An expert's opinion published in a popular science magazine", "Multiple anecdotes consistent with each other"],
    correctText: "A meta-analysis of many well-designed randomised controlled trials",
    feedback: "A meta-analysis statistically combines results from multiple high-quality studies, dramatically increasing statistical power and reducing the chance of a fluke result. It sits at the top of the evidence hierarchy."
  },
  {
    category: "02 — Critical Thinking",
    text: "'Absence of evidence is not evidence of absence' means:",
    options: ["If something hasn't been disproven, it must be true", "Failing to find evidence for X doesn't prove X doesn't exist — the search may be incomplete", "Scientists should never conclude that something is false", "All claims deserve equal consideration until proven otherwise"],
    correctText: "Failing to find evidence for X doesn't prove X doesn't exist — the search may be incomplete",
    feedback: "A lack of evidence may reflect limitations in methods or search, not the non-existence of the thing. However, it also doesn't mean unproven claims should be accepted — it calls for epistemic humility, not credulity."
  },
  {
    category: "02 — Critical Thinking",
    text: "A news headline reads: 'Coffee drinkers live longer!' The underlying study shows only a correlation. What should you conclude?",
    options: ["Drinking coffee causes longer life", "Coffee drinkers share other healthy habits that explain longevity", "There may be an association worth investigating, but causation is not established", "Coffee should be recommended as a health supplement"],
    correctText: "There may be an association worth investigating, but causation is not established",
    feedback: "Observational correlations are hypothesis-generating, not hypothesis-confirming. Establishing causation requires controlled experiments and ruling out confounders like diet, exercise, and socioeconomic status."
  },

  // ── 03 Scientific Method ─────────────────────────────────────────────────
  {
    category: "03 — Scientific Method",
    text: "A scientist observes data that contradicts her hypothesis. What is the most appropriate next step?",
    options: ["Ignore the anomalous data as experimental error", "Revise or replace the hypothesis to account for all observations", "Run more experiments until data supports the original hypothesis", "Publish results that exclude the contradictory observation"],
    correctText: "Revise or replace the hypothesis to account for all observations",
    feedback: "Science is self-correcting. When evidence contradicts a hypothesis, the hypothesis must be revised or replaced — not the evidence ignored. This is the essence of Popper's falsifiability principle and scientific integrity."
  },
  {
    category: "03 — Scientific Method",
    text: "What is the primary purpose of a control group in an experiment?",
    options: ["To ensure all participants follow the same instructions", "To provide a baseline for comparison so the effect of the variable can be isolated", "To control the experimenter's personal bias during data collection", "To limit the number of variables tested in a single experiment"],
    correctText: "To provide a baseline for comparison so the effect of the variable can be isolated",
    feedback: "A control group experiences everything the experimental group does except the variable being tested. Without this baseline, you cannot know whether observed changes are due to the intervention or other factors."
  },
  {
    category: "03 — Scientific Method",
    text: "Why is peer review important in science?",
    options: ["It guarantees all published findings are correct", "It allows other experts to identify errors, biases, and flaws before publication", "It ensures the government approves of research findings", "It prevents scientists from publishing results too quickly"],
    correctText: "It allows other experts to identify errors, biases, and flaws before publication",
    feedback: "Peer review is a quality-control mechanism where independent experts scrutinise methodology, data, and conclusions. It doesn't guarantee truth, but it significantly filters poor-quality work before publication."
  },
  {
    category: "03 — Scientific Method",
    text: "What does it mean for a scientific theory to be 'falsifiable'?",
    options: ["The theory has already been proven false", "The theory can potentially be disproven by an experiment or observation", "The theory is uncertain and likely wrong", "The theory was developed by falsifying earlier data"],
    correctText: "The theory can potentially be disproven by an experiment or observation",
    feedback: "Falsifiability, proposed by Karl Popper, is a cornerstone of science. A claim must make specific, testable predictions that could in principle be proven wrong. This is what separates science from pseudoscience."
  },
  {
    category: "03 — Scientific Method",
    text: "Why do scientists value replication of experiments by independent researchers?",
    options: ["To waste time and prove the original scientist wrong", "To confirm results are reliable and not due to chance, fraud, or lab-specific errors", "Because scientific laws require at least three experiments to be valid", "To allow the original scientist to patent their discovery first"],
    correctText: "To confirm results are reliable and not due to chance, fraud, or lab-specific errors",
    feedback: "A single result could be a fluke, measurement error, or even fraud. Independent replication by different teams using different equipment is how science builds genuine confidence in findings."
  },
  {
    category: "03 — Scientific Method",
    text: "What distinguishes a scientific theory from a hypothesis?",
    options: ["A theory is just a guess; a hypothesis is a proven fact", "A theory has been repeatedly tested and supported by substantial evidence; a hypothesis is an initial testable prediction", "A theory is proposed by senior scientists; a hypothesis by students", "There is no difference — the terms are interchangeable in science"],
    correctText: "A theory has been repeatedly tested and supported by substantial evidence; a hypothesis is an initial testable prediction",
    feedback: "In everyday language 'theory' means a guess, but in science it means a well-substantiated explanatory framework. Germ theory, evolutionary theory, and gravitational theory are among the best-supported ideas in all of science."
  },

  // ── 04 Statistical Reasoning ─────────────────────────────────────────────
  {
    category: "04 — Statistical Reasoning",
    text: "A new drug 'doubles the risk' of a rare side effect. The baseline risk is 1 in 100,000. Your actual risk with the drug is:",
    options: ["50% chance of the side effect", "2 in 100,000 — still extremely low", "The drug is definitely dangerous and should be avoided", "Cannot be determined without more data"],
    correctText: "2 in 100,000 — still extremely low",
    feedback: "Relative risk ('doubles the risk') sounds alarming but must be paired with absolute risk. Going from 1 to 2 in 100,000 is a 100% relative increase but only a 0.001% absolute increase. Always consider both when making medical decisions."
  },
  {
    category: "04 — Statistical Reasoning",
    text: "A coin is flipped 9 times and lands heads every time. What is the probability of heads on the 10th flip?",
    options: ["Less than 50% — it's 'due' for tails", "More than 50% — it's on a streak", "Exactly 50% — each flip is independent", "Impossible to determine without more data"],
    correctText: "Exactly 50% — each flip is independent",
    feedback: "This is the gambler's fallacy. A fair coin has no memory. Each flip is an independent event with a 50% probability regardless of past outcomes. The streak is surprising but does not change the physics of the next flip."
  },
  {
    category: "04 — Statistical Reasoning",
    text: "A study has a p-value of 0.03. This means:",
    options: ["There is a 3% chance the hypothesis is true", "There is a 97% chance the result is not due to chance", "If the null hypothesis were true, there is a 3% chance of seeing a result this extreme", "The effect size is large and practically significant"],
    correctText: "If the null hypothesis were true, there is a 3% chance of seeing a result this extreme",
    feedback: "A p-value does not measure the probability that your hypothesis is true. It measures how surprising your data would be if there were no real effect. A small p-value suggests the data are inconsistent with the null hypothesis — but says nothing about practical importance."
  },
  {
    category: "04 — Statistical Reasoning",
    text: "A hospital's surgery survival rate improved from 90% to 95%. Which statement is most accurate?",
    options: ["It improved by 5 percentage points — nothing more", "It improved by 50% relatively — death risk halved from 10% to 5%", "It improved by 5 percentage points (absolute) and 50% relatively — both are valid descriptions", "Only the relative improvement matters in a clinical context"],
    correctText: "It improved by 5 percentage points (absolute) and 50% relatively — both are valid descriptions",
    feedback: "Absolute improvement: 5 percentage points. Relative improvement: failures dropped from 10% to 5% — a 50% reduction. Both are mathematically correct. Context determines which framing is most informative."
  },
  {
    category: "04 — Statistical Reasoning",
    text: "Which best illustrates 'survivorship bias'?",
    options: ["Studying only returned warplanes to decide where to add armour", "Tracking only trial completers while ignoring dropouts", "Analysing only successful companies to find what makes businesses thrive", "All of the above"],
    correctText: "All of the above",
    feedback: "Survivorship bias occurs whenever we analyse only 'survivors' — those who passed a filter — ignoring those who did not. It distorts armour design, clinical trials, and business strategy in identical ways."
  },
  {
    category: "04 — Statistical Reasoning",
    text: "A poll of 50 people shows 60% prefer Brand X. Another poll of 5,000 shows 55% prefer Brand X. Which result is more reliable?",
    options: ["The first poll — the percentage is higher", "The second poll — larger sample gives a narrower margin of error", "Both are equally reliable since they both use percentages", "Neither — all polls are biased"],
    correctText: "The second poll — larger sample gives a narrower margin of error",
    feedback: "With n=50 the margin of error is roughly ±14%; with n=5,000 it narrows to about ±1.4%. The second poll's 55% estimate is far more precise and reliable even though the percentage is slightly lower."
  },

  // ── 05 Misinformation Resistance ─────────────────────────────────────────
  {
    category: "05 — Misinformation Resistance",
    text: "A viral post claims '97% of scientists disagree with mainstream climate science.' The scientifically literate response is:",
    options: ["Share the post since it challenges official narratives", "Verify the claim — multiple independent studies show ~97% of climate scientists agree on human-caused warming", "Accept it because scientists are often suppressed", "Remain agnostic since science is always uncertain"],
    correctText: "Verify the claim — multiple independent studies show ~97% of climate scientists agree on human-caused warming",
    feedback: "The opposite is true. Multiple independent analyses show ~97% of actively publishing climate scientists agree that climate change is human-caused. Verifying extraordinary claims against primary sources is the hallmark of scientific temper."
  },
  {
    category: "05 — Misinformation Resistance",
    text: "Which feature is most characteristic of pseudoscience?",
    options: ["Makes testable predictions that could be proven wrong", "Updates its claims when confronted with contradicting evidence", "Claims are unfalsifiable and immune to disconfirmation", "Relies on peer-reviewed studies for support"],
    correctText: "Claims are unfalsifiable and immune to disconfirmation",
    feedback: "Pseudoscience insulates itself from refutation — any contradicting evidence is reinterpreted as confirmation or dismissed. Real science makes precise, risky predictions that could be falsified."
  },
  {
    category: "05 — Misinformation Resistance",
    text: "A friend shares an article citing one study of 20 people recommending you avoid a common food. You should:",
    options: ["Follow the advice immediately — any study is better than none", "Be cautious: a single small study is preliminary, not a proven health guideline", "Dismiss it entirely — small studies are worthless", "Share it widely to warn others"],
    correctText: "Be cautious: a single small study is preliminary, not a proven health guideline",
    feedback: "A small single study is the beginning of scientific inquiry, not the end. Nutritional guidelines require replication across many studies and diverse populations. Reacting to every small study creates unnecessary anxiety."
  },
  {
    category: "05 — Misinformation Resistance",
    text: "The 1998 study claiming vaccines cause autism was eventually:",
    options: ["Confirmed by 10 subsequent larger studies", "Retracted after fraud was discovered — the lead author had falsified data", "Still considered preliminary but valid by most scientists", "Suppressed by pharmaceutical companies without investigation"],
    correctText: "Retracted after fraud was discovered — the lead author had falsified data",
    feedback: "Andrew Wakefield's 1998 Lancet paper was fully retracted in 2010 after investigators found he had manipulated data and had undisclosed financial conflicts of interest. Dozens of large independent studies involving millions of children have found no link between vaccines and autism."
  },
  {
    category: "05 — Misinformation Resistance",
    text: "Which is the most reliable indicator that a health website is trustworthy?",
    options: ["The website has many testimonials from satisfied users", "The site cites peer-reviewed studies and identifies its authors and funding", "The website has a professional design and logo", "The content agrees with what you already believe about health"],
    correctText: "The site cites peer-reviewed studies and identifies its authors and funding",
    feedback: "Reliable health information is transparent about its sources, authors, and funding. Testimonials exploit the anecdotal fallacy. Professional design signals marketing budget, not accuracy. Agreement with existing beliefs is a cognitive bias, not quality evidence."
  },
  {
    category: "05 — Misinformation Resistance",
    text: "Someone says: 'Natural remedies are always safer than synthetic drugs because they're natural.' This is flawed because:",
    options: ["Synthetic drugs are always better than natural ones", "The natural/synthetic distinction says nothing about safety — many natural substances are deadly", "Natural remedies have not been studied enough to make any claims", "Only doctors can determine whether something is safe"],
    correctText: "The natural/synthetic distinction says nothing about safety — many natural substances are deadly",
    feedback: "This is the 'appeal to nature' fallacy. Arsenic, cyanide, and botulinum toxin are entirely natural and extremely dangerous. Aspirin and penicillin are synthetic and have saved millions of lives. Safety is determined by chemistry and dosage, not origin."
  }
];

// ─── True / False question bank ───────────────────────────────────────────────
var trueFalseBank = [
  {
    category: "03 — Scientific Method",
    type: "truefalse",
    text: "True or False: A scientific theory is just an educated guess that has not yet been proven.",
    correctText: "False",
    feedback: "False. In science, a 'theory' is not a guess — it is a well-substantiated explanation supported by extensive evidence, testing, and peer review. Examples include germ theory and evolutionary theory. The everyday meaning of 'theory' is very different from its scientific meaning."
  },
  {
    category: "03 — Scientific Method",
    type: "truefalse",
    text: "True or False: Peer review guarantees that a published scientific finding is completely correct and free from error.",
    correctText: "False",
    feedback: "False. Peer review is a quality filter, not a guarantee of truth. Reviewers can miss errors, and some flawed or even fraudulent studies pass review. That is why replication by independent researchers is equally important."
  },
  {
    category: "03 — Scientific Method",
    type: "truefalse",
    text: "True or False: If an experiment's results cannot be replicated by another independent lab, that is a serious problem for the original claim.",
    correctText: "True",
    feedback: "True. Replication is a cornerstone of science. A result that cannot be reproduced by independent researchers may be a fluke, a measurement error, or the result of uncontrolled variables. Reliable scientific knowledge must hold up across multiple independent tests."
  },
  {
    category: "03 — Scientific Method",
    type: "truefalse",
    text: "True or False: A hypothesis must be falsifiable — meaning there must be a possible observation that could prove it wrong.",
    correctText: "True",
    feedback: "True. Karl Popper identified falsifiability as the key criterion separating science from non-science. If no possible evidence could ever contradict a claim, it is not a scientific claim. Unfalsifiable ideas belong to philosophy or faith, not empirical science."
  },
  {
    category: "03 — Scientific Method",
    type: "truefalse",
    text: "True or False: In a well-designed experiment, the control group receives the same treatment as the experimental group.",
    correctText: "False",
    feedback: "False. The control group does NOT receive the treatment being tested — that is precisely the point. It provides a baseline so researchers can isolate and measure only the effect of the variable being studied. Without a control group, any observed changes cannot be attributed to the intervention."
  },
  {
    category: "03 — Scientific Method",
    type: "truefalse",
    text: "True or False: The placebo effect demonstrates that believing you are receiving treatment can produce real, measurable physiological changes.",
    correctText: "True",
    feedback: "True. The placebo effect is a well-documented phenomenon where patients who believe they are receiving treatment show genuine measurable improvements — changes in brain chemistry, pain perception, and even some immune responses. This is why blinding participants in clinical trials is essential."
  }
];

// ─── Reasoning question bank ──────────────────────────────────────────────────
var reasoningBank = [
  {
    category: "05 — Misinformation Resistance",
    type: "reasoning",
    text: "A social media post claims: 'Vaccines contain dangerous toxins and should be avoided.' Which reasoning correctly identifies why this claim is misleading?",
    options: [
      "Because the government says vaccines are safe, we should trust them without question",
      "Because 'toxins' is vague — almost any substance is harmful at a high enough dose, and vaccine ingredient amounts are far below harmful thresholds",
      "Because the person posting this is not a doctor, their opinion doesn't count",
      "Because vaccines have been around for decades, they must be safe by now"
    ],
    correctText: "Because 'toxins' is vague — almost any substance is harmful at a high enough dose, and vaccine ingredient amounts are far below harmful thresholds",
    feedback: "The word 'toxins' is a red flag in misinformation. Dose makes the poison — water is fatal in large enough quantities. Vaccine ingredients like aluminium salts are present in microgram amounts, far below any threshold of harm. Scientific literacy requires asking not just 'what' but 'how much?'"
  },
  {
    category: "05 — Misinformation Resistance",
    type: "reasoning",
    text: "A headline reads: 'Scientists Admit They Were Wrong About Coffee — It Causes Cancer!' Why is this headline likely misleading?",
    options: [
      "Because scientists are always changing their minds and cannot be trusted",
      "Because a single study or updated finding is often dramatised — one result rarely overturns a large body of consistent evidence, and context about risk magnitude is missing",
      "Because coffee companies funded all prior research showing coffee is safe",
      "Because cancer is too complex to be studied scientifically"
    ],
    correctText: "Because a single study or updated finding is often dramatised — one result rarely overturns a large body of consistent evidence, and context about risk magnitude is missing",
    feedback: "Science headlines routinely exaggerate. A single new study does not overturn decades of consistent evidence. Additionally, 'causes cancer' without stating the actual risk magnitude (e.g., going from 0.001% to 0.002% risk) is meaningless and designed to alarm rather than inform."
  },
  {
    category: "05 — Misinformation Resistance",
    type: "reasoning",
    text: "Your friend says: 'I started taking herbal supplements and my cold went away in a week — proof they work!' What is the flaw in this reasoning?",
    options: [
      "Herbal supplements are illegal and therefore cannot work",
      "Because the cold would likely have resolved on its own in the same timeframe — there is no control condition to isolate the supplement's effect",
      "Because your friend is not a scientist and lacks the credentials to evaluate health outcomes",
      "Because supplements are not regulated, so they cannot possibly contain active ingredients"
    ],
    correctText: "Because the cold would likely have resolved on its own in the same timeframe — there is no control condition to isolate the supplement's effect",
    feedback: "This is the classic post hoc ergo propter hoc fallacy — 'after this, therefore because of this.' Common colds resolve in 5–10 days regardless of treatment. Without a control condition (taking nothing), it is impossible to know whether the supplement did anything. Personal experience, while real, cannot establish causation."
  },
  {
    category: "05 — Misinformation Resistance",
    type: "reasoning",
    text: "A wellness influencer claims their detox programme 'cleanses your liver of toxins.' Why do scientists reject this claim?",
    options: [
      "Because the liver is a vital organ and should never be discussed publicly",
      "Because the claim uses vague, unverified language — the liver continuously filters the blood, and no specific 'toxins' removed by the programme are ever identified or measured",
      "Because all detox programmes are illegal in most countries",
      "Because the influencer has not conducted double-blind trials personally"
    ],
    correctText: "Because the claim uses vague, unverified language — the liver continuously filters the blood, and no specific 'toxins' removed by the programme are ever identified or measured",
    feedback: "The word 'toxins' in wellness marketing is almost always meaningless. If something genuinely toxic accumulates in your body, you need medical intervention, not a juice cleanse. The liver already performs continuous detoxification. Legitimate health claims name specific substances and provide measurable evidence of change."
  },
  {
    category: "05 — Misinformation Resistance",
    type: "reasoning",
    text: "A conspiracy theory claims that climate change is a hoax invented by scientists for grant money. Which reasoning best explains why this claim does not hold up?",
    options: [
      "Because scientists are always honest and never make mistakes",
      "Because the evidence for climate change comes from thousands of independent scientists across competing institutions and nations — a coordinated hoax at that scale is implausible, and the physical data (sea levels, temperatures, ice cores) is independently verifiable",
      "Because the government would never allow false information to be published in journals",
      "Because scientists who lie about data are immediately jailed"
    ],
    correctText: "Because the evidence for climate change comes from thousands of independent scientists across competing institutions and nations — a coordinated hoax at that scale is implausible, and the physical data (sea levels, temperatures, ice cores) is independently verifiable",
    feedback: "Conspiracy theories require implausibly large coordinated deception. Climate data comes from NASA, NOAA, ESA, universities, and independent research bodies across rival nations. The physical measurements — rising sea levels, retreating glaciers, atmospheric CO₂ concentrations — can be independently verified by anyone with the right instruments."
  }
];

// ─── Shuffle helper ───────────────────────────────────────────────────────────
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j   = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// ─── Pick 1 random question per category, shuffle its options ─────────────────
// Slot 3 (index 2) = True/False  |  Slot 5 (index 4) = Reasoning
function buildQuestionSet() {
  var byCategory = {};
  questionBank.forEach(function(q) {
    if (!byCategory[q.category]) byCategory[q.category] = [];
    byCategory[q.category].push(q);
  });

  var picked = [];
  var cats   = Object.keys(byCategory).sort(); // [01, 02, 03, 04, 05]

  cats.forEach(function(cat, slotIndex) {
    var q, shuffledOptions, newCorrectIndex;

    // Slot index 2 → True / False (replaces category 03)
    if (slotIndex === 2) {
      q = trueFalseBank[Math.floor(Math.random() * trueFalseBank.length)];
      picked.push({
        category: q.category,
        type:     "truefalse",
        text:     q.text,
        options:  ["True", "False"],
        correct:  q.correctText === "True" ? 0 : 1,
        feedback: q.feedback
      });
      return;
    }

    // Slot index 4 → Reasoning (replaces category 05)
    if (slotIndex === 4) {
      q = reasoningBank[Math.floor(Math.random() * reasoningBank.length)];
      shuffledOptions = shuffle(q.options);
      newCorrectIndex = shuffledOptions.indexOf(q.correctText);
      picked.push({
        category: q.category,
        type:     "reasoning",
        text:     q.text,
        options:  shuffledOptions,
        correct:  newCorrectIndex,
        feedback: q.feedback
      });
      return;
    }

    // Normal MCQ for all other slots
    var pool = byCategory[cat];
    q = pool[Math.floor(Math.random() * pool.length)];
    shuffledOptions = shuffle(q.options);
    newCorrectIndex = shuffledOptions.indexOf(q.correctText);
    picked.push({
      category: q.category,
      type:     "mcq",
      text:     q.text,
      options:  shuffledOptions,
      correct:  newCorrectIndex,
      feedback: q.feedback
    });
  });

  return picked;
}

// ─── Reset / start quiz ───────────────────────────────────────────────────────
function resetQuiz() {
  questions = buildQuestionSet();
  currentQ  = 0;
  score     = 0;
  answered  = false;
  answers   = [];
  userLevel = -1;

  // Show quiz body & footer, hide score screen
  document.getElementById('quiz-body').style.display   = 'block';
  document.getElementById('quiz-footer').style.display = 'flex';
  document.getElementById('score-display').className   = 'score-display'; // removes 'visible'

  // Reset score ring
  document.getElementById('score-circle').style.transition    = 'none';
  document.getElementById('score-circle').style.strokeDashoffset = '364';

  // Clear temper level highlights
  document.querySelectorAll('.temper-level').forEach(function(el) {
    el.classList.remove('user-level-active');
  });

  // Reset temper detail panel
  document.getElementById('td-title').innerHTML   = 'Complete the quiz above';
  document.getElementById('td-title').style.color = '';
  document.getElementById('td-desc').innerHTML    = 'After finishing the assessment, your level will be highlighted here automatically. You can also click any level to explore what it represents.';
  var badge = document.getElementById('td-user-badge');
  if (badge) badge.style.display = 'none';

  renderQuestion();
}

// ─── Render current question ──────────────────────────────────────────────────
function renderQuestion() {
  var q = questions[currentQ];
  answered = false;

  document.getElementById('q-num').innerHTML     = q.category;
  document.getElementById('q-text').innerHTML    = q.text;
  document.getElementById('q-counter').innerHTML = 'Question ' + (currentQ + 1) + ' / ' + questions.length;
  document.getElementById('progress-fill').style.width = (((currentQ + 1) / questions.length) * 100) + '%';

  document.getElementById('quiz-feedback').className     = 'quiz-feedback';
  document.getElementById('next-btn').style.display      = 'none';
  document.querySelector('.quiz-footer div').innerHTML   = 'Select an answer to continue';
  document.querySelector('.quiz-footer div').style.color = '';

  var grid = document.getElementById('options-grid');
  grid.innerHTML = '';

  if (q.type === 'truefalse') {
    grid.style.gridTemplateColumns = '1fr 1fr';
    q.options.forEach(function(opt, i) {
      var btn = document.createElement('button');
      btn.className = 'option-btn tf-btn';
      var icon  = opt === 'True' ? '✓' : '✗';
      var color = opt === 'True' ? '#00e5c3' : '#e05a7a';
      btn.innerHTML = '<span style="font-size:1.4rem;display:block;margin-bottom:0.3rem;color:' + color + '">' + icon + '</span>' + opt;
      btn.style.textAlign = 'center';
      btn.style.padding   = '1.2rem 1rem';
      btn.setAttribute('data-index', i);
      btn.onclick = function() { selectAnswer(parseInt(this.getAttribute('data-index'))); };
      grid.appendChild(btn);
    });
  } else if (q.type === 'reasoning') {
    grid.style.gridTemplateColumns = '1fr';
    var labels = ['A', 'B', 'C', 'D'];
    q.options.forEach(function(opt, i) {
      var btn = document.createElement('button');
      btn.className = 'option-btn reasoning-btn';
      btn.innerHTML = '<span style="min-width:1.4rem;font-weight:700;color:#00e5c3;flex-shrink:0;">' + labels[i] + '.</span><span>' + opt + '</span>';
      btn.style.display    = 'flex';
      btn.style.alignItems = 'flex-start';
      btn.style.gap        = '0.75rem';
      btn.style.textAlign  = 'left';
      btn.setAttribute('data-index', i);
      btn.onclick = function() { selectAnswer(parseInt(this.getAttribute('data-index'))); };
      grid.appendChild(btn);
    });
  } else {
    grid.style.gridTemplateColumns = '';
    q.options.forEach(function(opt, i) {
      var btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = opt;
      btn.setAttribute('data-index', i);
      btn.onclick = function() { selectAnswer(parseInt(this.getAttribute('data-index'))); };
      grid.appendChild(btn);
    });
  }
}

// ─── Handle answer selection ──────────────────────────────────────────────────
function selectAnswer(idx) {
  if (answered) return;
  answered = true;

  var q    = questions[currentQ];
  var btns = document.getElementsByClassName('option-btn');

  if (idx === q.correct) {
    btns[idx].className = 'option-btn correct';
    score++;
  } else {
    btns[idx].className = 'option-btn incorrect';
  }
  btns[q.correct].className = 'option-btn correct';
  answers.push(idx === q.correct);

  document.getElementById('quiz-feedback').innerHTML  = q.feedback;
  document.getElementById('quiz-feedback').className  = 'quiz-feedback visible';
  document.getElementById('next-btn').style.display   = 'block';

  var footerDiv = document.querySelector('.quiz-footer div');
  if (idx === q.correct) {
    footerDiv.innerHTML   = '✓ Correct!';
    footerDiv.style.color = '#00e57a';
  } else {
    footerDiv.innerHTML   = '✗ Not quite — see explanation above';
    footerDiv.style.color = '#e05a7a';
  }
}

// ─── Advance to next question ─────────────────────────────────────────────────
function nextQuestion() {
  currentQ++;
  if (currentQ >= questions.length) showScore();
  else renderQuestion();
}

// ─── Show final score ─────────────────────────────────────────────────────────
function showScore() {
  document.getElementById('quiz-body').style.display   = 'none';
  document.getElementById('quiz-footer').style.display = 'none';
  document.getElementById('score-display').className   = 'score-display visible';
  document.getElementById('score-num').innerHTML       = score;

  var offset = 364 - (364 * (score / questions.length));
  setTimeout(function() {
    var c = document.getElementById('score-circle');
    c.style.strokeDashoffset = offset;
    c.style.transition       = 'stroke-dashoffset 1.2s ease';
  }, 100);

  // 0→Novice, 1→Curious, 2→Informed, 3→Analytical, 4-5→Scientific
  var levelMap = [0, 1, 2, 3, 4, 4];
  userLevel = levelMap[Math.min(score, 5)];
  sessionStorage.setItem('quizUserLevel', userLevel);

  var lvl = temperData[userLevel];
  document.getElementById('score-level').innerHTML = lvl.name;
  document.getElementById('score-desc').innerHTML  = lvl.desc;

  highlightTemperLevel(userLevel);
}

// ─── Highlight the user's level on the Temper Scale ──────────────────────────
function highlightTemperLevel(idx) {
  var levels = document.querySelectorAll('.temper-level');
  if (!levels.length) return;
  levels.forEach(function(el) { el.classList.remove('user-level-active'); });
  if (levels[idx]) {
    levels[idx].classList.add('user-level-active');
    showTemperDetail(idx);
    setTimeout(function() {
      var t = document.getElementById('temper');
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 1400);
  }
}

// ─── Show temper level detail panel ──────────────────────────────────────────
function showTemperDetail(idx) {
  var d = temperData[idx];
  document.getElementById('td-title').innerHTML   = d.title;
  document.getElementById('td-title').style.color = d.color;
  document.getElementById('td-desc').innerHTML    = d.desc;

  var badge = document.getElementById('td-user-badge');
  if (!badge) {
    badge    = document.createElement('div');
    badge.id = 'td-user-badge';
    badge.style.cssText = 'font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;'
      + 'padding:0.25rem 0.6rem;border:1px solid currentColor;width:fit-content;margin-top:0.5rem;';
    document.getElementById('temper-detail').appendChild(badge);
  }
  if (userLevel === idx) {
    badge.style.color   = d.color;
    badge.style.display = 'block';
    badge.innerHTML     = '★ Your Current Level';
  } else {
    badge.style.display = 'none';
  }
}

// ─── CTA ──────────────────────────────────────────────────────────────────────
function handleCTA() {
  var email = document.getElementById('cta-email-input').value.trim();
  if (!email || email.indexOf('@') === -1) {
    document.getElementById('cta-email-input').style.borderColor = '#e05a7a';
    return;
  }
  document.getElementById('cta-email-input').style.borderColor = '';

  fetch('/send-assessment-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    var successEl = document.getElementById('cta-success');
    if (data.success) {
      successEl.textContent = '✓ Assessment link sent! Check your inbox.';
      successEl.style.display = 'block';
      document.getElementById('cta-email-input').style.display = 'none';
      document.querySelector('.cta-email .btn-primary').style.display = 'none';
    } else {
      var inputEl = document.getElementById('cta-email-input');
      inputEl.style.borderColor = '#e05a7a';
      successEl.textContent = '✗ ' + (data.message || 'Something went wrong.');
      successEl.style.color = '#e05a7a';
      successEl.style.display = 'block';
    }
  })
  .catch(function() {
    var successEl = document.getElementById('cta-success');
    successEl.textContent = '✗ Could not connect to server.';
    successEl.style.color = '#e05a7a';
    successEl.style.display = 'block';
  });
}

// ─── Login Guard ──────────────────────────────────────────────────────────────
function checkLoginAndProceed(event) {
  event.preventDefault();
  if (sessionStorage.getItem("isLoggedIn") === "true") {
    window.location.href = "quiz.html";
  } else {
    alert("Please Login To Take Assessment");
    window.location.href = "login-page.html";
  }
}

//  Mobile Nav 
function toggleMobileNav() {
  var drawer = document.getElementById('mobile-drawer');
  drawer.className = drawer.className.indexOf('open') === -1
    ? 'nav-mobile-drawer open'
    : 'nav-mobile-drawer';
}

//  Boot 
if (document.getElementById('quiz-body')) {
  var savedLevel = sessionStorage.getItem('quizUserLevel');
  if (savedLevel !== null) {
    userLevel = parseInt(savedLevel);
    resetQuiz();
    document.getElementById('quiz-body').style.display   = 'none';
    document.getElementById('quiz-footer').style.display = 'none';
    document.getElementById('score-display').className   = 'score-display visible';
    document.getElementById('score-num').innerHTML       = userLevel + 1;
    var lvl = temperData[userLevel];
    document.getElementById('score-level').innerHTML = lvl.title;
    document.getElementById('score-desc').innerHTML  = lvl.desc;
    highlightTemperLevel(userLevel);
  } else {
    resetQuiz();
  }
}
