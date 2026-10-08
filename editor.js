import { crazyHole } from './holes/crazyHole.js';
import { parklandCourse } from './holes/parkland.js';
import { linksCourse } from './holes/links.js';
import { COURSES } from './holes/course.js';
import {
  GRID_Q_MAX,
  GRID_Q_MIN,
  GRID_ROW_MAX,
  GRID_ROW_MIN,
  gridRowToAxialR,
  isGridEdge,
  isWithinGrid,
  clipHoleToGrid
} from './holes/grid.js';

const canvas = document.getElementById('edit-canvas');
const ctx = canvas.getContext('2d');

const HEX_RADIUS = 8.5;
const ORIGIN_X = 190;
const ORIGIN_Y = 381;

const TERRAIN = {
  tee: '#cddc39',
  fairway: '#4caf50',
  rough: '#dcedc8',
  deep_rough: '#aed581',
  trees: '#81c784',
  sand: '#fbc02d',
  water: '#0288d1',
  green: '#2e7d32',
  hole: '#1a1a1a',
  crazy_fairway: '#00897b',
  bumper: '#e91e63',
  windmill: '#00c853',
  tube_in: '#00b4d8',
  tube_out: '#76ff03',
  ramp: '#ffd600',
  funnel: '#7c4dff'
};

const TERRAIN_NAMES = {
  tee: 'Tee Area',
  fairway: 'Fairway',
  rough: 'Rough',
  deep_rough: 'Deep Rough',
  trees: 'Trees / Woods',
  sand: 'Sand Bunker',
  water: 'Water Hazard',
  green: 'Putting Green',
  hole: 'Pin / Cup',
  crazy_fairway: 'Carpet Fairway',
  bumper: 'Bumper Rail',
  windmill: 'Windmill Gate',
  tube_in: 'Warp Tube (In)',
  tube_out: 'Warp Tube (Out)',
  ramp: 'Speed Ramp',
  funnel: 'Loop-de-Loop Funnel'
};

const ARROW_SYMBOLS = ['↑', '↗', '↘', '↓', '↙', '↖'];

let currentBrush = 'crazy_fairway';
let selectedSlopeDir = null;
let paintedLayout = {};
let paintedSlopes = {};
let isMouseDown = false;

export function selectBrush(type, slopeDir = null, targetEl = null) {
  currentBrush = type;
  selectedSlopeDir = slopeDir;
  document.querySelectorAll('.palette button').forEach((b) => b.classList.remove('active'));
  if (targetEl) {
    targetEl.classList.add('active');
  }
}

function hexToPixel(q, r) {
  const x = HEX_RADIUS * (3 / 2 * q);
  const y = HEX_RADIUS * Math.sqrt(3) * (r + q / 2);
  return { x: ORIGIN_X + x, y: ORIGIN_Y + y };
}

function pixelToHex(x, y) {
  const px = x - ORIGIN_X;
  const py = y - ORIGIN_Y;
  const q = (2 / 3 * px) / HEX_RADIUS;
  const r = (-1 / 3 * px + Math.sqrt(3) / 3 * py) / HEX_RADIUS;
  
  let rx = Math.round(q);
  let ry = Math.round(r);
  let rz = Math.round(-q - r);
  
  const x_diff = Math.abs(rx - q);
  const y_diff = Math.abs(ry - r);
  const z_diff = Math.abs(rz - (-q - r));
  
  if (x_diff > y_diff && x_diff > z_diff) {
    rx = -ry - rz;
  } else if (y_diff > z_diff) {
    ry = -rx - rz;
  }
  
  return { q: rx, r: ry };
}

function drawHex(x, y, type, slopeDir = null) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    const px = x + HEX_RADIUS * Math.cos(angle);
    const py = y + HEX_RADIUS * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  
  const fillColor = TERRAIN[type] || TERRAIN.rough;
  let strokeColor = '#9ccc65';
  let strokeWidth = 0.8;

  if (type === 'windmill') {
    strokeColor = '#1b5e20';
    strokeWidth = 1.6;
  } else if (type === 'bumper') {
    strokeColor = '#880e4f';
    strokeWidth = 1.5;
  } else if (type === 'tube_in') {
    strokeColor = '#0077b6';
    strokeWidth = 1.4;
  } else if (type === 'tube_out') {
    strokeColor = '#33691e';
    strokeWidth = 1.4;
  } else if (type === 'ramp') {
    strokeColor = '#f57f17';
    strokeWidth = 1.4;
  } else if (type === 'funnel') {
    strokeColor = '#4a148c';
    strokeWidth = 1.4;
  } else if (type === 'crazy_fairway') {
    strokeColor = '#004d40';
  } else if (type === 'sand') {
    strokeColor = '#f57f17';
  } else if (type === 'water') {
    strokeColor = '#01579b';
  }

  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.stroke();
  
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Specific glyphs / icons matching game engine
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
    ctx.fillText('✢', x, y);
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
  } else if (type === 'funnel') {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('↺', x, y);
  } else if (type === 'hole') {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#fdfdfd';
    ctx.fill();
    ctx.fillStyle = '#ff1744';
    ctx.font = 'bold 7px monospace';
    ctx.fillText('⛳', x, y);
  } else if (type === 'tee') {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 7px monospace';
    ctx.fillText('T', x, y);
  }

  if (slopeDir !== null && slopeDir !== undefined) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(ARROW_SYMBOLS[slopeDir] || '↑', x, y);
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  for (let row = GRID_ROW_MIN; row <= GRID_ROW_MAX; row++) {
    for (let q = GRID_Q_MIN; q <= GRID_Q_MAX; q++) {
      const r = gridRowToAxialR(q, row);
      const { x, y } = hexToPixel(q, r);
      if (x >= -15 && x <= canvas.width + 15 && y >= -15 && y <= canvas.height + 15) {
        const key = `${q},${r}`;
        const type = paintedLayout[key] || (isGridEdge(q, r) ? 'trees' : 'rough');
        const slope = paintedSlopes[key] !== undefined ? paintedSlopes[key] : null;
        drawHex(x, y, type, slope);
      }
    }
  }
}

function handlePaint(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const { q, r } = pixelToHex(x, y);
  const key = `${q},${r}`;

  // Update hover display
  const hoverCoord = document.getElementById('hover-coord');
  const hoverTerrain = document.getElementById('hover-terrain');
  if (hoverCoord) hoverCoord.textContent = `(${q}, ${r})`;
  if (hoverTerrain) {
    const curType = paintedLayout[key] || 'rough';
    hoverTerrain.textContent = TERRAIN_NAMES[curType] || curType;
  }
  if (!isWithinGrid(q, r)) return;
  
  if (currentBrush === 'slope') {
    paintedSlopes[key] = selectedSlopeDir;
  } else if (currentBrush === 'clearSlope') {
    delete paintedSlopes[key];
  } else if (currentBrush === 'rough') {
    delete paintedLayout[key];
    delete paintedSlopes[key];
  } else {
    paintedLayout[key] = currentBrush;
  }
  render();
}

function showStatus(msg, isError = false) {
  const el = document.getElementById('status-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = isError ? 'status-error' : 'status-success';
  setTimeout(() => {
    el.style.display = 'none';
  }, 4000);
}

export function generateCode() {
  const id = document.getElementById('hole-id').value || '1';
  const padId = id.toString().padStart(2, '0');
  const par = document.getElementById('hole-par').value || '4';
  const name = document.getElementById('hole-name').value || 'Custom Hole';
  const subtitle = document.getElementById('hole-subtitle').value || '';
  const isCrazyMode = document.getElementById('is-crazy-golf').checked;
  
  let teePos = { q: 0, r: 0 };
  let holePos = { q: 0, r: -15 };
  let windmillPos = null;
  let tubeInPos = null;
  let tubeOutPos = null;
  let funnelPos = null;
  const rampPos = [];
  
  // Group coordinates by terrain
  const groups = {};
  let detectedCrazyElements = false;
  
  for (const [key, val] of Object.entries(paintedLayout)) {
    const [q, r] = key.split(',').map(Number);
    if (val === 'tee') teePos = { q, r };
    if (val === 'hole') holePos = { q, r };
    if (val === 'windmill') windmillPos = { q, r };
    if (val === 'tube_in') tubeInPos = { q, r };
    if (val === 'tube_out') tubeOutPos = { q, r };
    if (val === 'funnel') funnelPos = { q, r };
    if (val === 'ramp') rampPos.push({ q, r });

    if (['crazy_fairway', 'bumper', 'windmill', 'tube_in', 'tube_out', 'ramp', 'funnel'].includes(val)) {
      detectedCrazyElements = true;
    }

    if (!groups[val]) groups[val] = [];
    groups[val].push(key);
  }

  const isCrazy = isCrazyMode || detectedCrazyElements;

  // Desired ordering for clean layout spec
  const terrainOrder = [
    'tee', 'hole', 'green', 'fairway', 'crazy_fairway',
    'bumper', 'windmill', 'tube_in', 'tube_out', 'ramp', 'funnel',
    'deep_rough', 'sand', 'water', 'trees'
  ];
  const specLines = [];

  for (const t of terrainOrder) {
    if (groups[t] && groups[t].length > 0) {
      groups[t].sort((a, b) => {
        const [qa, ra] = a.split(',').map(Number);
        const [qb, rb] = b.split(',').map(Number);
        return ra !== rb ? ra - rb : qa - qb;
      });

      const coords = groups[t];
      if (coords.length <= 4) {
        specLines.push(`    ${t}: "${coords.join(' ')}"`);
      } else {
        const chunks = [];
        for (let i = 0; i < coords.length; i += 10) {
          chunks.push('      ' + coords.slice(i, i + 10).join(' '));
        }
        specLines.push(`    ${t}: \`\n${chunks.join('\n')}\n    \``);
      }
    }
  }

  for (const [t, coords] of Object.entries(groups)) {
    if (!terrainOrder.includes(t) && coords.length > 0) {
      specLines.push(`    ${t}: "${coords.join(' ')}"`);
    }
  }

  const slopeStr = JSON.stringify(paintedSlopes, null, 2);

  let extraProps = '';
  if (isCrazy) {
    extraProps += `  subtitle: "${subtitle || 'Crazy Miniature Golf Prototype'}",\n`;
    extraProps += `  isCrazyGolf: true,\n`;
    if (windmillPos) extraProps += `  windmillPos: { q: ${windmillPos.q}, r: ${windmillPos.r} },\n`;
    if (tubeInPos) extraProps += `  tubeInPos: { q: ${tubeInPos.q}, r: ${tubeInPos.r} },\n`;
    if (tubeOutPos) extraProps += `  tubeOutPos: { q: ${tubeOutPos.q}, r: ${tubeOutPos.r} },\n`;
    if (funnelPos) extraProps += `  funnelPos: { q: ${funnelPos.q}, r: ${funnelPos.r} },\n`;
    if (rampPos.length > 0) {
      extraProps += `  rampPos: [\n${rampPos.map((p) => `    { q: ${p.q}, r: ${p.r} }`).join(',\n')}\n  ],\n`;
    }
  }

  const varName = isCrazy ? `crazyHole${padId}` : `hole${padId}`;

  const code = `// Helper function (add once to course definition file)
// function parseCoords(spec) {
//   const layout = {};
//   for (const [type, coords] of Object.entries(spec)) {
//     if (typeof coords === 'string') {
//       coords.trim().split(/\\s+/).forEach(c => { if (c) layout[c] = type; });
//     }
//   }
//   return layout;
// }

// Hole ${id}: Par ${par} (${name})
export const ${varName} = {
  id: ${id},
  par: ${par},
  name: "${name}",
${extraProps}  tee: { q: ${teePos.q}, r: ${teePos.r} },
  hole: { q: ${holePos.q}, r: ${holePos.r} },
  slopeArrows: ${slopeStr},
  layout: parseCoords({
${specLines.join(',\n')}
  })
};`;
  
  document.getElementById('output-code').value = code;
  showStatus(`Generated JS export for ${name}!`);
}

export function loadExistingCode() {
  const code = document.getElementById('output-code').value.trim();
  if (!code) {
    showStatus('Please paste JS code into the text area first.', true);
    return;
  }

  try {
    const idMatch = code.match(/id:\s*(\d+)/);
    if (idMatch) document.getElementById('hole-id').value = idMatch[1];

    const parMatch = code.match(/par:\s*(\d+)/);
    if (parMatch) document.getElementById('hole-par').value = parMatch[1];

    const nameMatch = code.match(/name:\s*["']([^"']+)["']/);
    if (nameMatch) document.getElementById('hole-name').value = nameMatch[1];

    const subMatch = code.match(/subtitle:\s*["']([^"']+)["']/);
    if (subMatch) document.getElementById('hole-subtitle').value = subMatch[1];

    const isCrazy = code.includes('isCrazyGolf') || /crazy/i.test(code);
    document.getElementById('is-crazy-golf').checked = isCrazy;

    paintedLayout = {};
    paintedSlopes = {};

    const cleanCode = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    if (cleanCode.includes('parseCoords')) {
      const match = cleanCode.match(/parseCoords\s*\(\s*\{([\s\S]*?)\}\s*\)/);
      if (match) {
        const body = match[1];
        const sectionRegex = /([a-zA-Z_]+)\s*:\s*([`"'][\s\S]*?[`"'])/g;
        let sMatch;
        while ((sMatch = sectionRegex.exec(body)) !== null) {
          const type = sMatch[1];
          const content = sMatch[2];
          const coordRegex = /-?\d+,-?\d+/g;
          let cMatch;
          while ((cMatch = coordRegex.exec(content)) !== null) {
            paintedLayout[cMatch[0]] = type;
          }
        }
      }
    } else {
      const layoutMatches = [...cleanCode.matchAll(/["`']?(-?\d+,-?\d+)["`']?\s*:\s*["`']([a-zA-Z_]+)["`']/g)];
      layoutMatches.forEach((m) => {
        paintedLayout[m[1]] = m[2];
      });
    }

    const slopesMatch = cleanCode.match(/slopeArrows\s*:\s*(\{[\s\S]*?\})\s*[,;\}]/);
    if (slopesMatch) {
      const slopeItems = [...slopesMatch[1].matchAll(/["`']?(-?\d+,-?\d+)["`']?\s*:\s*(\d+)/g)];
      slopeItems.forEach((m) => {
        paintedSlopes[m[1]] = parseInt(m[2], 10);
      });
    }

    const clippedHole = clipHoleToGrid({ layout: paintedLayout, slopeArrows: paintedSlopes });
    paintedLayout = clippedHole.layout;
    paintedSlopes = clippedHole.slopeArrows;
    render();
    showStatus('Code successfully imported into editor canvas!');
  } catch (err) {
    showStatus('Error reading code: ' + err.message, true);
  }
}

export function loadHoleObject(holeObj) {
  if (!holeObj) return;

  document.getElementById('hole-id').value = holeObj.id || 1;
  document.getElementById('hole-par').value = holeObj.par || 4;
  document.getElementById('hole-name').value = holeObj.name || 'Custom Hole';
  document.getElementById('hole-subtitle').value = holeObj.subtitle || (holeObj.isCrazyGolf ? 'Crazy Miniature Golf Prototype' : 'Championship Hole');
  document.getElementById('is-crazy-golf').checked = !!holeObj.isCrazyGolf;

  paintedLayout = {};
  paintedSlopes = {};

  const clippedHole = clipHoleToGrid(holeObj);
  paintedLayout = clippedHole.layout;
  paintedSlopes = clippedHole.slopeArrows;

  render();
  generateCode();
  showStatus(`Loaded template: ${holeObj.name}`);
}

export function loadPreset(key) {
  if (!key) return;

  if (key === 'daily') {
    loadHoleObject(COURSES.daily.holes[0]);
  } else if (key === 'crazy') {
    loadHoleObject(crazyHole);
  } else if (key === 'parkland1') {
    loadHoleObject(parklandCourse[0]);
  } else if (key === 'parkland2') {
    loadHoleObject(parklandCourse[1]);
  } else if (key === 'links1') {
    loadHoleObject(linksCourse[0]);
  }
}

// Canvas interactions
canvas.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  handlePaint(e);
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const { q, r } = pixelToHex(x, y);
  const key = `${q},${r}`;
  const hoverCoord = document.getElementById('hover-coord');
  const hoverTerrain = document.getElementById('hover-terrain');
  if (hoverCoord) hoverCoord.textContent = `(${q}, ${r})`;
  if (hoverTerrain) {
    const curType = paintedLayout[key] || 'rough';
    hoverTerrain.textContent = TERRAIN_NAMES[curType] || curType;
  }

  if (isMouseDown) {
    handlePaint(e);
  }
});

window.addEventListener('mouseup', () => {
  isMouseDown = false;
});

// Touch support for mobile / tablet
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (e.touches.length > 0) {
    isMouseDown = true;
    handlePaint(e.touches[0]);
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (isMouseDown && e.touches.length > 0) {
    handlePaint(e.touches[0]);
  }
}, { passive: false });

canvas.addEventListener('touchend', () => {
  isMouseDown = false;
});

// Setup button click listeners
document.querySelectorAll('.palette button').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const brush = btn.getAttribute('data-brush');
    const slope = btn.getAttribute('data-slope');
    selectBrush(brush, slope !== null ? parseInt(slope, 10) : null, btn);
  });
});

document.getElementById('btn-export').addEventListener('click', generateCode);
document.getElementById('btn-import').addEventListener('click', loadExistingCode);

document.getElementById('btn-copy').addEventListener('click', () => {
  const textarea = document.getElementById('output-code');
  if (!textarea.value) {
    generateCode();
  }
  navigator.clipboard.writeText(textarea.value).then(() => {
    showStatus('JS Code copied to clipboard!');
  }).catch(() => {
    textarea.select();
    document.execCommand('copy');
    showStatus('JS Code copied to clipboard!');
  });
});

document.getElementById('btn-clear-canvas').addEventListener('click', () => {
  if (confirm('Clear all painted tiles and slopes on canvas?')) {
    paintedLayout = {};
    paintedSlopes = {};
    render();
    generateCode();
    showStatus('Grid cleared.');
  }
});

document.getElementById('btn-fill-trees').addEventListener('click', () => {
  for (let row = GRID_ROW_MIN; row <= GRID_ROW_MAX; row++) {
    for (let q = GRID_Q_MIN; q <= GRID_Q_MAX; q++) {
      const r = gridRowToAxialR(q, row);
      if (q <= GRID_Q_MIN + 2 || q >= GRID_Q_MAX - 2 ||
          row <= GRID_ROW_MIN + 2 || row >= GRID_ROW_MAX - 1) {
        paintedLayout[`${q},${r}`] = 'trees';
      }
    }
  }
  render();
  generateCode();
  showStatus('Added perimeter tree barrier.');
});

document.getElementById('sample-loader').addEventListener('change', (e) => {
  loadPreset(e.target.value);
});

// Initial startup: Load the Crazy Golf Hole preset as the default to showcase Crazy Golf elements!
loadHoleObject(crazyHole);

// Set Crazy Fairway as active brush initially
const initBtn = document.querySelector('[data-brush="crazy_fairway"]');
if (initBtn) {
  selectBrush('crazy_fairway', null, initBtn);
}
