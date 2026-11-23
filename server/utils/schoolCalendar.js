// School-day rules, read from the school settings (utils/schoolSettings.js):
// which weekdays have tutoring, which subject has priority on each, when the
// school year starts and how a student's grade is worked out. Every function
// reads the settings on each call (from the in-memory cache), so a change an
// admin saves applies to the next request.
const schoolSettings = require('./schoolSettings');

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Weekday (0 = Sunday) of a date. Strings are read by their 'YYYY-MM-DD'
// part only - the client sends bookings as '2026-11-24T00:00:00.000Z' - and
// as a calendar day, never through UTC, so the day can't shift with the
// server's time zone.
function weekdayOf(date) {
  if (typeof date === 'string') {
    const [y, m, d] = date.slice(0, 10).split('-').map(n => parseInt(n, 10));
    return new Date(y, m - 1, d).getDay();
  }
  return new Date(date).getDay();
}

function isTutoringDay(date) {
  return !schoolSettings.get('noTutoringWeekdays').includes(weekdayOf(date));
}

// The subject with priority on `date`, or null (no priority that day, or no
// tutoring at all).
function getPrioritySubjectForDay(date) {
  if (!isTutoringDay(date)) return null;
  return schoolSettings.get('priorityByWeekday')[weekdayOf(date)] || null;
}

function hasSubjectPriority(teacherSubject, date) {
  const prioritySubject = getPrioritySubjectForDay(date);
  return prioritySubject !== null && teacherSubject === prioritySubject;
}

// Human-readable reason a day has no priority subject, for the date picker.
function noPriorityMessage(date) {
  const day = weekdayOf(date);
  if (!isTutoringDay(date)) {
    return day === 0 || day === 6 ? 'No tutoring on Weekends' : `No tutoring on ${WEEKDAY_NAMES[day]}s`;
  }
  return `No priority subject on ${WEEKDAY_NAMES[day]}s - first come, first served`;
}

// First day of the school year that `now` falls in, as 'YYYY-MM-DD'. With the
// default (August 1), anything from Aug 1 on belongs to the year just started.
function schoolYearStartDate(now = new Date()) {
  const { month, day } = schoolSettings.get('schoolYearStart');
  const startThisYear = new Date(now.getFullYear(), month - 1, day);
  const year = now >= startThisYear ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Grade label for a student, from the first two digits of their ID (the year
// they entered). `schoolYearStartYear` is the calendar year the current school
// year started in. Returns null when grade levels are turned off.
function gradeLevel(studentId, schoolYearStartYear) {
  const { enabled, labels } = schoolSettings.get('gradeLevels');
  if (!enabled) return null;
  const entryYear = parseInt(String(studentId).slice(0, 2), 10);
  const years = (schoolYearStartYear % 100) - entryYear;
  return labels[years] || 'Other';
}

// Empty buckets for grade-level charts, in order, or null when turned off.
function gradeLevelBuckets() {
  const { enabled, labels } = schoolSettings.get('gradeLevels');
  if (!enabled) return null;
  return Object.fromEntries([...labels, 'Other'].map(label => [label, 0]));
}

module.exports = {
  WEEKDAY_NAMES,
  weekdayOf,
  isTutoringDay,
  getPrioritySubjectForDay,
  hasSubjectPriority,
  noPriorityMessage,
  schoolYearStartDate,
  gradeLevel,
  gradeLevelBuckets
};
