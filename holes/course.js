import { parklandCourse } from './parkland.js';
import { linksCourse } from './links.js';
import { crazyCourse } from './crazyHole.js';
import { clipHoleToGrid } from './grid.js';

const parklandHoles = parklandCourse.map(clipHoleToGrid);
const linksHoles = linksCourse.map(clipHoleToGrid);
const crazyHoles = crazyCourse.map(clipHoleToGrid);

export const COURSES = {
  crazy: {
    id: 'crazy',
    name: 'Crazy Golf: Neon Windmill',
    difficulty: 'Arcade / Trick-Shot',
    badge: 'CRAZY GOLF',
    par: 36,
    holesCount: 9,
    description: 'Arcade mini-golf with putter stroke variations, spinning windmill blades, warp tubes, speed ramps, and bumper ricochet rails. Holes 2–9 are placeholders awaiting designs.',
    features: ['5 Putter Strokes', 'Bumper Ricochets', 'Warp Tubes', 'Speed Ramps', 'Spinning Windmill', 'Loop-de-Loop'],
    holes: crazyHoles,
    isCrazyGolf: true
  },
  parkland: {
    id: 'parkland',
    name: 'Meadow Wood Parkland',
    difficulty: 'Easy / Moderate',
    badge: 'PARKLAND',
    par: 36,
    holesCount: 9,
    description: 'Scenic tree-lined avenues with forgiving fairways, gentle greens, and serene water hazards.',
    features: ['Wide Fairways', 'Gentle Slopes', 'Traditional Bunkers', 'Manageable Rough'],
    holes: parklandHoles
  },
  links: {
    id: 'links',
    name: 'Dunecrest Links',
    difficulty: 'Demanding / Hard',
    badge: 'LINKS',
    par: 36,
    holesCount: 9,
    description: 'Treacherous coastal winds, punishing deep rough, hazardous pot bunkers, and steep crown greens.',
    features: ['Narrow Fairways', 'Punishing Deep Rough', 'Pot Bunkers', 'Contoured Slopes'],
    holes: linksHoles
  },
  daily: null
};

const DAILY_HOLE_POOL = [
  ...parklandHoles.map(hole => ({ hole, course: COURSES.parkland })),
  ...linksHoles.map(hole => ({ hole, course: COURSES.links })),
  ...crazyHoles.map(hole => ({ hole, course: COURSES.crazy }))
];

function hashSeed(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function formatDailyDate(seed) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seed)) return `Seed #${seed}`;
  const [year, month, day] = seed.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function getTodaySeedString() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

export function refreshDailyHole(seed = getTodaySeedString(), avoidCurrentSelection = false) {
  let selectionIndex = hashSeed(String(seed)) % DAILY_HOLE_POOL.length;
  if (avoidCurrentSelection) {
    const previousHole = COURSES.daily?.holes[0];
    const previousCourse = COURSES.daily?.sourceCourseId;
    const candidate = DAILY_HOLE_POOL[selectionIndex];
    if (candidate.course.id === previousCourse && candidate.hole.name === previousHole?.name) {
      selectionIndex = (selectionIndex + 1) % DAILY_HOLE_POOL.length;
    }
  }
  const selected = DAILY_HOLE_POOL[selectionIndex];
  const hole = { ...selected.hole, id: 1 };
  const dateStr = formatDailyDate(String(seed));
  COURSES.daily = {
    id: 'daily',
    name: `Hole of the Day: ${hole.name}`,
    difficulty: `${selected.course.name} • Par ${hole.par}`,
    badge: 'HOLE OF THE DAY',
    par: hole.par,
    holesCount: 1,
    description: `Today's featured hole is from ${selected.course.name}.`,
    features: [selected.course.name, hole.name, `Par ${hole.par}`],
    dateStr,
    sourceCourseId: selected.course.id,
    holes: [hole]
  };
  return COURSES.daily;
}

refreshDailyHole();

export const courseData = parklandCourse;
