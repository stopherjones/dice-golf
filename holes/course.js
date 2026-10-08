import { parklandCourse } from './parkland.js';
import { linksCourse } from './links.js';
import { generateDailyHole, getTodaySeedString } from './dailyHole.js';
import { crazyHole } from './crazyHole.js';

export const COURSES = {
  crazy: {
    id: 'crazy',
    name: 'Crazy Golf: Neon Windmill',
    difficulty: 'Arcade / Trick-Shot',
    badge: 'CRAZY GOLF',
    par: 4,
    holesCount: 1,
    description: 'Wild single-hole mini-golf prototype! Putter stroke variations (Tap, Flick, Hit, Whack, Blast), rotating windmill blades, warp tubes, speed ramps, and bumper ricochet rails.',
    features: ['5 Putter Strokes', 'Bumper Ricochets', 'Warp Tubes', 'Speed Ramps', 'Spinning Windmill', 'Loop-de-Loop'],
    holes: [crazyHole],
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
    holes: parklandCourse
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
    holes: linksCourse
  },
  daily: generateDailyHole(getTodaySeedString())
};

export function refreshDailyHole(seed) {
  COURSES.daily = generateDailyHole(seed || getTodaySeedString());
  return COURSES.daily;
}

export const courseData = parklandCourse;


