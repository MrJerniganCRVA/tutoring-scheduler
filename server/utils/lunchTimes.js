// The school's lunch blocks. Single source of truth for both the Google
// Calendar invite times (routes/calendar.js) and SPED service-minute totals.
const LUNCH_TIMES = {
  A: { start: '11:02', end: '11:25' },
  B: { start: '11:28', end: '11:51' },
  C: { start: '11:54', end: '12:17' },
  D: { start: '12:20', end: '12:44' }
};

const LUNCHES = Object.keys(LUNCH_TIMES);

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Length of each block in minutes: A/B/C 23, D 24.
const LUNCH_MINUTES = Object.fromEntries(
  LUNCHES.map(l => [l, toMinutes(LUNCH_TIMES[l].end) - toMinutes(LUNCH_TIMES[l].start)])
);

// Lunches booked on a request row (lunchA..lunchD flags), in order.
const lunchesOf = (request) => LUNCHES.filter(l => request[`lunch${l}`]);

// Service minutes for a request: the sum of its booked blocks. Passing time
// between back-to-back lunches is not tutoring, so A+B is 23 + 23 = 46.
const minutesFor = (lunches) => lunches.reduce((sum, l) => sum + LUNCH_MINUTES[l], 0);

module.exports = { LUNCH_TIMES, LUNCHES, LUNCH_MINUTES, lunchesOf, minutesFor };
