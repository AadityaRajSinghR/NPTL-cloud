let questionsDb = [];

const state = {
  currentQuestions: [],
  currentIndex: 0,
  userAnswers: {},
  reviewedQuestions: new Set(),
  bookmarked: new Set(),
  config: {
    mode: "practice",
    timerEnabled: false
  },
  timerInterval: null,
  timeRemaining: 0,
  lastIncorrectQuestions: []
};

const screens = {
  home: document.getElementById("home-screen"),
  quiz: document.getElementById("quiz-screen"),
  result: document.getElementById("result-screen")
};

const startBtn = document.getElementById("start-btn");
const nextBtn = document.getElementById("next-btn");
const prevBtn = document.getElementById("prev-btn");
const submitBtn = document.getElementById("submit-btn");
const checkBtn = document.getElementById("check-btn");
const bookmarkBtn = document.getElementById("bookmark-btn");
const themeToggle = document.getElementById("theme-toggle");
const reviewBtn = document.getElementById("review-btn");
const restartBtn = document.getElementById("restart-btn");
const retryIncorrectBtn = document.getElementById("retry-incorrect-btn");
const homeStatus = document.getElementById("home-status");
const timerDisplay = document.getElementById("timer-display");
const reviewContainer = document.getElementById("review-container");
const topicPerformance = document.getElementById("topic-performance");
const topicSelect = document.getElementById("topic-select");
const countSelect = document.getElementById("count-select");

function $(selector) {
  return document.querySelector(selector);
}

async function loadQuestions() {
  try {
    const response = await fetch("questions.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Failed to load questions.json (${response.status})`);
    }

    const payload = await response.json();

    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error("questions.json is empty or invalid");
    }

    questionsDb = payload.map((question, index) => ({
      ...question,
      id: index + 1,
      type: question.type === "multi" ? "multi" : "single",
      topic: question.topic || "General",
      options: Array.isArray(question.options) ? question.options : [],
      correct: Array.isArray(question.correct) ? question.correct : []
    }));
  } catch (error) {
    console.error("Using embedded questions due to load error:", error);
    homeStatus.textContent = "Could not load questions.json. Using bundled questions instead.";
  }
}

function getAvailableQuestions(topicFilter) {
  return topicFilter === "All"
    ? [...questionsDb]
    : questionsDb.filter((question) => question.topic === topicFilter);
}

function getUniqueTopics() {
  return [...new Set(questionsDb.map((question) => question.topic))].sort((left, right) => left.localeCompare(right));
}

function buildCountOptions(maxCount) {
  const presets = [1, 3, 5, 10, 15, 20, 25, 50];
  const options = presets.filter((value) => value < maxCount);

  if (!options.includes(maxCount)) {
    options.push(maxCount);
  }

  return options;
}

function populateCountOptions(topicFilter, previouslySelectedCount = "All") {
  const availableQuestions = getAvailableQuestions(topicFilter);
  const availableCount = availableQuestions.length;
  const selectedValue = previouslySelectedCount === "All" ? "All" : Number(previouslySelectedCount);

  countSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "All";
  allOption.textContent = `All available (${availableCount})`;
  countSelect.append(allOption);

  buildCountOptions(availableCount).forEach((count) => {
    const countOption = document.createElement("option");
    countOption.value = String(count);
    countOption.textContent = `${count} question${count === 1 ? "" : "s"}`;
    countSelect.append(countOption);
  });

  const allowedValues = new Set(Array.from(countSelect.options, (option) => option.value));
  countSelect.value = allowedValues.has(String(selectedValue)) ? String(selectedValue) : "All";
}

function populateFilterControls() {
  const previouslySelectedTopic = topicSelect.value || "All";
  const previouslySelectedCount = countSelect.value || "All";

  topicSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "All";
  allOption.textContent = `All topics (${questionsDb.length})`;
  topicSelect.append(allOption);

  getUniqueTopics().forEach((topic) => {
    const topicOption = document.createElement("option");
    topicOption.value = topic;
    topicOption.textContent = `${topic} (${questionsDb.filter((question) => question.topic === topic).length})`;
    topicSelect.append(topicOption);
  });

  topicSelect.value = previouslySelectedTopic === "All" || getUniqueTopics().includes(previouslySelectedTopic)
    ? previouslySelectedTopic
    : "All";

  populateCountOptions(topicSelect.value, previouslySelectedCount);
}

function updateHomeStatus() {
  const availableQuestions = getAvailableQuestions(topicSelect.value);
  const availableCount = availableQuestions.length;
  const requestedCount = countSelect.value === "All" ? availableCount : Math.min(Number(countSelect.value), availableCount);
  const topicLabel = topicSelect.value === "All" ? "all topics" : topicSelect.value;

  homeStatus.textContent = `${availableCount} question${availableCount === 1 ? "" : "s"} available in ${topicLabel}. Starting now will use ${requestedCount} question${requestedCount === 1 ? "" : "s"}.`;
}

function refreshFilterSummary() {
  populateCountOptions(topicSelect.value, countSelect.value);
  updateHomeStatus();
}

function syncOptionState(questionId) {
  const selectedAnswers = getSelectedAnswers(questionId);

  document.querySelectorAll(`input[name="question-${questionId}"]`).forEach((input) => {
    const label = input.closest(".option-label");
    if (!label) {
      return;
    }

    label.classList.toggle("selected", selectedAnswers.includes(Number(input.value)));
  });
}

function applySelectionFeedback(question) {
  const selectedAnswers = getSelectedAnswers(question.id);

  document.getElementById("check-btn").disabled = selectedAnswers.length === 0;
  syncOptionState(question.id);
}

function getSelectedMode() {
  return document.querySelector('input[name="quiz-mode"]:checked')?.value || "practice";
}

function shuffleQuestions(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function getSelectedAnswers(questionId) {
  return state.userAnswers[questionId] || [];
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function isAnswerCorrect(question, selected) {
  if (question.type === "single") {
    return selected[0] === question.correct[0];
  }

  return arraysEqual(selected, question.correct);
}

function setTheme(isDark) {
  document.body.classList.toggle("dark-mode", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  localStorage.setItem("cloudQuizTheme", isDark ? "dark" : "light");
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimerDisplay() {
  const minutes = Math.floor(state.timeRemaining / 60).toString().padStart(2, "0");
  const seconds = (state.timeRemaining % 60).toString().padStart(2, "0");
  timerDisplay.textContent = `${minutes}:${seconds}`;
}

function startTimer() {
  stopTimer();
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timeRemaining -= 1;
    updateTimerDisplay();

    if (state.timeRemaining <= 0) {
      stopTimer();
      finishQuiz();
    }
  }, 1000);
}

function switchScreen(screenName) {
  Object.values(screens).forEach((screen) => {
    screen.classList.add("hidden");
    screen.classList.remove("active");
  });
  screens[screenName].classList.remove("hidden");
  screens[screenName].classList.add("active");
}

function renderHomeStats() {
  document.getElementById("question-count-val").textContent = String(questionsDb.length);
  document.getElementById("topic-count-val").textContent = String(new Set(questionsDb.map((question) => question.topic)).size);
  updateHomeStatus();
}

function clearQuestionFeedback() {
  const feedbackEl = document.getElementById("instant-feedback");
  feedbackEl.className = "feedback hidden";
  feedbackEl.textContent = "";
}

function renderFeedback(question, selectedAnswers) {
  const feedbackEl = document.getElementById("instant-feedback");
  const correct = isAnswerCorrect(question, selectedAnswers);

  feedbackEl.className = `feedback ${correct ? "correct-option" : "wrong-option"}`;
  feedbackEl.innerHTML = `
    <strong>${correct ? "Correct" : "Incorrect"}</strong>
    <p>${question.explanation}</p>
  `;

  return correct;
}

function renderQuestion() {
  const question = state.currentQuestions[state.currentIndex];
  if (!question) {
    return;
  }

  const selectedAnswers = getSelectedAnswers(question.id);
  const reviewed = state.reviewedQuestions.has(question.id);
  const isLastQuestion = state.currentIndex === state.currentQuestions.length - 1;

  document.getElementById("progress-text").textContent = `Question ${state.currentIndex + 1}/${state.currentQuestions.length}`;
  document.getElementById("progress-bar").style.width = `${((state.currentIndex + 1) / state.currentQuestions.length) * 100}%`;
  document.getElementById("quiz-title").textContent = question.question;
  document.getElementById("question-instruction").textContent = question.type === "multi" ? "Select all that apply" : "Select one option";

  const optionsContainer = document.getElementById("options-container");
  optionsContainer.innerHTML = "";

  question.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "option-label";

    if (selectedAnswers.includes(index)) {
      label.classList.add("selected");
    }

    if (reviewed && question.correct.includes(index)) {
      label.classList.add("correct-option");
    }

    if (reviewed && selectedAnswers.includes(index) && !question.correct.includes(index)) {
      label.classList.add("wrong-option");
    }

    const input = document.createElement("input");
    input.type = question.type === "single" ? "radio" : "checkbox";
    input.name = `question-${question.id}`;
    input.value = String(index);
    input.checked = selectedAnswers.includes(index);
    input.disabled = reviewed;
    input.addEventListener("change", saveAnswer);

    const text = document.createElement("span");
    text.textContent = option;

    label.append(input, text);
    optionsContainer.append(label);
  });

  bookmarkBtn.textContent = state.bookmarked.has(question.id) ? "Bookmarked" : "Bookmark";
  bookmarkBtn.setAttribute("aria-pressed", String(state.bookmarked.has(question.id)));

  document.getElementById("prev-btn").disabled = state.currentIndex === 0;
  applySelectionFeedback(question);

  if (state.config.mode === "practice" && !reviewed) {
    checkBtn.classList.remove("hidden");
    nextBtn.classList.add("hidden");
    submitBtn.classList.add("hidden");
    clearQuestionFeedback();
  } else {
    checkBtn.classList.add("hidden");

    if (reviewed) {
      renderFeedback(question, selectedAnswers);
    } else {
      clearQuestionFeedback();
    }

    if (isLastQuestion) {
      submitBtn.classList.remove("hidden");
      nextBtn.classList.add("hidden");
    } else {
      nextBtn.classList.remove("hidden");
      submitBtn.classList.add("hidden");
    }
  }
}

function saveAnswer() {
  const question = state.currentQuestions[state.currentIndex];
  const checkedInputs = document.querySelectorAll(`input[name="question-${question.id}"]:checked`);
  state.userAnswers[question.id] = Array.from(checkedInputs, (input) => Number(input.value));
  applySelectionFeedback(question);
}

function navigate(direction) {
  const nextIndex = state.currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= state.currentQuestions.length) {
    return;
  }

  state.currentIndex = nextIndex;
  renderQuestion();
}

function toggleBookmark() {
  const questionId = state.currentQuestions[state.currentIndex].id;

  if (state.bookmarked.has(questionId)) {
    state.bookmarked.delete(questionId);
  } else {
    state.bookmarked.add(questionId);
  }

  renderQuestion();
}

function checkPracticeAnswer() {
  const question = state.currentQuestions[state.currentIndex];
  const selectedAnswers = getSelectedAnswers(question.id);

  if (selectedAnswers.length === 0) {
    return;
  }

  state.reviewedQuestions.add(question.id);
  renderQuestion();
}

function buildReviewList(questions, scoreMap) {
  reviewContainer.innerHTML = "";

  questions.forEach((question) => {
    const selectedAnswers = getSelectedAnswers(question.id);
    const correct = isAnswerCorrect(question, selectedAnswers);
    const reviewItem = document.createElement("article");
    reviewItem.className = `review-item ${correct ? "correct-option" : "wrong-option"}`;

    reviewItem.innerHTML = `
      <h4>${question.question}</h4>
      <p><strong>Your answer:</strong> ${selectedAnswers.length ? selectedAnswers.map((index) => question.options[index]).join(", ") : "Skipped"}</p>
      <p><strong>Correct answer:</strong> ${question.correct.map((index) => question.options[index]).join(", ")}</p>
      <p class="explanation">${question.explanation}</p>
    `;

    reviewContainer.appendChild(reviewItem);
  });

  topicPerformance.innerHTML = "";

  for (const [topic, stats] of Object.entries(scoreMap)) {
    const percentage = stats.total === 0 ? 0 : Math.round((stats.correct / stats.total) * 100);
    const topicCard = document.createElement("section");
    topicCard.className = "topic-card";
    topicCard.innerHTML = `
      <div class="topic-card-head">
        <span>${topic}</span>
        <span>${stats.correct}/${stats.total} (${percentage}%)</span>
      </div>
      <div class="topic-meter" aria-hidden="true"><span style="width:${percentage}%"></span></div>
    `;
    topicPerformance.appendChild(topicCard);
  }
}

function finishQuiz() {
  stopTimer();

  let score = 0;
  const topicStats = {};
  const incorrectQuestions = [];

  state.currentQuestions.forEach((question) => {
    if (!topicStats[question.topic]) {
      topicStats[question.topic] = { total: 0, correct: 0 };
    }

    topicStats[question.topic].total += 1;

    const selectedAnswers = getSelectedAnswers(question.id);
    const correct = isAnswerCorrect(question, selectedAnswers);

    if (correct) {
      score += 1;
      topicStats[question.topic].correct += 1;
    } else {
      incorrectQuestions.push(question);
    }
  });

  state.lastIncorrectQuestions = incorrectQuestions;

  const percentage = Math.round((score / state.currentQuestions.length) * 100);
  const currentBest = Number(localStorage.getItem("cloudQuizBestScore") || 0);

  if (percentage > currentBest) {
    localStorage.setItem("cloudQuizBestScore", String(percentage));
    document.getElementById("best-score-val").textContent = String(percentage);
  }

  document.getElementById("score-text").textContent = `You scored ${score} out of ${state.currentQuestions.length}`;
  document.getElementById("percentage-text").textContent = `${percentage}%`;
  buildReviewList(state.currentQuestions, topicStats);

  reviewContainer.classList.add("hidden");
  reviewBtn.textContent = "Review answers";

  if (incorrectQuestions.length > 0) {
    retryIncorrectBtn.classList.remove("hidden");
    retryIncorrectBtn.onclick = () => startCustomRetry(incorrectQuestions);
  } else {
    retryIncorrectBtn.classList.add("hidden");
    retryIncorrectBtn.onclick = null;
  }

  switchScreen("result");
}

function startCustomRetry(questionsToRetry) {
  startQuizWithQuestions(questionsToRetry, true);
}

function startQuizWithQuestions(questions, isRetry = false) {
  state.currentQuestions = questions;
  state.currentIndex = 0;
  state.userAnswers = {};
  state.reviewedQuestions = new Set();
  state.bookmarked = new Set();

  const timerEnabled = state.config.timerEnabled && !isRetry;
  timerDisplay.classList.toggle("hidden", !timerEnabled);

  if (timerEnabled) {
    state.timeRemaining = state.currentQuestions.length * 60;
    startTimer();
  } else {
    stopTimer();
  }

  switchScreen("quiz");
  renderQuestion();
}

function startQuiz() {
  const topicFilter = topicSelect.value;
  const countFilter = countSelect.value;
  state.config.mode = getSelectedMode();
  state.config.timerEnabled = document.getElementById("timer-toggle").checked;

  let filteredQuestions = getAvailableQuestions(topicFilter);
  filteredQuestions = shuffleQuestions(filteredQuestions);

  if (countFilter !== "All") {
    filteredQuestions = filteredQuestions.slice(0, Number(countFilter));
  }

  if (filteredQuestions.length === 0) {
    homeStatus.textContent = "No questions found for that topic.";
    return;
  }

  timerDisplay.classList.toggle("hidden", !state.config.timerEnabled);
  state.timeRemaining = state.config.timerEnabled ? filteredQuestions.length * 60 : 0;
  state.currentQuestions = filteredQuestions;
  state.currentIndex = 0;
  state.userAnswers = {};
  state.reviewedQuestions = new Set();
  state.bookmarked = new Set();

  if (state.config.timerEnabled) {
    startTimer();
  } else {
    stopTimer();
  }

  switchScreen("quiz");
  renderQuestion();
}

function resetToHome() {
  stopTimer();
  reviewContainer.classList.add("hidden");
  reviewBtn.textContent = "Review answers";
  homeStatus.textContent = "";
  switchScreen("home");
}

function initTheme() {
  const savedTheme = localStorage.getItem("cloudQuizTheme");
  setTheme(savedTheme === "dark");
  if (savedTheme !== "dark" && savedTheme !== "light") {
    setTheme(false);
  }
}

async function init() {
  await loadQuestions();
  populateFilterControls();
  renderHomeStats();
  initTheme();

  const bestScore = Number(localStorage.getItem("cloudQuizBestScore") || 0);
  document.getElementById("best-score-val").textContent = String(bestScore);

  startBtn.addEventListener("click", startQuiz);
  nextBtn.addEventListener("click", () => navigate(1));
  prevBtn.addEventListener("click", () => navigate(-1));
  submitBtn.addEventListener("click", finishQuiz);
  checkBtn.addEventListener("click", checkPracticeAnswer);
  bookmarkBtn.addEventListener("click", toggleBookmark);
  topicSelect.addEventListener("change", refreshFilterSummary);
  countSelect.addEventListener("change", updateHomeStatus);
  reviewBtn.addEventListener("click", () => {
    reviewContainer.classList.toggle("hidden");
    reviewBtn.textContent = reviewContainer.classList.contains("hidden") ? "Review answers" : "Hide review";
  });
  restartBtn.addEventListener("click", resetToHome);
  retryIncorrectBtn.addEventListener("click", () => startCustomRetry(state.lastIncorrectQuestions));
  themeToggle.addEventListener("click", () => setTheme(!document.body.classList.contains("dark-mode")));

  switchScreen("home");
  document.getElementById("question-count-val").textContent = String(questionsDb.length);
  document.getElementById("topic-count-val").textContent = String(new Set(questionsDb.map((question) => question.topic)).size);
}

document.addEventListener("DOMContentLoaded", init);
