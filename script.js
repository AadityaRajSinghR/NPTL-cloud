// --- Local JSON Dataset ---
const questionsDb = [
  {
    id: 1,
    question: "Which of the following is an example of an IaaS (Infrastructure as a Service) provider?",
    options: ["Google Workspace", "Amazon EC2", "Salesforce", "Dropbox"],
    correct: [1],
    type: "single",
    topic: "Cloud Basics",
    explanation: "Amazon EC2 provides virtual servers, which is a core IaaS offering. The others are SaaS platforms."
  },
  {
    id: 2,
    question: "Which of the following are benefits of using containerization (e.g., Docker)?",
    options: ["Heavyweight OS isolation", "Portability across environments", "Faster startup times than VMs", "Built-in automated database backups"],
    correct: [1, 2],
    type: "multi",
    topic: "Docker",
    explanation: "Containers package code and dependencies for portability and start faster than VMs because they share the host OS kernel. They do not offer heavyweight OS isolation or built-in DB backups."
  },
  {
    id: 3,
    question: "What is the primary objective of a DDoS attack in a cloud environment?",
    options: ["Steal user passwords", "Encrypt data for ransom", "Exhaust resources to make services unavailable", "Inject malicious SQL code"],
    correct: [2],
    type: "single",
    topic: "Security",
    explanation: "A Distributed Denial of Service (DDoS) attack aims to overwhelm systems, making them inaccessible to legitimate users."
  },
  {
    id: 4,
    question: "Which compute model executes code only in response to events and charges only for execution time?",
    options: ["Dedicated Hosting", "Serverless Computing", "Virtual Private Server", "Colocation"],
    correct: [1],
    type: "single",
    topic: "Cloud Basics",
    explanation: "Serverless computing (like AWS Lambda) runs code based on events and scales automatically, billing only for compute time used."
  },
  {
    id: 5,
    question: "Select the core principles of the Zero Trust security model:",
    options: ["Assume breach", "Verify explicitly", "Trust the local network", "Use least privileged access"],
    correct: [0, 1, 3],
    type: "multi",
    topic: "Security",
    explanation: "Zero trust operates on 'never trust, always verify'. It assumes breaches can happen, verifies explicitly, and enforces least privilege. It explicitly does NOT trust the local network."
  }
];

// --- App State ---
let currentQuestions = [];
let currentIndex = 0;
let userAnswers = {}; // { questionId: [selectedIndexes] }
let bookmarked = new Set();
let config = { mode: 'practice', timerEnabled: false };
let timerInterval = null;
let timeRemaining = 0;

// --- DOM Elements ---
const screens = {
  home: document.getElementById('home-screen'),
  quiz: document.getElementById('quiz-screen'),
  result: document.getElementById('result-screen')
};

// Buttons
const startBtn = document.getElementById('start-btn');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const submitBtn = document.getElementById('submit-btn');
const checkBtn = document.getElementById('check-btn');
const bookmarkBtn = document.getElementById('bookmark-btn');
const themeToggle = document.getElementById('theme-toggle');
const reviewBtn = document.getElementById('review-btn');
const restartBtn = document.getElementById('restart-btn');
const retryIncorrectBtn = document.getElementById('retry-incorrect-btn');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  // Load Best Score
  const bestScore = localStorage.getItem('cloudQuizBestScore') || 0;
  document.getElementById('best-score-val').innerText = bestScore;

  // Event Listeners
  startBtn.addEventListener('click', startQuiz);
  nextBtn.addEventListener('click', () => navigate(1));
  prevBtn.addEventListener('click', () => navigate(-1));
  submitBtn.addEventListener('click', finishQuiz);
  themeToggle.addEventListener('click', () => document.body.classList.toggle('dark-mode'));
  checkBtn.addEventListener('click', checkPracticeAnswer);
  bookmarkBtn.addEventListener('click', toggleBookmark);
  reviewBtn.addEventListener('click', () => document.getElementById('review-container').classList.toggle('hidden'));
  restartBtn.addEventListener('click', resetToHome);
  retryIncorrectBtn.addEventListener('click', retryIncorrect);
});

// --- Core Functions ---

function startQuiz() {
  const topicFilter = document.getElementById('topic-select').value;
  const countFilter = document.getElementById('count-select').value;
  config.mode = document.querySelector('input[name="quiz-mode"]:checked').value;
  config.timerEnabled = document.getElementById('timer-toggle').checked;

  // Filter & Shuffle
  let filtered = topicFilter === 'All' ? [...questionsDb] : questionsDb.filter(q => q.topic === topicFilter);
  filtered = filtered.sort(() => Math.random() - 0.5); // Basic shuffle
  
  if (countFilter !== 'All') {
    filtered = filtered.slice(0, parseInt(countFilter));
  }

  if (filtered.length === 0) {
    alert("No questions found for this topic.");
    return;
  }

  currentQuestions = filtered;
  currentIndex = 0;
  userAnswers = {};
  bookmarked.clear();

  // Timer Setup
  if (config.timerEnabled) {
    timeRemaining = currentQuestions.length * 60; // 1 min per question
    document.getElementById('timer-display').classList.remove('hidden');
    startTimer();
  } else {
    document.getElementById('timer-display').classList.add('hidden');
  }

  // UI Setup
  switchScreen('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = currentQuestions[currentIndex];
  document.getElementById('progress-text').innerText = `Question ${currentIndex + 1}/${currentQuestions.length}`;
  document.getElementById('progress-bar').style.width = `${((currentIndex + 1) / currentQuestions.length) * 100}%`;
  
  document.getElementById('question-text').innerText = q.question;
  document.getElementById('question-instruction').innerText = q.type === 'multi' ? "(Select all that apply)" : "(Select one option)";
  
  const optionsContainer = document.getElementById('options-container');
  optionsContainer.innerHTML = '';
  
  const savedAnswers = userAnswers[q.id] || [];

  q.options.forEach((opt, index) => {
    const label = document.createElement('label');
    label.className = 'option-label';
    
    const input = document.createElement('input');
    input.type = q.type === 'single' ? 'radio' : 'checkbox';
    input.name = `question-${q.id}`;
    input.value = index;
    
    if (savedAnswers.includes(index)) {
      input.checked = true;
    }

    input.addEventListener('change', saveAnswer);

    label.appendChild(input);
    label.appendChild(document.createTextNode(opt));
    optionsContainer.appendChild(label);
  });

  // Bookmark styling
  bookmarkBtn.innerText = bookmarked.has(q.id) ? "🔖 Bookmarked" : "🔖 Bookmark";

  // Navigation Logic
  prevBtn.disabled = currentIndex === 0;
  
  document.getElementById('instant-feedback').classList.add('hidden');
  
  if (currentIndex === currentQuestions.length - 1) {
    nextBtn.classList.add('hidden');
    submitBtn.classList.remove('hidden');
  } else {
    nextBtn.classList.remove('hidden');
    submitBtn.classList.add('hidden');
  }

  // Practice Mode Check Button
  if (config.mode === 'practice') {
    checkBtn.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    if (currentIndex === currentQuestions.length - 1) submitBtn.classList.add('hidden');
  } else {
    checkBtn.classList.add('hidden');
  }
}

function saveAnswer() {
  const q = currentQuestions[currentIndex];
  const inputs = document.querySelectorAll(`input[name="question-${q.id}"]:checked`);
  userAnswers[q.id] = Array.from(inputs).map(input => parseInt(input.value));
}

function navigate(dir) {
  currentIndex += dir;
  renderQuestion();
}

function toggleBookmark() {
  const qId = currentQuestions[currentIndex].id;
  if (bookmarked.has(qId)) {
    bookmarked.delete(qId);
  } else {
    bookmarked.add(qId);
  }
  bookmarkBtn.innerText = bookmarked.has(qId) ? "🔖 Bookmarked" : "🔖 Bookmark";
}

function checkPracticeAnswer() {
  const q = currentQuestions[currentIndex];
  const selected = userAnswers[q.id] || [];
  const feedbackEl = document.getElementById('instant-feedback');
  const labels = document.querySelectorAll('.option-label');

  if (selected.length === 0) {
    alert("Please select an answer first.");
    return;
  }

  let isCorrect = false;
  if (q.type === 'single') {
    isCorrect = selected[0] === q.correct[0];
  } else {
    isCorrect = JSON.stringify(selected.sort()) === JSON.stringify([...q.correct].sort());
  }

  labels.forEach((label, idx) => {
    const input = label.querySelector('input');
    input.disabled = true; // Lock answer
    if (q.correct.includes(idx)) {
      label.classList.add('correct-option');
    } else if (selected.includes(idx) && !q.correct.includes(idx)) {
      label.classList.add('wrong-option');
    }
  });

  feedbackEl.classList.remove('hidden');
  feedbackEl.className = isCorrect ? 'correct-option' : 'wrong-option';
  feedbackEl.innerHTML = `<strong>${isCorrect ? 'Correct!' : 'Incorrect.'}</strong> ${q.explanation}`;

  checkBtn.classList.add('hidden');
  if (currentIndex === currentQuestions.length - 1) {
    submitBtn.classList.remove('hidden');
  } else {
    nextBtn.classList.remove('hidden');
  }
}

// --- Evaluation & Results ---
function finishQuiz() {
  clearInterval(timerInterval);
  let score = 0;
  let topicStats = {};
  let incorrectQuestions = [];

  const reviewContainer = document.getElementById('review-container');
  reviewContainer.innerHTML = '';

  currentQuestions.forEach((q) => {
    // Init topic stats
    if (!topicStats[q.topic]) topicStats[q.topic] = { total: 0, correct: 0 };
    topicStats[q.topic].total++;

    const selected = userAnswers[q.id] || [];
    let isCorrect = false;
    
    if (q.type === 'single') {
      isCorrect = selected[0] === q.correct[0];
    } else {
      isCorrect = JSON.stringify(selected.sort()) === JSON.stringify([...q.correct].sort());
    }

    if (isCorrect) {
      score++;
      topicStats[q.topic].correct++;
    } else {
      incorrectQuestions.push(q);
    }

    // Build Review DOM
    const reviewItem = document.createElement('div');
    reviewItem.className = `review-item ${isCorrect ? 'correct-option' : 'wrong-option'}`;
    reviewItem.innerHTML = `
      <h4>${q.question}</h4>
      <p><strong>Your Answer:</strong> ${selected.map(idx => q.options[idx]).join(', ') || 'Skipped'}</p>
      <p><strong>Correct Answer:</strong> ${q.correct.map(idx => q.options[idx]).join(', ')}</p>
      <p class="explanation">${q.explanation}</p>
    `;
    reviewContainer.appendChild(reviewItem);
  });

  const percentage = Math.round((score / currentQuestions.length) * 100);
  
  // Update Best Score
  const currentBest = localStorage.getItem('cloudQuizBestScore') || 0;
  if (percentage > currentBest) {
    localStorage.setItem('cloudQuizBestScore', percentage);
    document.getElementById('best-score-val').innerText = percentage;
  }

  document.getElementById('score-text').innerText = `You scored ${score} out of ${currentQuestions.length}`;
  document.getElementById('percentage-text').innerText = `${percentage}%`;

  // Render Topic Performance
  const topicContainer = document.getElementById('topic-performance');
  topicContainer.innerHTML = '<h3>Topic Performance</h3>';
  for (const [topic, stats] of Object.entries(topicStats)) {
    const p = document.createElement('p');
    p.innerText = `${topic}: ${stats.correct}/${stats.total} (${Math.round((stats.correct/stats.total)*100)}%)`;
    topicContainer.appendChild(p);
  }

  // Handle Retry Button
  if (incorrectQuestions.length > 0) {
    retryIncorrectBtn.classList.remove('hidden');
    retryIncorrectBtn.onclick = () => startCustomRetry(incorrectQuestions);
  } else {
    retryIncorrectBtn.classList.add('hidden');
  }

  switchScreen('result');
}

function startCustomRetry(questionsToRetry) {
  currentQuestions = questionsToRetry;
  currentIndex = 0;
  userAnswers = {};
  document.getElementById('review-container').classList.add('hidden');
  switchScreen('quiz');
  renderQuestion();
}

function resetToHome() {
  document.getElementById('review-container').classList.add('hidden');
  switchScreen('home');
}

// --- Utilities ---
function switchScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

function startTimer() {
  const display = document.getElementById('timer-display');
  timerInterval = setInterval(() => {
    timeRemaining--;
    const minutes = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const seconds = (timeRemaining % 60).toString().padStart(2, '0');
    display.innerText = `${minutes}:${seconds}`;

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      alert("Time is up!");
      finishQuiz();
    }
  }, 1000);
}
