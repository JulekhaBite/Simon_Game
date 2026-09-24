/**
 * Simon Says - Modern Retro Arcade Memory Game
 * Pure Vanilla JavaScript with Web Audio API Synthesizer
 */

// Colors & Audio Frequency definitions (Classic Simon frequencies)
const PAD_CONFIG = {
  green: { freq: 329.63, key: 'q', altKey: 'arrowup' },    // E4
  red: { freq: 261.63, key: 'w', altKey: 'arrowright' },   // C4
  yellow: { freq: 220.00, key: 'a', altKey: 'arrowleft' },  // A3
  blue: { freq: 164.81, key: 's', altKey: 'arrowdown' }     // E3
};

const COLORS = Object.keys(PAD_CONFIG);

// DOM Elements
const pads = document.querySelectorAll('.pad');
const simonBoard = document.getElementById('simon-board');
const startBtn = document.getElementById('start-btn');
const startBtnLabel = document.getElementById('start-btn-label');
const currentScoreEl = document.getElementById('current-score');
const highScoreEl = document.getElementById('high-score');
const strictToggle = document.getElementById('strict-toggle');
const soundToggle = document.getElementById('sound-toggle');
const soundIconOn = document.getElementById('sound-icon-on');
const soundIconOff = document.getElementById('sound-icon-off');
const displayText = document.getElementById('display-text');
const statusMessage = document.getElementById('status-message');

// Game State Variables
let sequence = [];
let playerStep = 0;
let level = 0;
let isPlayingSequence = false;
let isGameActive = false;
let isMuted = false;
let isStrict = false;
let currentSessionId = 0;
let highScore = parseInt(localStorage.getItem('simon_high_score') || '0', 10);

// Web Audio API context (initialized lazily on first user gesture)
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a synthesized tone using Web Audio API
 */
function playTone(frequency, duration = 300, type = 'sine') {
  if (isMuted) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    // Smooth envelope attack and decay to avoid clicking pops
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.3, now + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + (duration / 1000));

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + (duration / 1000));
  } catch (err) {
    console.error('Audio playback error:', err);
  }
}

/**
 * Play error sound on wrong input
 */
function playErrorTone() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(65, ctx.currentTime + 0.45);

    gainNode.gain.setValueAtTime(0.35, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (err) {
    console.error('Error tone error:', err);
  }
}

/**
 * Play celebration chime on level completion
 */
function playWinChime() {
  if (isMuted) return;
  const notes = [261.63, 329.63, 392.00, 523.25]; // C-E-G-C
  notes.forEach((freq, i) => {
    setTimeout(() => {
      playTone(freq, 160, 'triangle');
    }, i * 70);
  });
}

/**
 * Format score with leading zeros
 */
function formatScore(num) {
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Update the high score display and persistence
 */
function updateHighScore(newScore) {
  if (newScore > highScore) {
    highScore = newScore;
    localStorage.setItem('simon_high_score', highScore);
  }
  highScoreEl.textContent = formatScore(highScore);
}

/**
 * Flash a color pad visually and trigger its sound
 */
function activatePad(color, duration = 320) {
  const pad = document.getElementById(color);
  if (!pad) return;

  pad.classList.add('active');
  const config = PAD_CONFIG[color];
  if (config) {
    playTone(config.freq, duration);
  }

  setTimeout(() => {
    pad.classList.remove('active');
  }, duration);
}

/**
 * Calculate tone and pause speed based on round level
 */
function getSpeedForLevel(currentLevel) {
  if (currentLevel >= 13) return { lightDuration: 280, pauseDuration: 100 };
  if (currentLevel >= 6) return { lightDuration: 360, pauseDuration: 140 };
  return { lightDuration: 450, pauseDuration: 200 };
}

/**
 * Simon plays the entire current sequence
 */
async function playSequence() {
  const thisSession = currentSessionId;
  isPlayingSequence = true;
  setControlsDisabled(true);
  displayText.textContent = 'WATCH';
  statusMessage.textContent = `Round ${level}: Watch Simon's pattern...`;
  statusMessage.style.color = '#00f0ff';

  const { lightDuration, pauseDuration } = getSpeedForLevel(level);

  // Brief initial pause before starting playback
  await wait(600);
  if (thisSession !== currentSessionId) return;

  for (let i = 0; i < sequence.length; i++) {
    if (thisSession !== currentSessionId) return;
    const color = sequence[i];
    activatePad(color, lightDuration);
    await wait(lightDuration + pauseDuration);
  }

  if (thisSession !== currentSessionId) return;

  // Pass turn to player
  playerStep = 0;
  isPlayingSequence = false;
  setControlsDisabled(false);
  displayText.textContent = 'YOUR TURN';
  statusMessage.textContent = `Your turn! Repeat the sequence (${sequence.length} steps)`;
  statusMessage.style.color = '#00ff77';
}

/**
 * Helper promise-based delay
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Advance to next round
 */
function nextRound() {
  level++;
  currentScoreEl.textContent = formatScore(level);
  updateHighScore(level - 1);

  // Add a new random color to sequence
  const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  sequence.push(randomColor);

  playSequence();
}

/**
 * Handle user pad click or key press
 */
function handlePlayerInput(color) {
  if (!isGameActive || isPlayingSequence) return;

  getAudioContext();

  const expectedColor = sequence[playerStep];

  if (color === expectedColor) {
    // Correct step
    activatePad(color, 250);
    playerStep++;

    // Did the player complete the full round sequence?
    if (playerStep === sequence.length) {
      isPlayingSequence = true;
      setControlsDisabled(true);
      displayText.textContent = 'GREAT!';
      statusMessage.textContent = `Level ${level} complete! Keep going!`;
      statusMessage.style.color = '#ffdc2b';

      updateHighScore(level);
      playWinChime();

      setTimeout(() => {
        nextRound();
      }, 900);
    }
  } else {
    // Incorrect input
    handleMistake();
  }
}

/**
 * Handle wrong input
 */
function handleMistake() {
  isPlayingSequence = true;
  setControlsDisabled(true);

  playErrorTone();
  displayText.textContent = 'WRONG!';
  statusMessage.textContent = isStrict
    ? `Wrong move! Game over in Strict Mode.`
    : `Wrong move! Try again...`;
  statusMessage.style.color = '#ff2d46';

  // Trigger shake animation
  simonBoard.classList.add('shake');
  setTimeout(() => {
    simonBoard.classList.remove('shake');
  }, 500);

  if (isStrict) {
    gameOver();
  } else {
    // Normal mode: Give player another chance at current sequence
    setTimeout(() => {
      statusMessage.textContent = 'Repeating current sequence...';
      playSequence();
    }, 1200);
  }
}

/**
 * Game Over handling
 */
function gameOver() {
  isGameActive = false;
  isPlayingSequence = false;
  startBtnLabel.textContent = 'RESTART';
  displayText.textContent = 'OVER';
  statusMessage.textContent = `Game Over! You reached Level ${level}. Press RESTART to play again.`;
  statusMessage.style.color = '#ff2d46';
  setControlsDisabled(true);
}

/**
 * Start or Restart the game
 */
function startGame() {
  getAudioContext();
  currentSessionId++;

  sequence = [];
  playerStep = 0;
  level = 0;
  isGameActive = true;
  startBtnLabel.textContent = 'RESET';
  displayText.textContent = 'GET SET';
  statusMessage.textContent = 'Starting in 3, 2, 1...';
  statusMessage.style.color = '#00f0ff';

  currentScoreEl.textContent = '00';

  const thisSession = currentSessionId;
  setTimeout(() => {
    if (thisSession === currentSessionId) {
      nextRound();
    }
  }, 800);
}

/**
 * Enable or disable pad buttons
 */
function setControlsDisabled(disabled) {
  pads.forEach(pad => {
    pad.disabled = disabled;
    if (disabled) {
      pad.style.pointerEvents = 'none';
    } else {
      pad.style.pointerEvents = 'auto';
    }
  });
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
  // Pad clicks
  pads.forEach(pad => {
    pad.addEventListener('click', () => {
      const color = pad.getAttribute('data-color');
      handlePlayerInput(color);
    });
  });

  // Start / Reset button
  startBtn.addEventListener('click', () => {
    startGame();
  });

  // Strict mode toggle
  strictToggle.addEventListener('change', (e) => {
    isStrict = e.target.checked;
    statusMessage.textContent = isStrict
      ? 'Strict mode enabled: One mistake resets to Level 1!'
      : 'Normal mode enabled: You get retries on mistakes.';
  });

  // Sound toggle button
  soundToggle.addEventListener('click', () => {
    isMuted = !isMuted;
    soundIconOn.classList.toggle('hidden', isMuted);
    soundIconOff.classList.toggle('hidden', !isMuted);
    statusMessage.textContent = isMuted ? 'Sound muted.' : 'Sound unmuted.';
  });

  // Keyboard shortcut listener
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // Start / Restart with Spacebar
    if (e.code === 'Space' && e.target !== startBtn && e.target !== strictToggle) {
      e.preventDefault();
      startGame();
      return;
    }

    // Pad hotkeys
    for (const [color, config] of Object.entries(PAD_CONFIG)) {
      if (key === config.key || key === config.altKey) {
        e.preventDefault();
        handlePlayerInput(color);
        break;
      }
    }
  });
}

// Initial bootstrap
function init() {
  updateHighScore(highScore);
  setControlsDisabled(true);
  initEventListeners();
}

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', init);
