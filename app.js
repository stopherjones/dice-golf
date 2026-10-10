import { COURSES } from './holes/course.js';
import {
  GRID_Q_MAX,
  GRID_Q_MIN,
  GRID_ROW_MAX,
  GRID_ROW_MIN,
  gridRowToAxialR,
  isGridEdge,
  isWithinGrid
} from './holes/grid.js';

const canvas = document.getElementById('golf-canvas');
const ctx = canvas.getContext('2d');

const HEX_RADIUS = 9.8;
const ORIGIN_X = 180;
const ORIGIN_Y = 395;

// Camera state for zoomable and scrollable/pannable hole view
const camera = {
  scale: 1,
  panX: 0,
  panY: 0,
  minScale: 0.4,
  maxScale: 2.8
};

const TERRAIN = {
  tee: { color: '#cddc39', label: 'Tee' },
  fairway: { color: '#4caf50', label: 'Fairway' },
  rough: { color: '#dcedc8', label: 'Rough' },
  deep_rough: { color: '#aed581', label: 'Deep Rough' },
  trees: { color: '#81c784', label: 'Trees' },
  sand: { color: '#fbc02d', label: 'Bunker' },
  water: { color: '#0288d1', label: 'Water' },
  green: { color: '#2e7d32', label: 'Green' },
  hole: { color: '#1a1a1a', label: 'Hole' },
  crazy_fairway: { color: '#00897b', label: 'Carpet Fairway' },
  bumper: { color: '#e91e63', label: 'Bumper Rail' },
  windmill: { color: '#00c853', label: 'Windmill Gate' },
  tube_in: { color: '#00b4d8', label: 'Warp Tube (In)' },
  tube_out: { color: '#76ff03', label: 'Warp Tube (Out)' },
  ramp: { color: '#ffd600', label: 'Speed Ramp' },
  out_of_bounds: { color: '#161c22', label: 'Out of Bounds' }
};

export const CRAZY_CLUBS = {
  tap: {
    id: 'tap',
    name: 'Tap (d6/2)',
    dieType: 'd6',
    sides: 6,
    min: 1,
    max: 3,
    hasScatter: false,
    label: '🟢 Tap (d6/2: 1–3) — Gentle Roll, No Scatter',
    desc: '1–3 hexes movement, no scatter'
  },
  flick: {
    id: 'flick',
    name: 'Flick (d6)',
    dieType: 'd6',
    sides: 6,
    min: 1,
    max: 6,
    hasScatter: false,
    label: '🔵 Flick (d6: 1–6) — Standard Roll, No Scatter',
    desc: '1–6 hexes movement, no scatter'
  },
  hit: {
    id: 'hit',
    name: 'Hit (d6+2)',
    dieType: 'd6',
    sides: 6,
    min: 3,
    max: 8,
    hasScatter: true,
    label: '🟡 Hit (d6+2: 3–8) — Firm Strike, d6/3 Scatter',
    desc: '3–8 hexes movement, d6/3 hexes scatter'
  },
  whack: {
    id: 'whack',
    name: 'Whack (d6+4)',
    dieType: 'd6',
    sides: 6,
    min: 5,
    max: 10,
    hasScatter: true,
    label: '🟠 Whack (d6+4: 5–10) — Hard Stroke, d6/2 Scatter',
    desc: '5–10 hexes movement, d6/2 hexes scatter'
  },
  blast: {
    id: 'blast',
    name: 'Blast (d6+6)',
    dieType: 'd6',
    sides: 6,
    min: 7,
    max: 12,
    hasScatter: true,
    label: '🔴 Blast (d6+6: 7–12) — Full Power, d6/2 Scatter',
    desc: '7–12 hexes movement, d6/2 hexes scatter'
  }
};

export const CRAZY_DICE = CRAZY_CLUBS;

const HEX_DIRS = [
  { q: 0, r: -1 },  // N (↑)
  { q: 1, r: -1 },  // NE (↗)
  { q: 1, r: 0 },   // SE (↘)
  { q: 0, r: 1 },   // S (↓)
  { q: -1, r: 1 },  // SW (↙)
  { q: -1, r: 0 }   // NW (↖)
];

const LEADERBOARD_STORAGE_KEY = 'paper-golf-leaderboards-v1';
const LEADERBOARD_COURSES = Object.keys(COURSES).filter(courseKey => courseKey !== 'daily');

// Current Game State
let currentCourseKey = 'parkland';
let currentHoles = COURSES.parkland.holes;
let currentHoleIndex = 0;
let currentHole = currentHoles[currentHoleIndex];
let playerPos = { ...currentHole.tee };
let strokeCount = 0;
let roundScores = new Array(9).fill(null);
let shotTrails = [];
let windmillOpen = false;
let leaderboardSaveError = '';
let roundLeaderboardSaveAttempted = false;

function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

function getClubRange(club, terrain) {
  if (currentHole && currentHole.isCrazyGolf && CRAZY_DICE[club]) {
    let min = CRAZY_DICE[club].min;
    let max = CRAZY_DICE[club].max;
    if (terrain === 'ramp') {
      min += 2;
      max += 2;
    }
    return { min, max };
  }
  let min = 1;
  let max = 6;
  if (club === 'driver') { min = 7; max = 12; }
  else if (club === 'longIron') { min = 4; max = 9; }
  else if (club === 'shortIron') { min = 1; max = 6; }
  else if (club === 'putter') { min = 1; max = 3; }

  const modifier = getTraditionalClubModifier(club, terrain);
  const minimum = terrain === 'sand' && club === 'shortIron' ? 0 : 1;
  return {
    min: Math.max(minimum, min + modifier),
    max: Math.max(minimum, max + modifier)
  };
}

function getTraditionalClubModifier(club, terrain) {
  if (club === 'longIron') {
    if (terrain === 'tee' || terrain === 'fairway') return 1;
    if (terrain === 'rough') return -1;
    if (terrain === 'deep_rough') return -2;
  } else if (club === 'shortIron') {
    if (terrain === 'sand') return -2;
    if (terrain === 'deep_rough') return -1;
  } else if (club === 'putter') {
    if (terrain === 'fairway') return -1;
    if (terrain === 'rough') return -2;
  }
  return 0;
}

function getTraditionalShotDistance(club, dieRoll, terrain) {
  let distance = dieRoll;
  if (club === 'driver') distance += 6;
  else if (club === 'longIron') distance += 3;
  else if (club === 'putter') distance = dieRoll <= 2 ? 1 : dieRoll <= 4 ? 2 : 3;

  const minimum = terrain === 'sand' && club === 'shortIron' ? 0 : 1;
  return Math.max(minimum, distance + getTraditionalClubModifier(club, terrain));
}

function formatD6Modifier(modifier) {
  if (modifier > 0) return `1D6+${modifier}`;
  if (modifier < 0) return `1D6${modifier}`;
  return '1D6';
}

let currentAimDir = 0;
export function getSelectedAimDir() {
  return currentAimDir;
}

function syncAimUI(dirIndex) {
  currentAimDir = parseInt(dirIndex, 10);

  const pills = document.querySelectorAll('.aim-pill');
  pills.forEach((pill) => {
    if (pill.getAttribute('data-dir') === String(currentAimDir)) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
}

let currentSelectedClub = 'driver';
export function getSelectedClub() {
  return currentSelectedClub;
}

export function selectClub(clubId) {
  currentSelectedClub = clubId;
  const boxes = document.querySelectorAll('.club-box');
  boxes.forEach((box) => {
    if (box.getAttribute('data-club') === clubId) {
      box.classList.add('active');
    } else {
      box.classList.remove('active');
    }
  });
  if (currentHole && currentHole.isCrazyGolf) {
    updateCrazyStatusBar();
  }
  render();
}

function getHolePos() {
  if (currentHole.hole) return currentHole.hole;
  for (const [key, terrain] of Object.entries(currentHole.layout)) {
    if (terrain === 'hole') {
      const [q, r] = key.split(',').map(Number);
      return { q, r };
    }
  }
  return { q: 0, r: 0 };
}

function isAdjacentToHole(pos) {
  const holePos = getHolePos();
  return hexDistance(pos, holePos) === 1;
}

function getTerrainAt(q, r) {
  if (!isWithinGrid(q, r)) return 'trees';
  const key = `${q},${r}`;
  if (currentHole && currentHole.layout && currentHole.layout[key]) return currentHole.layout[key];
  if (currentHole && currentHole.isCrazyGolf) return 'out_of_bounds';
  if (isGridEdge(q, r)) return 'trees';
  return 'rough';
}

export function isCrazyPlayable(q, r) {
  if (!currentHole || !currentHole.isCrazyGolf) {
    return isLand(q, r);
  }
  const key = `${q},${r}`;
  const terrain = currentHole.layout ? currentHole.layout[key] : null;
  return !!terrain && terrain !== 'bumper' && terrain !== 'out_of_bounds' && terrain !== 'water' && terrain !== 'trees';
}

export function isCrazyWall(q, r) {
  if (!currentHole || !currentHole.isCrazyGolf) return false;
  const key = `${q},${r}`;
  const terrain = currentHole.layout ? currentHole.layout[key] : null;
  return !terrain || terrain === 'bumper' || terrain === 'out_of_bounds';
}

export function getBumperReflectionDir(fromPos, incomingDir) {
  const dirR = (incomingDir + 2) % 6;
  const dirL = (incomingDir + 4) % 6;
  const hexR = { q: fromPos.q + HEX_DIRS[dirR].q, r: fromPos.r + HEX_DIRS[dirR].r };
  const hexL = { q: fromPos.q + HEX_DIRS[dirL].q, r: fromPos.r + HEX_DIRS[dirL].r };
  const canR = isCrazyPlayable(hexR.q, hexR.r);
  const canL = isCrazyPlayable(hexL.q, hexL.r);

  if (canR && canL) {
    const wallRight = isCrazyWall(fromPos.q + HEX_DIRS[(incomingDir + 1) % 6].q, fromPos.r + HEX_DIRS[(incomingDir + 1) % 6].r);
    const wallLeft = isCrazyWall(fromPos.q + HEX_DIRS[(incomingDir + 5) % 6].q, fromPos.r + HEX_DIRS[(incomingDir + 5) % 6].r);
    if (wallRight && !wallLeft) return dirL;
    if (wallLeft && !wallRight) return dirR;

    const holePos = getHolePos();
    const distR = hexDistance(hexR, holePos);
    const distL = hexDistance(hexL, holePos);
    return distR <= distL ? dirR : dirL;
  }

  if (canR) return dirR;
  if (canL) return dirL;

  const dirRebound = (incomingDir + 3) % 6;
  const hexRebound = { q: fromPos.q + HEX_DIRS[dirRebound].q, r: fromPos.r + HEX_DIRS[dirRebound].r };
  if (isCrazyPlayable(hexRebound.q, hexRebound.r)) return dirRebound;

  const hexSR = { q: fromPos.q + HEX_DIRS[(incomingDir + 1) % 6].q, r: fromPos.r + HEX_DIRS[(incomingDir + 1) % 6].r };
  if (isCrazyPlayable(hexSR.q, hexSR.r)) return (incomingDir + 1) % 6;

  const hexSL = { q: fromPos.q + HEX_DIRS[(incomingDir + 5) % 6].q, r: fromPos.r + HEX_DIRS[(incomingDir + 5) % 6].r };
  if (isCrazyPlayable(hexSL.q, hexSL.r)) return (incomingDir + 5) % 6;

  return null;
}

export function getAllWarpExits() {
  const exitMap = new Map();
  if (currentHole && currentHole.layout) {
    for (const [key, type] of Object.entries(currentHole.layout)) {
      if (type === 'tube_out') {
        const [q, r] = key.split(',').map(Number);
        exitMap.set(`${q},${r}`, { q, r });
      }
    }
  }
  if (currentHole && currentHole.tubeOutPos) {
    const list = Array.isArray(currentHole.tubeOutPos) ? currentHole.tubeOutPos : [currentHole.tubeOutPos];
    for (const pos of list) {
      if (pos && typeof pos.q === 'number' && typeof pos.r === 'number') {
        exitMap.set(`${pos.q},${pos.r}`, { q: pos.q, r: pos.r });
      }
    }
  }
  if (exitMap.size === 0) {
    exitMap.set('2,-16', { q: 2, r: -16 });
  }
  return Array.from(exitMap.values());
}

function isLand(q, r) {
  const terrain = getTerrainAt(q, r);
  return terrain !== 'water' && terrain !== 'trees' && terrain !== 'out_of_bounds' && terrain !== 'bumper';
}

function findNearestLand(targetQ, targetR) {
  if (currentHole && currentHole.isCrazyGolf) {
    if (isCrazyPlayable(targetQ, targetR)) return { q: targetQ, r: targetR };
    for (let radius = 1; radius <= 35; radius++) {
      const candidates = [];
      for (let q = -radius; q <= radius; q++) {
        const r1 = Math.max(-radius, -q - radius);
        const r2 = Math.min(radius, -q + radius);
        for (let r = r1; r <= r2; r++) {
          if (Math.abs(q) === radius || Math.abs(r) === radius || Math.abs(q + r) === radius) {
            const checkQ = targetQ + q;
            const checkR = targetR + r;
            if (isCrazyPlayable(checkQ, checkR)) {
              const distToPrev = hexDistance({ q: checkQ, r: checkR }, playerPos);
              candidates.push({ q: checkQ, r: checkR, distToPrev });
            }
          }
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.distToPrev - b.distToPrev);
        return { q: candidates[0].q, r: candidates[0].r };
      }
    }
    return { ...currentHole.tee };
  }

  if (isLand(targetQ, targetR)) return { q: targetQ, r: targetR };

  for (let radius = 1; radius <= 35; radius++) {
    const candidates = [];
    for (let q = -radius; q <= radius; q++) {
      const r1 = Math.max(-radius, -q - radius);
      const r2 = Math.min(radius, -q + radius);
      for (let r = r1; r <= r2; r++) {
        if (Math.abs(q) === radius || Math.abs(r) === radius || Math.abs(q + r) === radius) {
          const checkQ = targetQ + q;
          const checkR = targetR + r;
          if (isLand(checkQ, checkR)) {
            const distToPrev = hexDistance({ q: checkQ, r: checkR }, playerPos);
            candidates.push({ q: checkQ, r: checkR, distToPrev });
          }
        }
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distToPrev - b.distToPrev);
      return { q: candidates[0].q, r: candidates[0].r };
    }
  }
  return { ...currentHole.tee };
}

function calculateTotalScore() {
  let playedPar = 0;
  let totalStrokes = 0;
  for (let i = 0; i < currentHoles.length; i++) {
    if (roundScores[i] !== null) {
      playedPar += currentHoles[i].par;
      totalStrokes += roundScores[i];
    }
  }
  const diff = totalStrokes - playedPar;
  if (playedPar === 0) return { strokes: 0, diffStr: 'E', diff: 0 };
  if (diff === 0) return { strokes: totalStrokes, diffStr: 'E', diff: 0 };
  return { strokes: totalStrokes, diffStr: diff > 0 ? `+${diff}` : `${diff}`, diff };
}

function updateScoreboard() {
  document.getElementById('hole-number').innerText = `${currentHole.id}/${currentHoles.length}`;
  document.getElementById('hole-par').innerText = currentHole.par;
  document.getElementById('stroke-count').innerText = strokeCount;

  const total = calculateTotalScore();
  document.getElementById('total-score-display').innerText = total.diffStr;
}

export function hasWindmillOnHole() {
  if (!currentHole) return false;
  if (currentHole.layout) {
    return Object.values(currentHole.layout).some(t => t === 'windmill');
  }
  if (currentHole.windmillPos) return true;
  return false;
}

function updateCrazyStatusBar() {
  const bar = document.getElementById('crazy-status-bar');
  if (!bar) return;
  if (!currentHole || !currentHole.isCrazyGolf || !hasWindmillOnHole()) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';

  const windmillPill = document.getElementById('windmill-status-pill');
  if (windmillPill) {
    if (windmillOpen) {
      windmillPill.innerText = '⚙️ Windmill: OPEN (Roll!)';
      windmillPill.className = 'crazy-tag windmill-open';
    } else {
      windmillPill.innerText = '⛔ Windmill: BLOCKED (Wait)';
      windmillPill.className = 'crazy-tag windmill-blocked';
    }
  }
}

function updateClubOptions() {
  const container = document.getElementById('club-pills-container');
  if (!container) return;
  const currentTerrain = getTerrainAt(playerPos.q, playerPos.r);

  container.innerHTML = '';

  if (currentHole && currentHole.isCrazyGolf) {
    if (!CRAZY_CLUBS[currentSelectedClub]) {
      currentSelectedClub = 'tap';
    }

    const crazyList = [
      { id: 'tap', title: 'Tap', sub: 'd6/2 • 1-3' },
      { id: 'flick', title: 'Flick', sub: 'd6 • 1-6' },
      { id: 'hit', title: 'Hit', sub: 'd6+2 • 3-8' },
      { id: 'whack', title: 'Whack', sub: 'd6+4 • 5-10' },
      { id: 'blast', title: 'Blast', sub: 'd6+6 • 7-12' }
    ];

    crazyList.forEach((die) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `club-box ${die.id === currentSelectedClub ? 'active' : ''}`;
      btn.setAttribute('data-club', die.id);
      btn.innerHTML = `
        <span class="club-box-title">${die.title}</span>
        <span class="club-box-sub">${die.sub}</span>
      `;
      container.appendChild(btn);
    });

    updateCrazyStatusBar();
    return;
  }

  updateCrazyStatusBar();

  const isSand = currentTerrain === 'sand';
  const isGreen = currentTerrain === 'green';
  const longIronModifier = getTraditionalClubModifier('longIron', currentTerrain);
  const shortIronModifier = getTraditionalClubModifier('shortIron', currentTerrain);
  const putterRange = getClubRange('putter', currentTerrain);

  const standardClubs = [
    { id: 'driver', title: 'Driver', sub: '1D6+6', allowed: ['tee'] },
    { id: 'longIron', title: 'Long Iron', sub: formatD6Modifier(3 + longIronModifier), allowed: isSand ? [] : ['tee', 'fairway', 'rough', 'deep_rough'] },
    { id: 'shortIron', title: 'Short Iron', sub: formatD6Modifier(shortIronModifier), allowed: ['tee', 'fairway', 'rough', 'deep_rough', 'sand'] },
    { id: 'putter', title: 'Putter', sub: `1D6: ${putterRange.min}${putterRange.max > putterRange.min ? `-${putterRange.max}` : ''}`, allowed: isGreen ? ['green'] : isSand ? [] : ['tee', 'fairway', 'rough'] }
  ];

  // Check if current club is allowed from current terrain
  const currentAllowed = standardClubs.find(c => c.id === currentSelectedClub && c.allowed.includes(currentTerrain));
  if (!currentAllowed) {
    if (isSand) {
      currentSelectedClub = 'shortIron';
    } else if (currentTerrain === 'green') {
      currentSelectedClub = 'putter';
    } else if (currentTerrain === 'fairway') {
      currentSelectedClub = 'longIron';
    } else if (currentTerrain === 'tee') {
      currentSelectedClub = 'driver';
    } else {
      currentSelectedClub = 'shortIron';
    }
  }

  standardClubs.forEach((club) => {
    const isAllowed = club.allowed.includes(currentTerrain);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `club-box ${club.id === currentSelectedClub ? 'active' : ''}`;
    btn.setAttribute('data-club', club.id);
    if (!isAllowed) {
      btn.disabled = true;
    }
    btn.innerHTML = `
      <span class="club-box-title">${club.title}</span>
      <span class="club-box-sub">${club.sub}</span>
    `;
    container.appendChild(btn);
  });
}

function updateControlsState() {
  const rollBtn = document.getElementById('roll-btn');
  const gimmeBtn = document.getElementById('gimme-btn');
  const nextBtn = document.getElementById('next-btn');

  if (isShotAnimating) {
    if (rollBtn) rollBtn.disabled = true;
    if (gimmeBtn) gimmeBtn.disabled = true;
    return;
  }

  const finalTerrain = getTerrainAt(playerPos.q, playerPos.r);
  if (finalTerrain === 'hole') {
    rollBtn.style.display = 'none';
    gimmeBtn.style.display = 'none';
    nextBtn.style.display = 'inline-block';
    
    if (currentHoleIndex === currentHoles.length - 1) {
      nextBtn.innerText = 'ROUND FINISHED: SCORECARD 🏆';
    } else {
      nextBtn.innerText = 'NEXT HOLE →';
    }
    return;
  }

  rollBtn.style.display = 'flex';
  rollBtn.disabled = false;
  nextBtn.style.display = 'none';

  const rollBtnNote = document.getElementById('roll-btn-note');
  if (rollBtnNote) {
    if (!currentHole || !currentHole.isCrazyGolf) {
      if (finalTerrain === 'tee') {
        rollBtnNote.style.display = 'block';
        rollBtnNote.textContent = 'Tee: Driver, Long Iron (+1), or Short Iron';
      } else if (finalTerrain === 'fairway') {
        rollBtnNote.style.display = 'block';
        rollBtnNote.textContent = 'Fairway: Long Iron (+1), Short Iron or Putter (-1)';
      } else if (finalTerrain === 'rough') {
        rollBtnNote.style.display = 'block';
        rollBtnNote.textContent = 'Rough: Long Iron (-1), Short Iron or Putter (-2)';
      } else if (finalTerrain === 'deep_rough') {
        rollBtnNote.style.display = 'block';
        rollBtnNote.textContent = 'Deep rough: Long Iron (-2) or Short Iron (-1)';
      } else if (finalTerrain === 'sand') {
        rollBtnNote.style.display = 'block';
        rollBtnNote.textContent = 'Sand: Short Iron only (-2, min 0)';
      } else if (finalTerrain === 'green') {
        rollBtnNote.style.display = 'block';
        rollBtnNote.textContent = 'Green: Putter only';
      } else {
        rollBtnNote.style.display = 'none';
        rollBtnNote.textContent = '';
      }
    } else {
      rollBtnNote.style.display = 'none';
      rollBtnNote.textContent = '';
    }
  }

  if (isAdjacentToHole(playerPos)) {
    gimmeBtn.style.display = 'inline-block';
    gimmeBtn.disabled = false;
  } else {
    gimmeBtn.style.display = 'none';
  }

  updateClubOptions();
}

function startCourse(courseKey) {
  currentCourseKey = courseKey;
  const courseInfo = COURSES[courseKey];
  currentHoles = courseInfo.holes;
  roundScores = new Array(currentHoles.length).fill(null);
  roundLeaderboardSaveAttempted = false;

  document.getElementById('current-course-badge').innerText = courseInfo.name;
  document.getElementById('modal-title').innerText = `${courseInfo.name} Scorecard`;

  document.getElementById('landing-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';

  loadHole(0);
  requestAnimationFrame(() => {
    resizeCanvas();
    centerOnBall(true);
  });
}

function returnToClubhouse() {
  document.getElementById('scorecard-modal').style.display = 'none';
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('landing-screen').style.display = 'flex';
}

function loadHole(index) {
  if (index >= currentHoles.length) {
    saveCompletedRound();
    showScorecardModal();
    return;
  }

  currentHoleIndex = index;
  currentHole = currentHoles[currentHoleIndex];
  playerPos = { ...currentHole.tee };
  if (!currentHole.isCrazyGolf) {
    currentSelectedClub = 'driver';
  }
  strokeCount = 0;
  shotTrails = [];

  isShotAnimating = false;
  activeShotAnimation = null;
  activeBallDrop = null;
  activeSlopeSlide = null;
  activeCupSink = null;
  activeImpactRipple = null;

  if (currentHole.isCrazyGolf) {
    windmillOpen = false;
  }
  updateCrazyStatusBar();

  updateScoreboard();
  document.getElementById('status-message').innerText = 'Tee shot: Select direction & club, then roll shot.';
  
  renderDieFace('die-dist', '-');
  renderDieFace('die-dir', '-');
  renderDieFace('die-scat', '-');
  document.getElementById('sub-dist').innerText = '0 tiles';
  updateShotControlDisplay('-', 0, true);

  syncAimUI(0);
  updateControlsState();
  resizeCanvas();
  centerOnBall(true);
}

function hexToPixel(q, r) {
  const x = HEX_RADIUS * (3 / 2 * q);
  const y = HEX_RADIUS * Math.sqrt(3) * (r + q / 2);
  return { x: ORIGIN_X + x, y: ORIGIN_Y + y };
}

function drawHex(x, y, type, arrow = null) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    const px = x + HEX_RADIUS * Math.cos(angle);
    const py = y + HEX_RADIUS * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  let fillColor = TERRAIN[type] ? TERRAIN[type].color : TERRAIN.rough.color;
  let strokeColor = '#9ccc65';
  let strokeWidth = 0.8;

  if (type === 'out_of_bounds') {
    fillColor = '#141c22';
    strokeColor = '#1f272e';
    strokeWidth = 0.5;
  } else if (type === 'windmill') {
    fillColor = windmillOpen ? '#00c853' : '#d50000';
    strokeColor = windmillOpen ? '#1b5e20' : '#b71c1c';
    strokeWidth = 1.6;
  } else if (type === 'bumper') {
    fillColor = '#e91e63';
    strokeColor = '#880e4f';
    strokeWidth = 1.5;
  } else if (type === 'tube_in') {
    fillColor = '#00b4d8';
    strokeColor = '#0077b6';
    strokeWidth = 1.4;
  } else if (type === 'tube_out') {
    fillColor = '#76ff03';
    strokeColor = '#33691e';
    strokeWidth = 1.4;
  } else if (type === 'ramp') {
    fillColor = '#ffd600';
    strokeColor = '#f57f17';
    strokeWidth = 1.4;
  } else if (type === 'crazy_fairway') {
    strokeColor = '#004d40';
  }

  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (type === 'trees') {
    ctx.fillStyle = '#2e7d32';
    ctx.font = '8px monospace';
    ctx.fillText('▲', x, y);
  } else if (type === 'bumper') {
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#e91e63';
    ctx.font = 'bold 6px monospace';
    ctx.fillText('●', x, y);
  } else if (type === 'windmill') {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(windmillOpen ? '✢' : '✖', x, y);
  } else if (type === 'tube_in') {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('🌀', x, y);
  } else if (type === 'tube_out') {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('✨', x, y);
  } else if (type === 'ramp') {
    ctx.fillStyle = '#b78103';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('▲▲', x, y);
  } else if (arrow !== null) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    const arrowChars = ['↑', '↗', '↘', '↓', '↙', '↖'];
    const symbol = typeof arrow === 'number' && arrowChars[arrow] ? arrowChars[arrow] : '↑';
    ctx.fillText(symbol, x, y);
  }
}

// ==========================================
// SHOT FLIGHT ANIMATION & CURVE SYSTEM
// ==========================================

let isShotAnimating = false;
let activeShotAnimation = null;
let activeBallDrop = null;
let activeSlopeSlide = null;
let activeCupSink = null;
let activeImpactRipple = null;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPoint(p1, p2, t) {
  return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

function getCubicBezierPoint(p0, p1, p2, p3, t) {
  const p01 = lerpPoint(p0, p1, t);
  const p12 = lerpPoint(p1, p2, t);
  const p23 = lerpPoint(p2, p3, t);
  const p012 = lerpPoint(p01, p12, t);
  const p123 = lerpPoint(p12, p23, t);
  const pt = lerpPoint(p012, p123, t);
  return { pt, p01, p012 };
}

function drawArrowHead(tipX, tipY, angle, color, len = 7) {
  const arrowAngle = Math.PI / 6;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - len * Math.cos(angle - arrowAngle), tipY - len * Math.sin(angle - arrowAngle));
  ctx.lineTo(tipX - len * Math.cos(angle + arrowAngle), tipY - len * Math.sin(angle + arrowAngle));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function buildShotCurve(pStart, pAimed, pLanding, hasScatter) {
  const P0 = pStart;
  const P3 = pLanding;
  const isCurved = hasScatter && (Math.abs(pAimed.x - pLanding.x) > 1 || Math.abs(pAimed.y - pLanding.y) > 1);
  if (!isCurved) {
    return {
      p0: P0,
      p1: { x: P0.x + (P3.x - P0.x) * 0.333, y: P0.y + (P3.y - P0.y) * 0.333 },
      p2: { x: P0.x + (P3.x - P0.x) * 0.667, y: P0.y + (P3.y - P0.y) * 0.667 },
      p3: P3,
      isCurved: false
    };
  }

  // Shot with scatter: starts quite straight along aim line, then curls towards landing
  // P1 continues straight along the aim vector so the shot launches in the chosen direction
  const P1 = {
    x: P0.x + (pAimed.x - P0.x) * 0.55,
    y: P0.y + (pAimed.y - P0.y) * 0.55
  };
  // P2 bends gently towards the landing point for a smooth aerodynamic curl
  const P2 = {
    x: pAimed.x + (P3.x - pAimed.x) * 0.45,
    y: pAimed.y + (P3.y - pAimed.y) * 0.45
  };

  return {
    p0: P0,
    p1: P1,
    p2: P2,
    p3: P3,
    isCurved: true
  };
}

function animateShotFlight(curve, club, distanceTiles, aimedPx = null) {
  return new Promise((resolve) => {
    const isPutter = club === 'putter';
    const distPx = Math.hypot(curve.p3.x - curve.p0.x, curve.p3.y - curve.p0.y);
    const maxLift = isPutter ? 0 : Math.min(28, Math.max(8, distPx * 0.14));
    const duration = Math.min(950, Math.max(460, distanceTiles * 70 + 260));

    const startTime = performance.now();
    activeShotAnimation = {
      curve,
      club,
      aimedPx,
      progress: 0,
      ballPos: curve.p0,
      altitude: 0,
      maxLift,
      subPoints: null
    };

    function step(now) {
      const elapsed = now - startTime;
      const rawT = Math.min(1, elapsed / duration);
      // Ease-out quadratic for aerodynamic flight deceleration into the landing
      const t = rawT * (2 - rawT);

      const { pt, p01, p012 } = getCubicBezierPoint(curve.p0, curve.p1, curve.p2, curve.p3, t);
      const altitude = isPutter ? 0 : Math.sin(t * Math.PI);

      activeShotAnimation.progress = t;
      activeShotAnimation.ballPos = pt;
      activeShotAnimation.altitude = altitude;
      activeShotAnimation.subPoints = { p01, p012, pt };

      // Soft camera tracking if ball approaches viewport boundaries
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;
      const screenX = pt.x * camera.scale + camera.panX;
      const screenY = pt.y * camera.scale + camera.panY;
      const margin = 48;
      if (screenX < margin || screenX > cssW - margin || screenY < margin || screenY > cssH - margin) {
        camera.panX += (cssW / 2 - pt.x * camera.scale - camera.panX) * 0.08;
        camera.panY += (cssH / 2 - pt.y * camera.scale - camera.panY) * 0.08;
        clampCamera();
      }

      render();

      if (rawT < 1) {
        requestAnimationFrame(step);
      } else {
        // Touchdown landing impact
        activeShotAnimation.progress = 1;
        activeShotAnimation.altitude = 0;
        activeShotAnimation.ballPos = curve.p3;
        activeShotAnimation.subPoints = null;

        animateTouchdownRipple(curve.p3).then(() => {
          activeShotAnimation = null;
          resolve();
        });
      }
    }

    requestAnimationFrame(step);
  });
}

function animateTouchdownRipple(pos) {
  return new Promise((resolve) => {
    const duration = 160;
    const start = performance.now();
    activeImpactRipple = { x: pos.x, y: pos.y, progress: 0 };

    function rip(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      activeImpactRipple.progress = t;
      render();
      if (t < 1) {
        requestAnimationFrame(rip);
      } else {
        activeImpactRipple = null;
        render();
        resolve();
      }
    }
    requestAnimationFrame(rip);
  });
}

function animateBallDrop(fromPx, toPx) {
  return new Promise((resolve) => {
    const duration = 340;
    const start = performance.now();
    activeBallDrop = {
      from: fromPx,
      to: toPx,
      pos: fromPx,
      altitude: 0,
      progress: 0
    };

    function dropStep(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const ease = t * (2 - t);
      const x = fromPx.x + (toPx.x - fromPx.x) * ease;
      const y = fromPx.y + (toPx.y - fromPx.y) * ease;
      const altitude = Math.sin(t * Math.PI);

      activeBallDrop.pos = { x, y };
      activeBallDrop.altitude = altitude;
      activeBallDrop.progress = t;
      render();

      if (t < 1) {
        requestAnimationFrame(dropStep);
      } else {
        activeBallDrop = null;
        render();
        resolve();
      }
    }
    requestAnimationFrame(dropStep);
  });
}

function animateSlopeSlide(fromPx, toPx) {
  return new Promise((resolve) => {
    const duration = 300;
    const start = performance.now();
    activeSlopeSlide = {
      from: fromPx,
      to: toPx,
      pos: fromPx,
      progress: 0
    };

    function slideStep(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const ease = t * (2 - t);
      const x = fromPx.x + (toPx.x - fromPx.x) * ease;
      const y = fromPx.y + (toPx.y - fromPx.y) * ease;

      activeSlopeSlide.pos = { x, y };
      activeSlopeSlide.progress = t;
      render();

      if (t < 1) {
        requestAnimationFrame(slideStep);
      } else {
        activeSlopeSlide = null;
        render();
        resolve();
      }
    }
    requestAnimationFrame(slideStep);
  });
}

function animateCupSink(cupPx) {
  return new Promise((resolve) => {
    const duration = 240;
    const start = performance.now();
    activeCupSink = { pos: cupPx, progress: 0 };

    function sinkStep(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      activeCupSink.progress = t;
      render();

      if (t < 1) {
        requestAnimationFrame(sinkStep);
      } else {
        activeCupSink = null;
        render();
        resolve();
      }
    }
    requestAnimationFrame(sinkStep);
  });
}

async function animateCrazyLegs(legs) {
  for (let l = 0; l < legs.length; l++) {
    const leg = legs[l];
    const pStart = hexToPixel(leg.start.q, leg.start.r);
    const pAimed = hexToPixel(leg.aimed.q, leg.aimed.r);
    const pLanding = hexToPixel(leg.end.q, leg.end.r);

    if (leg.isWarpIn) {
      const curve = buildShotCurve(pStart, pAimed, pLanding, false);
      await animateShotFlight(curve, 'putter', Math.max(1, leg.dist), pAimed);
      await animateCupSink(pLanding);
      await new Promise(r => setTimeout(r, 80));
      if (leg.warpOut) {
        playerPos = { q: leg.warpOut.q, r: leg.warpOut.r };
        centerOnBall(false);
        render();
        await animateTouchdownRipple(hexToPixel(leg.warpOut.q, leg.warpOut.r));
      }
    } else {
      const curve = buildShotCurve(pStart, pAimed, pLanding, leg.hasScatter);
      await animateShotFlight(curve, 'putter', Math.max(1, leg.dist), pAimed);
      if (leg.isRicochet) {
        await animateTouchdownRipple(pLanding);
      }
    }
  }
}
const animateCrazyWaypoints = animateCrazyLegs;

function drawTrailSegment(p1, p2, color, width, isDashed = false, showArrow = true) {
  if (p1.x === p2.x && p1.y === p2.y) return;
  ctx.save();
  ctx.beginPath();
  if (isDashed) {
    ctx.setLineDash([4, 3]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  if (showArrow) {
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    drawArrowHead(p2.x, p2.y, angle, color, 7);
  }
  ctx.restore();
}

function render() {
  resizeCanvas();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  // Apply camera zoom & pan
  ctx.translate(camera.panX, camera.panY);
  ctx.scale(camera.scale, camera.scale);

  // Compute world coordinates for visible viewport culling
  const viewMinX = -camera.panX / camera.scale - 25;
  const viewMaxX = (cssWidth - camera.panX) / camera.scale + 25;
  const viewMinY = -camera.panY / camera.scale - 25;
  const viewMaxY = (cssHeight - camera.panY) / camera.scale + 25;

  for (let row = GRID_ROW_MIN; row <= GRID_ROW_MAX; row++) {
    for (let q = GRID_Q_MIN; q <= GRID_Q_MAX; q++) {
      const r = gridRowToAxialR(q, row);
      const { x, y } = hexToPixel(q, r);
      if (x >= viewMinX && x <= viewMaxX && y >= viewMinY && y <= viewMaxY) {
        const type = getTerrainAt(q, r);
        const arrow = currentHole.slopeArrows[`${q},${r}`] ?? null;
        drawHex(x, y, type, arrow);
      }
    }
  }

  // Draw Shot Trails (Pencil path from where ball lay to where it finished)
  shotTrails.forEach((trail, idx) => {
    const isLatest = idx === shotTrails.length - 1;
    ctx.save();
    ctx.globalAlpha = isLatest ? 0.95 : 0.35;

    const pStart = hexToPixel(trail.start.q, trail.start.r);
    const pAimed = hexToPixel(trail.aimed.q, trail.aimed.r);

    // 1. Origin marker where ball lay
    ctx.beginPath();
    ctx.arc(pStart.x, pStart.y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#b71c1c';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (trail.legs && trail.legs.length > 1) {
      // Draw path through interactive obstacles and multiple legs
      for (let l = 0; l < trail.legs.length; l++) {
        const leg = trail.legs[l];
        const p1 = hexToPixel(leg.start.q, leg.start.r);
        const pAim = hexToPixel(leg.aimed.q, leg.aimed.r);
        const p2 = hexToPixel(leg.end.q, leg.end.r);
        const isRicochet = leg.isRicochet;
        const color = leg.isWarpIn ? '#00e5ff' : isRicochet ? '#e91e63' : '#d32f2f';
        const curve = buildShotCurve(p1, pAim, p2, leg.hasScatter);

        ctx.beginPath();
        ctx.moveTo(curve.p0.x, curve.p0.y);
        ctx.bezierCurveTo(curve.p1.x, curve.p1.y, curve.p2.x, curve.p2.y, curve.p3.x, curve.p3.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.stroke();

        if (isRicochet) {
          ctx.beginPath();
          ctx.arc(p2.x, p2.y, 3, 0, 2 * Math.PI);
          ctx.fillStyle = '#e91e63';
          ctx.fill();
        }

        if (l === trail.legs.length - 1) {
          const tanX = curve.p3.x - curve.p2.x;
          const tanY = curve.p3.y - curve.p2.y;
          const angle = Math.atan2(tanY, tanX);
          drawArrowHead(curve.p3.x, curve.p3.y, angle, color, 7);
        }
      }
    } else if (trail.curve) {
      // Draw smooth Bezier curve for shot flight (trend line)
      ctx.beginPath();
      ctx.moveTo(trail.curve.p0.x, trail.curve.p0.y);
      ctx.bezierCurveTo(
        trail.curve.p1.x, trail.curve.p1.y,
        trail.curve.p2.x, trail.curve.p2.y,
        trail.curve.p3.x, trail.curve.p3.y
      );
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Touchdown direction arrowhead
      const tanX = trail.curve.p3.x - trail.curve.p2.x;
      const tanY = trail.curve.p3.y - trail.curve.p2.y;
      const angle = Math.atan2(tanY, tanX);
      drawArrowHead(trail.curve.p3.x, trail.curve.p3.y, angle, '#d32f2f', 7);

      // If scatter occurred, subtle dashed aim guide to original aimed point
      if (trail.hasScatter && trail.aimed) {
        const pAim = hexToPixel(trail.aimed.q, trail.aimed.r);
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = 'rgba(245, 124, 0, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(trail.curve.p0.x, trail.curve.p0.y);
        ctx.lineTo(pAim.x, pAim.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pAim.x, pAim.y, 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#f57c00';
        ctx.fill();
        ctx.restore();
      }
    } else {
      // Fallback: Trajectory line for roll + modifiers (solid crimson line)
      const hasScatterLine = trail.hasScatter && trail.scatter && (trail.scatter.q !== trail.aimed.q || trail.scatter.r !== trail.aimed.r);
      drawTrailSegment(pStart, pAimed, '#d32f2f', 2.4, false, !hasScatterLine);

      // Scatter line (dashed amber line)
      if (hasScatterLine) {
        const pScatter = hexToPixel(trail.scatter.q, trail.scatter.r);
        ctx.beginPath();
        ctx.arc(pAimed.x, pAimed.y, 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#f57c00';
        ctx.fill();

        drawTrailSegment(pAimed, pScatter, '#f57c00', 2, true, true);
      }
    }

    // 4. Slope Slide (dotted cyan line)
    if (trail.slopeFrom && trail.slopeTo) {
      const pSlopeFrom = hexToPixel(trail.slopeFrom.q, trail.slopeFrom.r);
      const pSlopeTo = hexToPixel(trail.slopeTo.q, trail.slopeTo.r);
      drawTrailSegment(pSlopeFrom, pSlopeTo, '#0288d1', 1.8, true, true);
    }

    // 5. Hazard landing marker and drop path (if water or trees)
    if (trail.hazard && trail.hazardPos && trail.dropPos) {
      const pHazard = hexToPixel(trail.hazardPos.q, trail.hazardPos.r);
      const pDrop = hexToPixel(trail.dropPos.q, trail.dropPos.r);

      // Red X marker on hazard tile
      ctx.strokeStyle = '#b71c1c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pHazard.x - 3.5, pHazard.y - 3.5);
      ctx.lineTo(pHazard.x + 3.5, pHazard.y + 3.5);
      ctx.moveTo(pHazard.x + 3.5, pHazard.y - 3.5);
      ctx.lineTo(pHazard.x - 3.5, pHazard.y + 3.5);
      ctx.stroke();

      // Drop connection line
      drawTrailSegment(pHazard, pDrop, '#b71c1c', 1.5, true, true);
    }

    ctx.restore();
  });

  // Active shot flight trail (drawn in real-time behind the flying ball)
  if (activeShotAnimation && activeShotAnimation.curve) {
    const c = activeShotAnimation.curve;
    ctx.save();
    ctx.globalAlpha = 0.95;

    // Origin marker
    ctx.beginPath();
    ctx.arc(c.p0.x, c.p0.y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#b71c1c';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Growing Bezier trail
    if (activeShotAnimation.subPoints) {
      const { p01, p012, pt } = activeShotAnimation.subPoints;
      ctx.beginPath();
      ctx.moveTo(c.p0.x, c.p0.y);
      ctx.bezierCurveTo(p01.x, p01.y, p012.x, p012.y, pt.x, pt.y);
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Subtle aim guide if curving with scatter
    if (c.isCurved && activeShotAnimation.aimedPx) {
      const pAim = activeShotAnimation.aimedPx;
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(245, 124, 0, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(c.p0.x, c.p0.y);
      ctx.lineTo(pAim.x, pAim.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(pAim.x, pAim.y, 2, 0, 2 * Math.PI);
      ctx.fillStyle = '#f57c00';
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  const finalTerrain = getTerrainAt(playerPos.q, playerPos.r);

  // Aiming Line Preview & Range Indicators (only when hole is active and ball is at rest)
  if (finalTerrain !== 'hole' && !isShotAnimating) {
    const aimDir = getSelectedAimDir();
    const currentClub = getSelectedClub();
    const currentPosPx = hexToPixel(playerPos.q, playerPos.r);
    const range = getClubRange(currentClub, finalTerrain);

    // Directional compass dots around the ball
    for (let d = 0; d < 6; d++) {
      const pTick = hexToPixel(playerPos.q + HEX_DIRS[d].q * 0.7, playerPos.r + HEX_DIRS[d].r * 0.7);
      ctx.beginPath();
      ctx.arc(pTick.x, pTick.y, d === aimDir ? 2.5 : 1.2, 0, 2 * Math.PI);
      ctx.fillStyle = d === aimDir ? '#1b5e20' : 'rgba(0,0,0,0.22)';
      ctx.fill();
    }

    if (currentHole && currentHole.isCrazyGolf) {
      // Step-by-step raycast for crazy golf: stops and reflects off bumper rails!
      let curr = { ...playerPos };
      let dir = aimDir;
      const pts = [currentPosPx];
      let bouncePt = null;

      for (let s = 1; s <= range.max; s++) {
        const next = { q: curr.q + HEX_DIRS[dir].q, r: curr.r + HEX_DIRS[dir].r };
        if (isCrazyWall(next.q, next.r)) {
          bouncePt = hexToPixel(curr.q, curr.r);
          const ref = getBumperReflectionDir(curr, dir);
          if (ref !== null && s < range.max) {
            dir = ref;
            const nextAfterRef = { q: curr.q + HEX_DIRS[dir].q, r: curr.r + HEX_DIRS[dir].r };
            if (isCrazyPlayable(nextAfterRef.q, nextAfterRef.r)) {
              curr = nextAfterRef;
              pts.push(hexToPixel(curr.q, curr.r));
            } else {
              break;
            }
          } else {
            break;
          }
        } else if (getTerrainAt(next.q, next.r) === 'windmill') {
          if (!windmillOpen) {
            bouncePt = hexToPixel(curr.q, curr.r);
            break;
          } else {
            curr = next;
            pts.push(hexToPixel(curr.q, curr.r));
            if (s === range.max) {
              const push = { q: curr.q + HEX_DIRS[dir].q, r: curr.r + HEX_DIRS[dir].r };
              if (isCrazyPlayable(push.q, push.r)) {
                curr = push;
                pts.push(hexToPixel(curr.q, curr.r));
              }
            }
          }
        } else if (getTerrainAt(next.q, next.r) === 'tube_in') {
          curr = next;
          pts.push(hexToPixel(curr.q, curr.r));
          break;
        } else {
          curr = next;
          pts.push(hexToPixel(curr.q, curr.r));
        }
      }

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.strokeStyle = '#00897b';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      if (bouncePt) {
        ctx.beginPath();
        ctx.arc(bouncePt.x, bouncePt.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#e91e63';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const lastPt = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(lastPt.x, lastPt.y, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#004d40';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else {
      const minQ = playerPos.q + HEX_DIRS[aimDir].q * range.min;
      const minR = playerPos.r + HEX_DIRS[aimDir].r * range.min;
      const minPx = hexToPixel(minQ, minR);

      const maxQ = playerPos.q + HEX_DIRS[aimDir].q * range.max;
      const maxR = playerPos.r + HEX_DIRS[aimDir].r * range.max;
      const maxPx = hexToPixel(maxQ, maxR);

      // Dotted flight trajectory
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(currentPosPx.x, currentPosPx.y);
      ctx.lineTo(minPx.x, minPx.y);
      ctx.strokeStyle = '#2e7d32';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Solid landing range band
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.moveTo(minPx.x, minPx.y);
      ctx.lineTo(maxPx.x, maxPx.y);
      ctx.strokeStyle = '#1b5e20';
      ctx.lineWidth = 2.8;
      ctx.stroke();

      // Max distance target crosshair / dot
      ctx.beginPath();
      ctx.arc(maxPx.x, maxPx.y, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#1b5e20';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Touchdown Impact Ripple
  if (activeImpactRipple) {
    const ripR = 4 + activeImpactRipple.progress * 13;
    const alpha = (1 - activeImpactRipple.progress) * 0.7;
    ctx.beginPath();
    ctx.arc(activeImpactRipple.x, activeImpactRipple.y, ripR, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Render Ball
  if (activeShotAnimation) {
    const alt = activeShotAnimation.altitude;
    const lift = alt * activeShotAnimation.maxLift;
    const bx = activeShotAnimation.ballPos.x;
    const by = activeShotAnimation.ballPos.y;

    // Ground Shadow beneath the ball
    if (alt > 0) {
      ctx.beginPath();
      ctx.ellipse(bx + alt * 2.5, by + alt * 1.5, 4.2 + (1 - alt) * 0.6, 2.2 + (1 - alt) * 0.5, 0, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + (1 - alt) * 0.16})`;
      ctx.fill();
    }

    // Flying Ball with altitude elevation and 3D specular highlight
    const ballR = 4 + alt * 1.6;
    ctx.beginPath();
    ctx.arc(bx, by - lift, ballR, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (alt > 0.1) {
      ctx.beginPath();
      ctx.arc(bx - ballR * 0.25, by - lift - ballR * 0.25, ballR * 0.35, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
    }
  } else if (activeBallDrop) {
    const alt = activeBallDrop.altitude;
    const lift = alt * 16;
    const bx = activeBallDrop.pos.x;
    const by = activeBallDrop.pos.y;

    // Ground Shadow
    ctx.beginPath();
    ctx.ellipse(bx + alt * 2, by + alt * 1.2, 4, 2, 0, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + (1 - alt) * 0.14})`;
    ctx.fill();

    // Hopping Ball
    ctx.beginPath();
    ctx.arc(bx, by - lift, 4 + alt * 1.2, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (activeSlopeSlide) {
    const bx = activeSlopeSlide.pos.x;
    const by = activeSlopeSlide.pos.y;
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (activeCupSink) {
    const p = activeCupSink.progress;
    const r = Math.max(0, 4 * (1 - p));
    if (r > 0.1) {
      ctx.beginPath();
      ctx.arc(activeCupSink.pos.x, activeCupSink.pos.y + p * 2, r, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255, 255, 255, ${1 - p * 0.7})`;
      ctx.fill();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else {
    // Standard resting ball
    const currentPosPx = hexToPixel(playerPos.q, playerPos.r);
    ctx.beginPath();
    ctx.arc(currentPosPx.x, currentPosPx.y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

function resizeCanvas() {
  const wrapper = document.getElementById('canvas-wrapper');
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();
  const width = Math.max(260, Math.floor(rect.width));
  const height = Math.max(160, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const targetW = Math.floor(width * dpr);
  const targetH = Math.floor(height * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  }
}

function updateZoomUI() {
  const indicator = document.getElementById('zoom-level-indicator');
  if (indicator) {
    indicator.innerText = `${Math.round(camera.scale * 100)}%`;
  }
}

function clampCamera() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;

  const boardBounds = getBoardPixelBounds();
  const worldMinX = boardBounds.minX;
  const worldMaxX = boardBounds.maxX;
  const worldMinY = boardBounds.minY;
  const ballPx = (playerPos && playerPos.q !== undefined) ? hexToPixel(playerPos.q, playerPos.r) : { x: 180, y: 395 };
  const worldMaxY = Math.max(boardBounds.maxY, ballPx.y + 140);

  const minPanX = cssWidth - worldMaxX * camera.scale - 60;
  const maxPanX = -worldMinX * camera.scale + 60;
  const minPanY = cssHeight - worldMaxY * camera.scale - 60;
  const maxPanY = -worldMinY * camera.scale + 60;

  if (minPanX < maxPanX) {
    camera.panX = Math.min(maxPanX, Math.max(minPanX, camera.panX));
  } else {
    camera.panX = (cssWidth - (worldMinX + worldMaxX) * camera.scale) / 2;
  }

  if (minPanY < maxPanY) {
    camera.panY = Math.min(maxPanY, Math.max(minPanY, camera.panY));
  } else {
    camera.panY = (cssHeight - (worldMinY + worldMaxY) * camera.scale) / 2;
  }
}

function fitHole() {
  resizeCanvas();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;

  const { minX, maxX, minY, maxY } = getBoardPixelBounds(16);

  const boxW = Math.max(140, maxX - minX);
  const boxH = Math.max(180, maxY - minY);

  const availW = Math.max(140, cssWidth - 24);
  const availH = Math.max(140, cssHeight - 24);

  const scaleX = availW / boxW;
  const scaleY = availH / boxH;
  let targetScale = Math.min(scaleX, scaleY);
  targetScale = Math.max(camera.minScale, Math.min(1.35, targetScale));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  camera.scale = targetScale;
  camera.panX = cssWidth / 2 - centerX * camera.scale;
  camera.panY = cssHeight / 2 - centerY * camera.scale;

  clampCamera();
  updateZoomUI();
  render();
}

function getBoardPixelBounds(padding = HEX_RADIUS) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let q = GRID_Q_MIN; q <= GRID_Q_MAX; q++) {
    for (const row of [GRID_ROW_MIN, GRID_ROW_MAX]) {
      const { x, y } = hexToPixel(q, gridRowToAxialR(q, row));
      minX = Math.min(minX, x - HEX_RADIUS);
      maxX = Math.max(maxX, x + HEX_RADIUS);
      minY = Math.min(minY, y - HEX_RADIUS * Math.sqrt(3) / 2);
      maxY = Math.max(maxY, y + HEX_RADIUS * Math.sqrt(3) / 2);
    }
  }

  return {
    minX: minX - padding,
    maxX: maxX + padding,
    minY: minY - padding,
    maxY: maxY + padding
  };
}

function centerOnBall(positionAtBottom = true) {
  resizeCanvas();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;

  camera.scale = 1;

  const ballPx = hexToPixel(playerPos.q, playerPos.r);
  camera.panX = cssWidth / 2 - ballPx.x * camera.scale;

  if (positionAtBottom) {
    // Position the ball towards the bottom of the view (~78% down), leaving fairway and green in front
    const targetY = cssHeight * 0.78;
    camera.panY = targetY - ballPx.y * camera.scale;
  } else {
    camera.panY = cssHeight / 2 - ballPx.y * camera.scale;
  }

  clampCamera();
  updateZoomUI();
  render();
}

function zoomAtPoint(factor, screenX, screenY) {
  const oldScale = camera.scale;
  let newScale = oldScale * factor;
  newScale = Math.max(camera.minScale, Math.min(camera.maxScale, newScale));
  if (Math.abs(newScale - oldScale) < 0.001) return;

  camera.panX = screenX - (screenX - camera.panX) * (newScale / oldScale);
  camera.panY = screenY - (screenY - camera.panY) * (newScale / oldScale);
  camera.scale = newScale;

  clampCamera();
  updateZoomUI();
  render();
}

function zoomBy(factor) {
  resizeCanvas();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;
  zoomAtPoint(factor, cssWidth / 2, cssHeight / 2);
}

function keepBallInView() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;
  const ballPx = hexToPixel(playerPos.q, playerPos.r);
  const ballScreenX = ballPx.x * camera.scale + camera.panX;
  const ballScreenY = ballPx.y * camera.scale + camera.panY;

  const margin = 35;
  if (ballScreenX < margin || ballScreenX > cssWidth - margin ||
      ballScreenY < margin || ballScreenY > cssHeight - margin) {
    centerOnBall();
  }
}

function dismissScrollHint() {
  const hint = document.getElementById('hole-scroll-hint');
  if (hint && hint.style.opacity !== '0') {
    hint.style.opacity = '0';
    setTimeout(() => { if (hint) hint.style.display = 'none'; }, 550);
  }
}

// Minimap & Key removed per UI specification
export function toggleMinimap() {}
export function renderMinimap() {}
export function toggleKey() {}
export function updateKeyDisplay() {}

export function renderDieFace(elementId, value) {
  const el = typeof elementId === 'string' ? document.getElementById(elementId) : elementId;
  if (!el) return;
  el.innerHTML = '';

  if (value === '-' || value === null || value === undefined || value === '' || value === 'None') {
    el.className = 'die die-empty';
    el.innerText = '-';
    return;
  }

  const num = parseInt(value, 10);
  if (isNaN(num) || num < 1) {
    el.className = 'die die-empty';
    el.innerText = '-';
    return;
  }

  if (num > 6) {
    el.className = 'die die-numeral';
    el.innerText = String(num);
    return;
  }

  el.className = `die die-pip-face die-val-${num}`;

  const pipCoords = {
    1: [[2, 2]],
    2: [[1, 3], [3, 1]],
    3: [[1, 3], [2, 2], [3, 1]],
    4: [[1, 1], [1, 3], [3, 1], [3, 3]],
    5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
    6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]]
  };

  const coords = pipCoords[num] || [];
  for (const [row, col] of coords) {
    const pip = document.createElement('span');
    pip.className = 'die-pip';
    pip.style.gridRow = String(row);
    pip.style.gridColumn = String(col);
    el.appendChild(pip);
  }
}

export function getShotControlNote(dirRoll, scatDist) {
  if (!dirRoll || dirRoll === '-' || scatDist === 0 || scatDist === '0' || scatDist === 'Pinned') {
    return 'On target (no scatter)';
  }

  // dirRoll: 1 -> N (0), 2 -> NE (1), 3 -> SE (2), 4 -> S (3), 5 -> SW (4), 6 -> NW (5)
  const dirIndex = (parseInt(dirRoll, 10) - 1 + 6) % 6;

  // Directions:
  // N = 0, NE = 1, SE = 2, S = 3, SW = 4, NW = 5
  const isOver = (dirIndex === 0 || dirIndex === 5 || dirIndex === 1); // N, NW, NE
  const isUnder = (dirIndex === 3 || dirIndex === 2 || dirIndex === 4); // S, SE, SW
  const isSliced = (dirIndex === 1 || dirIndex === 2); // NE, SE
  const isHooked = (dirIndex === 5 || dirIndex === 4); // NW, SW

  if (isOver && isHooked) {
    return 'over-hit, hooked shot';
  } else if (isOver && isSliced) {
    return 'over-hit, sliced shot';
  } else if (isOver) {
    return 'over-hit shot';
  } else if (isUnder && isHooked) {
    return 'under-hit, hooked shot';
  } else if (isUnder && isSliced) {
    return 'under-hit, sliced shot';
  } else if (isUnder) {
    return 'under-hit shot';
  }
  return 'On target';
}

export function updateShotControlDisplay(dirRoll, scatDist, isPure = false) {
  const subControl = document.getElementById('sub-control');
  if (!subControl) return;

  if (isPure || !dirRoll || dirRoll === '-' || scatDist === 0 || scatDist === '0' || scatDist === 'Pinned') {
    subControl.innerHTML = '<span class="control-note">On target (no scatter)</span>';
    return;
  }

  const note = getShotControlNote(dirRoll, scatDist);
  const distNumber = typeof scatDist === 'number' ? scatDist : parseInt(scatDist, 10) || 1;
  const distLabel = distNumber === 1 ? '1 tile' : `${distNumber} tiles`;

  subControl.innerHTML = `<span class="control-note">${note}</span> <span class="control-dist-tag">(${distLabel})</span>`;
}

export function getDistanceExplanation(club, distRoll, effectiveRoll, baseDistance, currentTerrain, isCrazyGolf = false, clubConfig = null) {
  if (isCrazyGolf) {
    if (clubConfig) {
      if (clubConfig.id === 'tap') return `d6: ${distRoll} ÷ 2 = distance ${baseDistance}`;
      if (clubConfig.id === 'flick') return `d6: ${distRoll} = distance ${baseDistance}`;
      if (clubConfig.id === 'hit') return `d6: ${distRoll} + 2 = distance ${baseDistance}`;
      if (clubConfig.id === 'whack') return `d6: ${distRoll} + 4 = distance ${baseDistance}`;
      if (clubConfig.id === 'blast') return `d6: ${distRoll} + 6 = distance ${baseDistance}`;
    }
    return baseDistance === 1 ? '1 tile' : `${baseDistance} tiles`;
  }

  // Traditional Golf
  if (currentTerrain === 'sand') {
    return `${distRoll}-2 = distance ${baseDistance} (min 0)`;
  }

  const modifier = getTraditionalClubModifier(club, currentTerrain);
  const baseModifier = club === 'driver' ? 6 : club === 'longIron' ? 3 : 0;
  if (club === 'putter') {
    const putterRoll = distRoll <= 2 ? 1 : distRoll <= 4 ? 2 : 3;
    const adjustment = modifier === 0 ? '' : ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}`;
    return `Putter roll ${distRoll} (${putterRoll})${adjustment} = distance ${baseDistance} (min 1)`;
  }

  const totalModifier = baseModifier + modifier;
  const formula = totalModifier === 0
    ? `${distRoll}`
    : `${distRoll}${totalModifier > 0 ? '+' : ''}${totalModifier}`;
  const roughMinimum = currentTerrain === 'rough' || currentTerrain === 'deep_rough';
  return `${formula} = distance ${baseDistance}${roughMinimum ? ' (min 1)' : ''}`;
}

function animateDie(elementId, finalValue, duration = 400, maxSides = 6) {
  return new Promise((resolve) => {
    const el = typeof elementId === 'string' ? document.getElementById(elementId) : elementId;
    if (!el) {
      resolve();
      return;
    }
    el.classList.add('rolling');
    const interval = setInterval(() => {
      const tempVal = Math.floor(Math.random() * Math.min(maxSides, 6)) + 1;
      renderDieFace(el, tempVal);
    }, 60);

    setTimeout(() => {
      clearInterval(interval);
      el.classList.remove('rolling');
      renderDieFace(el, finalValue);
      resolve();
    }, duration);
  });
}

function recordHoleFinish() {
  roundScores[currentHoleIndex] = strokeCount;
  updateScoreboard();
}

async function executeShot() {
  if (isShotAnimating) return;
  isShotAnimating = true;

  const club = getSelectedClub();
  const aimDir = getSelectedAimDir();
  const currentTerrain = getTerrainAt(playerPos.q, playerPos.r);

  const rollBtn = document.getElementById('roll-btn');
  const gimmeBtn = document.getElementById('gimme-btn');
  if (rollBtn) rollBtn.disabled = true;
  if (gimmeBtn) gimmeBtn.disabled = true;

  const shotStart = { q: playerPos.q, r: playerPos.r };

  // ==========================================
  // CRAZY GOLF MODE SHOT RESOLUTION
  // ==========================================
  if (currentHole && currentHole.isCrazyGolf) {
    const clubConfig = CRAZY_CLUBS[club] || CRAZY_CLUBS.tap;

    // 1. Distance Die Roll (standard d6 for all putter strokes)
    const distRoll = Math.floor(Math.random() * 6) + 1;
    await animateDie('die-dist', distRoll, 400, 6);

    let baseDistance = 1;
    if (clubConfig.id === 'tap') {
      baseDistance = Math.ceil(distRoll / 2); // 1-3 hexes
    } else if (clubConfig.id === 'flick') {
      baseDistance = distRoll; // 1-6 hexes
    } else if (clubConfig.id === 'hit') {
      baseDistance = distRoll + 2; // 3-8 hexes
    } else if (clubConfig.id === 'whack') {
      baseDistance = distRoll + 4; // 5-10 hexes
    } else if (clubConfig.id === 'blast') {
      baseDistance = distRoll + 6; // 7-12 hexes
    }

    let obstacleNotes = [];

    // Check if stroke begins resting on a speed ramp (+2 boost!)
    if (getTerrainAt(shotStart.q, shotStart.r) === 'ramp') {
      baseDistance += 2;
      obstacleNotes.push('🚀 Ramp Start (+2 distance boost)');
    }

    document.getElementById('sub-dist').innerText = getDistanceExplanation(null, distRoll, distRoll, baseDistance, null, true, clubConfig);

    // 2. Scatter Roll
    let scatDist = 0;
    let scatDirIndex = 0;

    if (clubConfig.hasScatter) {
      const dirRoll = Math.floor(Math.random() * 6) + 1;
      const scatRoll = Math.floor(Math.random() * 6) + 1;

      await Promise.all([
        animateDie('die-dir', dirRoll, 300, 6),
        animateDie('die-scat', scatRoll, 300, 6)
      ]);

      scatDirIndex = dirRoll - 1;

      if (clubConfig.id === 'hit') {
        scatDist = Math.ceil(scatRoll / 3); // d6/3: 1 to 2 hexes
      } else if (clubConfig.id === 'whack' || clubConfig.id === 'blast') {
        scatDist = Math.ceil(scatRoll / 2); // d6/2: 1 to 3 hexes
      }

      updateShotControlDisplay(dirRoll, scatDist);
    } else {
      renderDieFace('die-dir', '-');
      renderDieFace('die-scat', '-');
      updateShotControlDisplay('-', 0, true);
    }

    // 3. Step-by-Step Trajectory & Obstacle Physics
    let currentStepPos = { q: shotStart.q, r: shotStart.r };
    let currentMoveDir = aimDir;
    let remainingSteps = baseDistance;
    const legs = [];
    let currentLegStart = { ...shotStart };
    let legStepCount = 0;
    let rampBoostCount = 0;
    let hasWarped = false;

    while (remainingSteps > 0) {
      const nextHex = {
        q: currentStepPos.q + HEX_DIRS[currentMoveDir].q,
        r: currentStepPos.r + HEX_DIRS[currentMoveDir].r
      };

      // A. Bumper Rail Encounter: Balls CANNOT progress onto or beyond bumpers!
      if (isCrazyWall(nextHex.q, nextHex.r)) {
        const reflectDir = getBumperReflectionDir(currentStepPos, currentMoveDir);

        legs.push({
          start: { ...currentLegStart },
          aimed: { ...nextHex },
          end: { ...currentStepPos },
          dist: Math.max(1, legStepCount),
          isRicochet: true
        });

        if (reflectDir !== null && remainingSteps > 1) {
          obstacleNotes.push('💥 Bumper rail bank ricochet!');
          currentMoveDir = reflectDir;
          currentLegStart = { ...currentStepPos };
          legStepCount = 0;
          remainingSteps -= 1; // 1 step consumed for bounce
          continue;
        } else {
          obstacleNotes.push('💥 Bumper rail stopped ball');
          currentLegStart = { ...currentStepPos };
          remainingSteps = 0;
          break;
        }
      }

      const nextTerrain = getTerrainAt(nextHex.q, nextHex.r);

      // B. Rotating Windmill Gate Encounter
      if (nextTerrain === 'windmill') {
        if (!windmillOpen) {
          obstacleNotes.push('⛔ CLATTER! Ball blocked by spinning windmill blades!');
          legs.push({
            start: { ...currentLegStart },
            aimed: { ...nextHex },
            end: { ...currentStepPos },
            dist: Math.max(1, legStepCount),
            isBlocked: true
          });
          remainingSteps = 0;
          break;
        } else {
          obstacleNotes.push('⚙️ SWOOSH! Slipped clean through the open windmill gate!');
          currentStepPos = nextHex;
          legStepCount += 1;
          remainingSteps -= 1;
          // Cannot finish on a windmill - push 1 space in direction of travel!
          if (remainingSteps === 0) {
            const pushHex = {
              q: currentStepPos.q + HEX_DIRS[currentMoveDir].q,
              r: currentStepPos.r + HEX_DIRS[currentMoveDir].r
            };
            if (isCrazyPlayable(pushHex.q, pushHex.r)) {
              currentStepPos = pushHex;
              legStepCount += 1;
              obstacleNotes.push('⚙️ Windmill momentum: pushed 1 space through the gate');
            } else {
              for (let d = 0; d < 6; d++) {
                const adj = { q: currentStepPos.q + HEX_DIRS[d].q, r: currentStepPos.r + HEX_DIRS[d].r };
                if (isCrazyPlayable(adj.q, adj.r) && getTerrainAt(adj.q, adj.r) !== 'windmill') {
                  currentStepPos = adj;
                  legStepCount += 1;
                  obstacleNotes.push('⚙️ Windmill momentum: cleared gate to fairway');
                  break;
                }
              }
            }
          }
          continue;
        }
      }

      // C. Speed Ramp Encounter (Elevation boost +2 in direction of movement!)
      if (nextTerrain === 'ramp') {
        currentStepPos = nextHex;
        legStepCount += 1;
        if (rampBoostCount < 3) {
          rampBoostCount += 1;
          remainingSteps += 1; // enters hex (-1) and gains boost (+2) = net +1 step!
          obstacleNotes.push('🚀 Speed Ramp Boost (+2 forward momentum)');
        } else {
          remainingSteps -= 1;
        }
        continue;
      }

      // D. Warp Tube Encounter (Random exit selection: A, B, C -> X, Y, Z!)
      if (nextTerrain === 'tube_in') {
        const warpExits = getAllWarpExits();
        const chosenExit = warpExits[Math.floor(Math.random() * warpExits.length)];
        obstacleNotes.push(`🌀 Warp Tube! Randomly exited at (${chosenExit.q}, ${chosenExit.r})`);

        legs.push({
          start: { ...currentLegStart },
          aimed: { ...nextHex },
          end: { ...nextHex },
          dist: Math.max(1, legStepCount + 1),
          isWarpIn: true,
          warpOut: { ...chosenExit }
        });

        currentStepPos = { ...chosenExit };
        currentLegStart = { ...chosenExit };
        legStepCount = 0;

        // Exit in a random legitimate direction from the exit tube!
        const legitimateDirs = [];
        for (let d = 0; d < 6; d++) {
          const adj = { q: chosenExit.q + HEX_DIRS[d].q, r: chosenExit.r + HEX_DIRS[d].r };
          if (
            isCrazyPlayable(adj.q, adj.r) &&
            getTerrainAt(adj.q, adj.r) !== 'tube_in' &&
            getTerrainAt(adj.q, adj.r) !== 'tube_out' &&
            getTerrainAt(adj.q, adj.r) !== 'windmill'
          ) {
            legitimateDirs.push({ dir: d, hex: adj });
          }
        }

        if (legitimateDirs.length > 0) {
          const chosenDirObj = legitimateDirs[Math.floor(Math.random() * legitimateDirs.length)];
          currentStepPos = chosenDirObj.hex;
          currentMoveDir = chosenDirObj.dir;
          legStepCount = 1;
        } else {
          currentStepPos = { ...chosenExit };
          legStepCount = 0;
        }
        hasWarped = true;
        remainingSteps = 0;
        break;
      }

      // Regular advancement
      currentStepPos = nextHex;
      legStepCount += 1;
      remainingSteps -= 1;
    }

    const aimedFinalPos = { ...currentStepPos };

    // 4. Scatter Calculation: Balls CANNOT progress onto or beyond bumpers!
    let scatterPos = null;
    if (scatDist > 0 && !hasWarped && getTerrainAt(aimedFinalPos.q, aimedFinalPos.r) !== 'hole') {
      let currScat = { ...aimedFinalPos };
      for (let s = 1; s <= scatDist; s++) {
        const nextScat = {
          q: currScat.q + HEX_DIRS[scatDirIndex].q,
          r: currScat.r + HEX_DIRS[scatDirIndex].r
        };
        if (!isCrazyPlayable(nextScat.q, nextScat.r)) {
          obstacleNotes.push('💥 Bumper contained scatter roll');
          break;
        }
        if (getTerrainAt(nextScat.q, nextScat.r) === 'windmill' && !windmillOpen) {
          obstacleNotes.push('⛔ Windmill blocked scatter roll');
          break;
        }
        currScat = nextScat;
      }
      if (currScat.q !== aimedFinalPos.q || currScat.r !== aimedFinalPos.r) {
        scatterPos = currScat;
      }
    }

    const landingHex = scatterPos ? { ...scatterPos } : { ...aimedFinalPos };

    // Guarantee: Cannot finish on a windmill - push 1 space in direction of travel
    if (getTerrainAt(landingHex.q, landingHex.r) === 'windmill') {
      const travelDir = (scatDist > 0 && scatterPos) ? scatDirIndex : currentMoveDir;
      const pushHex = {
        q: landingHex.q + HEX_DIRS[travelDir].q,
        r: landingHex.r + HEX_DIRS[travelDir].r
      };
      if (isCrazyPlayable(pushHex.q, pushHex.r)) {
        landingHex.q = pushHex.q;
        landingHex.r = pushHex.r;
        obstacleNotes.push('⚙️ Windmill momentum: pushed 1 space through the gate');
      } else {
        for (let d = 0; d < 6; d++) {
          const adj = { q: landingHex.q + HEX_DIRS[d].q, r: landingHex.r + HEX_DIRS[d].r };
          if (isCrazyPlayable(adj.q, adj.r) && getTerrainAt(adj.q, adj.r) !== 'windmill') {
            landingHex.q = adj.q;
            landingHex.r = adj.r;
            obstacleNotes.push('⚙️ Windmill momentum: cleared gate to fairway');
            break;
          }
        }
      }
    }

    // Finish building legs
    if (legStepCount > 0 || legs.length === 0 || hasWarped) {
      legs.push({
        start: { ...currentLegStart },
        aimed: { ...aimedFinalPos },
        end: { ...landingHex },
        dist: Math.max(1, legStepCount),
        hasScatter: scatDist > 0 && !!scatterPos
      });
    } else if (legs.length > 0 && scatterPos) {
      const lastLeg = legs[legs.length - 1];
      lastLeg.end = { ...landingHex };
      lastLeg.hasScatter = true;
    }

    // Toggle Windmill Gate state for the next stroke (only if hole has a windmill)
    if (hasWindmillOnHole()) {
      windmillOpen = !windmillOpen;
      updateCrazyStatusBar();
    }

    // Animate the shot through all legs using the standard golf putter animation!
    await animateCrazyLegs(legs);

    let landingTerrain = getTerrainAt(landingHex.q, landingHex.r);

    let hazardType = null;
    let hazardPos = null;
    let dropPos = null;
    let slopeFrom = null;
    let slopeTo = null;

    if (landingTerrain === 'water' || landingTerrain === 'trees') {
      strokeCount += 2;
      hazardType = landingTerrain;
      hazardPos = { ...landingHex };
      const nearestLand = findNearestLand(landingHex.q, landingHex.r);
      dropPos = { ...nearestLand };
      playerPos = { q: nearestLand.q, r: nearestLand.r };
      obstacleNotes.push('Water hazard! +1 penalty stroke');
    } else {
      playerPos = { q: landingHex.q, r: landingHex.r };
      strokeCount += 1;

      // 5. Slope Arrows check (All putter strokes slide along slope arrows upon landing!)
      const arrow = currentHole.slopeArrows && currentHole.slopeArrows[`${playerPos.q},${playerPos.r}`];
      if (arrow !== undefined) {
        const slideQ = playerPos.q + HEX_DIRS[arrow].q;
        const slideR = playerPos.r + HEX_DIRS[arrow].r;
        slopeFrom = { q: playerPos.q, r: playerPos.r };
        if (isCrazyPlayable(slideQ, slideR) && getTerrainAt(slideQ, slideR) !== 'windmill') {
          slopeTo = { q: slideQ, r: slideR };
          playerPos.q = slideQ;
          playerPos.r = slideR;
          obstacleNotes.push('Contour slope break slide');
        }
      }
    }

    if (hazardType && hazardPos && dropPos) {
      document.getElementById('status-message').innerText = 'Water hazard! +1 penalty stroke. Ball dropping to nearest land...';
      await animateBallDrop(hexToPixel(hazardPos.q, hazardPos.r), hexToPixel(dropPos.q, dropPos.r));
    } else if (slopeFrom && slopeTo) {
      await animateSlopeSlide(hexToPixel(slopeFrom.q, slopeFrom.r), hexToPixel(slopeTo.q, slopeTo.r));
    }

    const finalTerrainCheck = getTerrainAt(playerPos.q, playerPos.r);
    if (finalTerrainCheck === 'hole') {
      await animateCupSink(hexToPixel(playerPos.q, playerPos.r));
    }

    const fullCurve = (legs.length === 1)
      ? buildShotCurve(hexToPixel(shotStart.q, shotStart.r), hexToPixel(legs[0].aimed.q, legs[0].aimed.r), hexToPixel(landingHex.q, landingHex.r), scatDist > 0 && !!scatterPos)
      : null;

    shotTrails.push({
      stroke: strokeCount,
      club: club,
      start: shotStart,
      aimed: aimedFinalPos,
      landing: landingHex,
      hasScatter: scatDist > 0 && !!scatterPos,
      scatter: scatterPos,
      curve: fullCurve,
      legs: legs.length > 1 ? legs : null,
      hazard: hazardType ? { type: hazardType, pos: hazardPos, drop: dropPos } : null,
      slope: slopeFrom ? { from: slopeFrom, to: slopeTo } : null,
      final: { ...playerPos }
    });

    isShotAnimating = false;
    updateScoreboard();
    render();
    keepBallInView();

    const finalTerrain = getTerrainAt(playerPos.q, playerPos.r);
    const noteSuffix = obstacleNotes.length ? ' • ' + obstacleNotes.join(' • ') : '';

    if (finalTerrain === 'hole') {
      recordHoleFinish();
      const diff = strokeCount - currentHole.par;
      const diffName = strokeCount === 1 ? 'HOLE IN ONE! 🏆' : diff <= -2 ? 'Eagle!' : diff === -1 ? 'Birdie!' : diff === 0 ? 'Par!' : 'Finished!';
      document.getElementById('status-message').innerText = `ACE! Hole completed in ${strokeCount} strokes! (${diffName})${noteSuffix}`;
    } else {
      document.getElementById('status-message').innerText = `Stroke ${strokeCount}: Landed in ${TERRAIN[finalTerrain] ? TERRAIN[finalTerrain].label : 'Carpet'}${noteSuffix}`;
    }

    updateControlsState();
    return;
  }

  // ==========================================
  // TRADITIONAL GOLF MODE RESOLUTION
  // ==========================================
  // 1. Distance Roll
  const distRoll = Math.floor(Math.random() * 6) + 1;
  await animateDie('die-dist', distRoll);

  const baseDistance = getTraditionalShotDistance(club, distRoll, currentTerrain);

  document.getElementById('sub-dist').innerText = getDistanceExplanation(club, distRoll, distRoll, baseDistance, currentTerrain, false);

  // 2. Scatter Roll
  let scatDist = 0;
  let scatDirIndex = 0;

  if (club === 'driver' || club === 'longIron') {
    const dirRoll = Math.floor(Math.random() * 6) + 1;
    const scatRoll = Math.floor(Math.random() * 6) + 1;

    await Promise.all([
      animateDie('die-dir', dirRoll, 350, 6),
      animateDie('die-scat', scatRoll, 350, 6)
    ]);

    scatDirIndex = dirRoll - 1;

    if (club === 'driver') scatDist = scatRoll <= 2 ? 1 : scatRoll <= 4 ? 2 : 3;
    else scatDist = scatRoll <= 3 ? 0 : 1;

    updateShotControlDisplay(dirRoll, scatDist);
  } else {
    renderDieFace('die-dir', '-');
    renderDieFace('die-scat', '-');
    updateShotControlDisplay('-', 0, true);
  }

  const aimedPos = {
    q: shotStart.q + HEX_DIRS[aimDir].q * baseDistance,
    r: shotStart.r + HEX_DIRS[aimDir].r * baseDistance
  };

  let scatterPos = null;
  if (scatDist > 0) {
    scatterPos = {
      q: aimedPos.q + HEX_DIRS[scatDirIndex].q * scatDist,
      r: aimedPos.r + HEX_DIRS[scatDirIndex].r * scatDist
    };
  }

  const landingHex = scatterPos ? { ...scatterPos } : { ...aimedPos };
  const landingTerrain = getTerrainAt(landingHex.q, landingHex.r);

  const pStart = hexToPixel(shotStart.q, shotStart.r);
  const pAimed = hexToPixel(aimedPos.q, aimedPos.r);
  const pLanding = hexToPixel(landingHex.q, landingHex.r);
  const curve = buildShotCurve(pStart, pAimed, pLanding, scatDist > 0);

  // Animate the shot trajectory! Ball flies along the smooth trend line
  await animateShotFlight(curve, club, baseDistance, pAimed);

  let hazardType = null;
  let hazardPos = null;
  let dropPos = null;
  let slopeFrom = null;
  let slopeTo = null;

  // If you land in water or trees (out of bounds), return ball to nearest hex on land + 1 shot penalty
  if (landingTerrain === 'water' || landingTerrain === 'trees') {
    strokeCount += 2; // 1 shot taken + 1 penalty stroke
    hazardType = landingTerrain;
    hazardPos = { ...landingHex };
    const nearestLand = findNearestLand(landingHex.q, landingHex.r);
    dropPos = { ...nearestLand };
    playerPos = { q: nearestLand.q, r: nearestLand.r };

    const hazardName = landingTerrain === 'water' ? 'Water hazard' : 'Out of bounds in trees';
    document.getElementById('status-message').innerText = `${hazardName}! +1 penalty stroke. Ball dropping to nearest land...`;

    // Animate ball drop to nearest land
    await animateBallDrop(pLanding, hexToPixel(dropPos.q, dropPos.r));

    const arrow = currentHole.slopeArrows[`${playerPos.q},${playerPos.r}`];
    if (arrow !== undefined) {
      const slideQ = playerPos.q + HEX_DIRS[arrow].q;
      const slideR = playerPos.r + HEX_DIRS[arrow].r;
      if (isLand(slideQ, slideR)) {
        slopeFrom = { q: playerPos.q, r: playerPos.r };
        slopeTo = { q: slideQ, r: slideR };
        playerPos.q = slideQ;
        playerPos.r = slideR;
        await animateSlopeSlide(hexToPixel(slopeFrom.q, slopeFrom.r), hexToPixel(slopeTo.q, slopeTo.r));
      }
    }

    shotTrails.push({
      stroke: strokeCount,
      club: club,
      start: shotStart,
      aimed: aimedPos,
      hasScatter: scatDist > 0,
      scatter: scatterPos,
      curve: curve,
      hazard: hazardType,
      hazardPos: hazardPos,
      dropPos: dropPos,
      slopeFrom: slopeFrom,
      slopeTo: slopeTo,
      final: { ...playerPos }
    });

    isShotAnimating = false;
    updateScoreboard();
    render();
    keepBallInView();

    document.getElementById('status-message').innerText = `${hazardName}! +1 penalty stroke. Ball placed on nearest land.`;
  } else {
    playerPos = { q: landingHex.q, r: landingHex.r };
    strokeCount += 1;

    const arrow = currentHole.slopeArrows[`${playerPos.q},${playerPos.r}`];
    if (arrow !== undefined) {
      const slideQ = playerPos.q + HEX_DIRS[arrow].q;
      const slideR = playerPos.r + HEX_DIRS[arrow].r;
      slopeFrom = { q: playerPos.q, r: playerPos.r };
      if (!isLand(slideQ, slideR)) {
        const nearestLand = findNearestLand(slideQ, slideR);
        slopeTo = { q: nearestLand.q, r: nearestLand.r };
        playerPos.q = nearestLand.q;
        playerPos.r = nearestLand.r;
      } else {
        slopeTo = { q: slideQ, r: slideR };
        playerPos.q = slideQ;
        playerPos.r = slideR;
      }
      document.getElementById('status-message').innerText = 'Contour slope break slide!';
      await animateSlopeSlide(hexToPixel(slopeFrom.q, slopeFrom.r), hexToPixel(slopeTo.q, slopeTo.r));
    }

    const finalTerrain = getTerrainAt(playerPos.q, playerPos.r);
    if (finalTerrain === 'hole') {
      await animateCupSink(hexToPixel(playerPos.q, playerPos.r));
    }

    shotTrails.push({
      stroke: strokeCount,
      club: club,
      start: shotStart,
      aimed: aimedPos,
      hasScatter: scatDist > 0,
      scatter: scatterPos,
      curve: curve,
      hazard: null,
      hazardPos: null,
      dropPos: null,
      slopeFrom: slopeFrom,
      slopeTo: slopeTo,
      final: { ...playerPos }
    });

    isShotAnimating = false;
    updateScoreboard();
    render();
    keepBallInView();

    if (finalTerrain === 'hole') {
      recordHoleFinish();
      const diff = strokeCount - currentHole.par;
      const diffName = diff <= -2 ? 'Eagle!' : diff === -1 ? 'Birdie!' : diff === 0 ? 'Par!' : diff === 1 ? 'Bogey.' : 'Double Bogey+.';
      document.getElementById('status-message').innerText = `Hole completed in ${strokeCount} strokes! (${diffName})`;
    } else {
      document.getElementById('status-message').innerText = `Landed in ${TERRAIN[finalTerrain] ? TERRAIN[finalTerrain].label : 'Rough'}.`;
    }
  }

  if (club === 'driver') {
    currentSelectedClub = 'longIron';
  }
  updateControlsState();
}

async function takeGimme() {
  if (isShotAnimating) return;
  isShotAnimating = true;

  const rollBtn = document.getElementById('roll-btn');
  const gimmeBtn = document.getElementById('gimme-btn');
  if (rollBtn) rollBtn.disabled = true;
  if (gimmeBtn) gimmeBtn.disabled = true;

  const shotStart = { ...playerPos };
  strokeCount += 1;
  const holePos = getHolePos();
  const pStart = hexToPixel(shotStart.q, shotStart.r);
  const pHole = hexToPixel(holePos.q, holePos.r);
  const curve = buildShotCurve(pStart, pHole, pHole, false);

  await animateShotFlight(curve, 'putter', 1);
  await animateCupSink(pHole);

  playerPos = { ...holePos };

  shotTrails.push({
    stroke: strokeCount,
    club: 'gimme',
    start: shotStart,
    aimed: { ...holePos },
    hasScatter: false,
    scatter: null,
    curve: curve,
    hazard: null,
    hazardPos: null,
    dropPos: null,
    slopeFrom: null,
    slopeTo: null,
    final: { ...holePos }
  });

  recordHoleFinish();
  const diff = strokeCount - currentHole.par;
  const diffName = diff <= -2 ? 'Eagle!' : diff === -1 ? 'Birdie!' : diff === 0 ? 'Par!' : diff === 1 ? 'Bogey.' : 'Double Bogey+.';
  document.getElementById('status-message').innerText = `Gimme taken (+1 stroke)! Finished in ${strokeCount} (${diffName})`;
  
  isShotAnimating = false;
  updateControlsState();
  render();
}

function updateDailyHoleCardUI() {
  const daily = COURSES.daily;
  if (!daily || !daily.holes || !daily.holes[0]) return;
  const hole = daily.holes[0];

  const titleEl = document.getElementById('daily-hole-title');
  const parTagEl = document.getElementById('daily-par-tag');
  const dateBadgeEl = document.getElementById('daily-date-badge');
  const descEl = document.getElementById('daily-hole-desc');
  const featEl = document.getElementById('daily-features-container');
  const startButton = document.getElementById('start-daily-btn');

  if (titleEl) titleEl.innerText = hole.name;
  if (parTagEl) parTagEl.innerText = `PAR ${hole.par} • 1 HOLE`;
  if (dateBadgeEl) dateBadgeEl.innerText = daily.dateStr || 'Today';
  if (descEl) descEl.innerText = daily.description;
  if (startButton) {
    startButton.classList.remove('btn-daily-parkland', 'btn-daily-links', 'btn-daily-crazy');
    startButton.classList.add(`btn-daily-${daily.sourceCourseId}`);
    if (daily.sourceCourseId === 'crazy') {
      startButton.style.setProperty('background-color', '#880e4f', 'important');
      startButton.style.setProperty('box-shadow', '0 3px 0 #56052f', 'important');
      startButton.style.setProperty('color', '#ffffff', 'important');
    } else if (daily.sourceCourseId === 'links') {
      startButton.style.setProperty('background-color', '#d84315', 'important');
      startButton.style.setProperty('box-shadow', '0 3px 0 #bf360c', 'important');
      startButton.style.setProperty('color', '#ffffff', 'important');
    } else {
      startButton.style.setProperty('background-color', '#2e7d32', 'important');
      startButton.style.setProperty('box-shadow', '0 3px 0 #1b5e20', 'important');
      startButton.style.setProperty('color', '#ffffff', 'important');
    }
  }
  if (featEl) {
    featEl.innerHTML = daily.features.map(f => `<span class="feat-tag">${f}</span>`).join('');
  }
}

function showScorecardModal() {
  const tbody = document.getElementById('scorecard-tbody');
  tbody.innerHTML = '';

  let totalPar = 0;
  let totalStrokes = 0;

  for (let i = 0; i < currentHoles.length; i++) {
    const h = currentHoles[i];
    const score = roundScores[i];
    totalPar += h.par;
    if (score !== null) totalStrokes += score;

    const tr = document.createElement('tr');
    const isCurrent = i === currentHoleIndex;
    if (isCurrent) tr.style.fontWeight = 'bold';

    let diffText = '-';
    let cellClass = '';
    if (score !== null) {
      const diff = score - h.par;
      if (diff <= -2) { diffText = `${diff}`; cellClass = 'score-cell-eagle'; }
      else if (diff === -1) { diffText = '-1'; cellClass = 'score-cell-birdie'; }
      else if (diff === 0) { diffText = 'E'; cellClass = 'score-cell-par'; }
      else if (diff === 1) { diffText = '+1'; cellClass = 'score-cell-bogey'; }
      else { diffText = `+${diff}`; cellClass = 'score-cell-double'; }
    }

    tr.innerHTML = `
      <td>${h.id}${isCurrent ? ' ⛳' : ''}</td>
      <td style="text-align: left; padding-left: 6px;">${h.name}</td>
      <td>${h.par}</td>
      <td class="${cellClass}">${score !== null ? score : '-'}</td>
      <td class="${cellClass}">${diffText}</td>
    `;
    tbody.appendChild(tr);
  }

  const cardTotalLabel = document.getElementById('card-total-label');
  if (cardTotalLabel) {
    cardTotalLabel.innerText = currentHoles.length === 1 ? 'TOTAL (1 HOLE)' : `TOTAL (${currentHoles.length} HOLES)`;
  }

  document.getElementById('card-total-par').innerText = totalPar;
  document.getElementById('card-total-strokes').innerText = totalStrokes > 0 ? totalStrokes : '-';
  const total = calculateTotalScore();
  document.getElementById('card-total-diff').innerText = total.diffStr;

  document.getElementById('scorecard-modal').style.display = 'flex';
}

function readLeaderboards() {
  const stored = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
  if (stored === null) return {};

  const parsed = JSON.parse(stored);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Leaderboard data has an invalid format.');
  }

  for (const courseKey of LEADERBOARD_COURSES) {
    const scores = parsed[courseKey];
    if (scores === undefined) continue;
    if (!Array.isArray(scores) || scores.some(score =>
      !score
      || !Number.isInteger(score.strokes)
      || score.strokes < 1
      || !Number.isInteger(score.par)
      || score.par < 1
      || typeof score.completedAt !== 'string'
      || Number.isNaN(Date.parse(score.completedAt))
    )) {
      throw new Error(`Leaderboard data for ${COURSES[courseKey].name} has an invalid format.`);
    }
  }

  return parsed;
}

function saveCompletedRound() {
  if (roundLeaderboardSaveAttempted || currentCourseKey === 'daily' || !roundScores.every(Number.isInteger)) return;
  roundLeaderboardSaveAttempted = true;

  try {
    const leaderboards = readLeaderboards();
    const scores = leaderboards[currentCourseKey] || [];
    scores.push({
      strokes: roundScores.reduce((total, score) => total + score, 0),
      par: currentHoles.reduce((total, hole) => total + hole.par, 0),
      completedAt: new Date().toISOString()
    });
    scores.sort((a, b) => a.strokes - b.strokes || Date.parse(a.completedAt) - Date.parse(b.completedAt));
    leaderboards[currentCourseKey] = scores.slice(0, 5);
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboards));
    leaderboardSaveError = '';
  } catch (error) {
    leaderboardSaveError = 'This round could not be saved. Check that browser storage is enabled.';
    console.error('Unable to save the course leaderboard score.', error);
  }
}

function renderLeaderboards() {
  const container = document.getElementById('leaderboard-content');
  container.innerHTML = '';

  if (leaderboardSaveError) {
    const errorMessage = document.createElement('p');
    errorMessage.className = 'leaderboard-error';
    errorMessage.textContent = leaderboardSaveError;
    container.appendChild(errorMessage);
  }

  let leaderboards;
  try {
    leaderboards = readLeaderboards();
  } catch (error) {
    const errorMessage = document.createElement('p');
    errorMessage.className = 'leaderboard-error';
    errorMessage.textContent = 'Leaderboard scores could not be loaded from browser storage.';
    container.appendChild(errorMessage);
    console.error('Unable to load course leaderboard scores.', error);
    return;
  }

  for (const courseKey of LEADERBOARD_COURSES) {
    const course = COURSES[courseKey];
    const scores = (leaderboards[courseKey] || [])
      .slice()
      .sort((a, b) => a.strokes - b.strokes || Date.parse(a.completedAt) - Date.parse(b.completedAt))
      .slice(0, 5);
    const section = document.createElement('section');
    section.className = 'leaderboard-course';

    const heading = document.createElement('h4');
    heading.textContent = course.name;
    section.appendChild(heading);

    if (scores.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'leaderboard-empty';
      emptyMessage.textContent = 'No completed rounds yet.';
      section.appendChild(emptyMessage);
    } else {
      const table = document.createElement('table');
      table.className = 'leaderboard-table';
      table.innerHTML = '<thead><tr><th>#</th><th>Score</th><th>To par</th><th>Date</th></tr></thead>';
      const tbody = document.createElement('tbody');
      scores.forEach((score, index) => {
        const row = document.createElement('tr');
        const diff = score.strokes - score.par;
        const diffText = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
        const dateText = new Date(score.completedAt).toLocaleDateString('en-GB');
        row.innerHTML = `<td>${index + 1}</td><td>${score.strokes}</td><td>${diffText}</td><td>${dateText}</td>`;
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      section.appendChild(table);
    }
    container.appendChild(section);
  }
}

function showLeaderboardModal() {
  renderLeaderboards();
  document.getElementById('leaderboard-modal').style.display = 'flex';
}

function hideLeaderboardModal() {
  document.getElementById('leaderboard-modal').style.display = 'none';
}

function hideScorecardModal() {
  document.getElementById('scorecard-modal').style.display = 'none';
}

function showRulesModal() {
  const modal = document.getElementById('rules-modal');
  if (modal) modal.style.display = 'flex';
}

function hideRulesModal() {
  const modal = document.getElementById('rules-modal');
  if (modal) modal.style.display = 'none';
}

// Event Listeners
document.getElementById('start-daily-btn').addEventListener('click', () => startCourse('daily'));
document.getElementById('card-daily').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') startCourse('daily');
});

document.getElementById('start-parkland-btn').addEventListener('click', () => startCourse('parkland'));
document.getElementById('start-links-btn').addEventListener('click', () => startCourse('links'));

const startCrazyBtn = document.getElementById('start-crazy-btn');
if (startCrazyBtn) {
  startCrazyBtn.addEventListener('click', () => startCourse('crazy'));
}

const cardCrazy = document.getElementById('card-crazy');
if (cardCrazy) {
  cardCrazy.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') startCourse('crazy');
  });
}

document.getElementById('card-parkland').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') startCourse('parkland');
});
document.getElementById('card-links').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') startCourse('links');
});

const toggleRulesBtn = document.getElementById('toggle-rules-btn');
if (toggleRulesBtn) {
  toggleRulesBtn.addEventListener('click', showRulesModal);
}

document.getElementById('show-leaderboard-btn').addEventListener('click', showLeaderboardModal);
document.getElementById('close-leaderboard-modal-btn').addEventListener('click', hideLeaderboardModal);
document.getElementById('close-leaderboard-modal-footer-btn').addEventListener('click', hideLeaderboardModal);
const leaderboardModal = document.getElementById('leaderboard-modal');
leaderboardModal.addEventListener('click', (e) => {
  if (e.target === leaderboardModal) hideLeaderboardModal();
});

const gameRulesBtn = document.getElementById('game-rules-btn');
if (gameRulesBtn) {
  gameRulesBtn.addEventListener('click', showRulesModal);
}

const closeRulesModalBtn = document.getElementById('close-rules-modal-btn');
if (closeRulesModalBtn) {
  closeRulesModalBtn.addEventListener('click', hideRulesModal);
}

const closeRulesModalFooterBtn = document.getElementById('close-rules-modal-footer-btn');
if (closeRulesModalFooterBtn) {
  closeRulesModalFooterBtn.addEventListener('click', hideRulesModal);
}

const rulesModal = document.getElementById('rules-modal');
if (rulesModal) {
  rulesModal.addEventListener('click', (e) => {
    if (e.target === rulesModal) hideRulesModal();
  });
}

const scorecardModal = document.getElementById('scorecard-modal');
if (scorecardModal) {
  scorecardModal.addEventListener('click', (e) => {
    if (e.target === scorecardModal) hideScorecardModal();
  });
}

document.getElementById('back-to-courses-btn').addEventListener('click', returnToClubhouse);
document.getElementById('view-scorecard-btn').addEventListener('click', showScorecardModal);
document.getElementById('close-modal-btn').addEventListener('click', hideScorecardModal);
document.getElementById('modal-clubhouse-btn').addEventListener('click', returnToClubhouse);
document.getElementById('modal-restart-course-btn').addEventListener('click', () => {
  hideScorecardModal();
  startCourse(currentCourseKey);
});

// Aim pills buttons
document.querySelectorAll('.aim-pill').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    if (isShotAnimating) return;
    const dir = parseInt(e.currentTarget.getAttribute('data-dir'), 10);
    syncAimUI(dir);
    render();
  });
});

// Club selection boxes click listener
const clubContainer = document.getElementById('club-pills-container');
if (clubContainer) {
  clubContainer.addEventListener('click', (e) => {
    if (isShotAnimating) return;
    const box = e.target.closest('.club-box');
    if (box && !box.disabled) {
      const clubId = box.getAttribute('data-club');
      selectClub(clubId);
    }
  });
}

document.getElementById('roll-btn').addEventListener('click', executeShot);
document.getElementById('gimme-btn').addEventListener('click', takeGimme);
document.getElementById('next-btn').addEventListener('click', () => loadHole(currentHoleIndex + 1));

// ==========================================
// CANVAS INTERACTIVE PAN & ZOOM CONTROLS
// ==========================================

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let panStartX = 0;
let panStartY = 0;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  isDragging = true;
  canvas.classList.add('grabbing');
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (_) {}
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  panStartX = camera.panX;
  panStartY = camera.panY;
  dismissScrollHint();
});

canvas.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  camera.panX = panStartX + dx;
  camera.panY = panStartY + dy;
  clampCamera();
  render();
});

const endPointerDrag = (e) => {
  if (isDragging) {
    isDragging = false;
    canvas.classList.remove('grabbing');
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }
};

canvas.addEventListener('pointerup', endPointerDrag);
canvas.addEventListener('pointercancel', endPointerDrag);

// Mouse wheel zoom centered on cursor
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.15 : 0.87;
  zoomAtPoint(factor, mouseX, mouseY);
  dismissScrollHint();
}, { passive: false });

// 2-finger touch pinch-to-zoom
let pinchDistStart = null;
let pinchScaleStart = 1.0;
let pinchCenterStart = null;

canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    isDragging = false;
    canvas.classList.remove('grabbing');
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    pinchDistStart = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    pinchScaleStart = camera.scale;
    const rect = canvas.getBoundingClientRect();
    pinchCenterStart = {
      x: (t1.clientX + t2.clientX) / 2 - rect.left,
      y: (t1.clientY + t2.clientY) / 2 - rect.top
    };
    dismissScrollHint();
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && pinchDistStart && pinchCenterStart) {
    e.preventDefault();
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const rect = canvas.getBoundingClientRect();
    const currentCenter = {
      x: (t1.clientX + t2.clientX) / 2 - rect.left,
      y: (t1.clientY + t2.clientY) / 2 - rect.top
    };

    const factor = dist / pinchDistStart;
    let targetScale = pinchScaleStart * factor;
    targetScale = Math.max(camera.minScale, Math.min(camera.maxScale, targetScale));

    const oldScale = camera.scale;
    if (Math.abs(targetScale - oldScale) > 0.001) {
      camera.panX = currentCenter.x - (currentCenter.x - camera.panX) * (targetScale / oldScale);
      camera.panY = currentCenter.y - (currentCenter.y - camera.panY) * (targetScale / oldScale);
      camera.scale = targetScale;
      clampCamera();
      updateZoomUI();
      render();
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) {
    pinchDistStart = null;
    pinchCenterStart = null;
  }
});

// HUD Control buttons
const zoomInBtn = document.getElementById('zoom-in-btn');
if (zoomInBtn) {
  zoomInBtn.addEventListener('click', () => {
    zoomBy(1.25);
    dismissScrollHint();
  });
}

const zoomOutBtn = document.getElementById('zoom-out-btn');
if (zoomOutBtn) {
  zoomOutBtn.addEventListener('click', () => {
    zoomBy(0.8);
    dismissScrollHint();
  });
}

const centerBallBtn = document.getElementById('center-ball-btn');
if (centerBallBtn) {
  centerBallBtn.addEventListener('click', () => {
    centerOnBall();
    dismissScrollHint();
  });
}

const fitHoleBtn = document.getElementById('fit-hole-btn');
if (fitHoleBtn) {
  fitHoleBtn.addEventListener('click', () => {
    fitHole();
    dismissScrollHint();
  });
}

// Window resize & container resize observer
window.addEventListener('resize', () => {
  resizeCanvas();
  clampCamera();
  render();
});

const canvasWrapper = document.getElementById('canvas-wrapper');
if (canvasWrapper && window.ResizeObserver) {
  const ro = new ResizeObserver(() => {
    resizeCanvas();
    clampCamera();
    render();
  });
  ro.observe(canvasWrapper);
}

// Keyboard navigation (arrows pan, + / - zoom, F fit, B ball, M minimap)
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'Escape') {
    hideRulesModal();
    hideScorecardModal();
    return;
  }
  const panStep = 35;
  if (e.key === '+' || e.key === '=') {
    zoomBy(1.2);
    dismissScrollHint();
  } else if (e.key === '-' || e.key === '_') {
    zoomBy(0.83);
    dismissScrollHint();
  } else if (e.key === 'f' || e.key === 'F') {
    fitHole();
    dismissScrollHint();
  } else if (e.key === 'b' || e.key === 'B' || e.key === 'c' || e.key === 'C') {
    centerOnBall();
    dismissScrollHint();
  } else if (e.key === 'ArrowLeft') {
    camera.panX += panStep;
    clampCamera();
    render();
    dismissScrollHint();
  } else if (e.key === 'ArrowRight') {
    camera.panX -= panStep;
    clampCamera();
    render();
    dismissScrollHint();
  } else if (e.key === 'ArrowUp') {
    camera.panY += panStep;
    clampCamera();
    render();
    dismissScrollHint();
  } else if (e.key === 'ArrowDown') {
    camera.panY -= panStep;
    clampCamera();
    render();
    dismissScrollHint();
  }
});

// Initialize Hole of the Day UI card on landing screen
updateDailyHoleCardUI();
