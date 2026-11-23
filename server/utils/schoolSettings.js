// School policy settings: the rules a school's admins can change from the app
// (priority days, no-tutoring days, labels, school year...). Stored as
// key/value rows in SchoolConfig and cached in memory, so reading a setting
// never costs a query. Deployment settings that admins must NOT control
// (sign-in domain, time zone, secrets) live in config/deployment.js instead.
//
// Every setting has a default equal to the app's original hard-coded
// behaviour, so an empty SchoolConfig table behaves exactly like before.
//
// The cache is per process. The app runs one server process per school; if
// that ever changes, reload() needs to be triggered across processes.
const SchoolConfig = require('../models/SchoolConfig');

class SettingsError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const fail = (key, msg) => { throw new SettingsError(`${key}: ${msg}`); };

const text = (max) => (key, value) => {
  if (typeof value !== 'string') fail(key, 'must be text');
  const trimmed = value.trim();
  if (trimmed.length > max) fail(key, `must be at most ${max} characters`);
  return trimmed;
};

const requiredText = (max) => (key, value) => {
  const trimmed = text(max)(key, value);
  if (!trimmed) fail(key, 'cannot be empty');
  return trimmed;
};

const WEEKDAY_NUMBERS = [0, 1, 2, 3, 4, 5, 6]; // Sunday = 0, as Date#getDay()

// { "1": "CS", ... } - weekday number to the subject with priority that day.
// Weekdays left out (or null/empty) have no priority subject.
function priorityByWeekday(key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(key, 'must be an object of weekday number to subject');
  const out = {};
  for (const [day, subject] of Object.entries(value)) {
    const n = Number(day);
    if (!WEEKDAY_NUMBERS.includes(n)) fail(key, `"${day}" is not a weekday number (0 = Sunday ... 6 = Saturday)`);
    if (subject === null || subject === '') continue;
    if (typeof subject !== 'string' || !subject.trim()) fail(key, `subject for weekday ${n} must be text`);
    out[n] = subject.trim();
  }
  return out;
}

function weekdayList(key, value) {
  if (!Array.isArray(value)) fail(key, 'must be a list of weekday numbers');
  const days = [...new Set(value.map(Number))];
  if (days.some(d => !WEEKDAY_NUMBERS.includes(d))) fail(key, 'weekdays must be 0 (Sunday) to 6 (Saturday)');
  if (days.length === WEEKDAY_NUMBERS.length) fail(key, 'cannot block every day of the week');
  return days.sort((a, b) => a - b);
}

function monthDay(key, value) {
  const month = Number(value?.month);
  const day = Number(value?.day);
  if (!Number.isInteger(month) || month < 1 || month > 12) fail(key, 'month must be 1-12');
  // 2001 isn't a leap year, so Feb 29 is rejected: it wouldn't exist most years.
  const probe = new Date(Date.UTC(2001, month - 1, day));
  if (!Number.isInteger(day) || probe.getUTCMonth() !== month - 1) fail(key, 'day is not valid for that month');
  return { month, day };
}

function gradeLevels(key, value) {
  if (!value || typeof value !== 'object') fail(key, 'must be an object');
  const enabled = value.enabled !== false;
  const labels = value.labels ?? DEFINITIONS.gradeLevels.default.labels;
  if (!Array.isArray(labels) || labels.length === 0 || labels.length > 13) fail(key, 'labels must be a list of 1-13 grade names');
  return { enabled, labels: labels.map((l, i) => requiredText(20)(`${key}.labels[${i}]`, l)) };
}

// public: readable by every signed-in teacher via GET /api/settings.
const DEFINITIONS = {
  schoolName:          { default: '', public: true, validate: text(100) },
  homeroomLabel:       { default: 'Raptor Rotation', public: true, validate: requiredText(50) },
  homeroomShortLabel:  { default: 'RR', public: true, validate: requiredText(10) },
  priorityByWeekday:   { default: { 1: 'CS', 2: 'Math', 4: 'Humanities', 5: 'Science' }, public: true, validate: priorityByWeekday },
  noTutoringWeekdays:  { default: [0, 3, 6], public: true, validate: weekdayList },
  schoolYearStart:     { default: { month: 8, day: 1 }, public: true, validate: monthDay },
  calendarEventPrefix: { default: 'RR Tutoring', public: true, validate: requiredText(60) },
  // Grade is inferred from the first two digits of the student ID (the year
  // they entered); labels[0] is the entry year's grade.
  gradeLevels:         { default: { enabled: true, labels: ['9th', '10th', '11th', '12th'] }, public: false, validate: gradeLevels }
};

const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

let cache = new Map();

function parseStored(raw) {
  try { return JSON.parse(raw); } catch { return raw; }
}

// Read every row into the cache. Rows with unknown keys or values that no
// longer validate fall back to the default (and are logged) rather than
// stopping the server.
async function reload() {
  const rows = await SchoolConfig.findAll();
  const next = new Map();
  for (const row of rows) {
    const def = DEFINITIONS[row.key];
    if (!def) {
      console.warn(`[settings] ignoring unknown setting "${row.key}"`);
      continue;
    }
    try {
      next.set(row.key, def.validate(row.key, parseStored(row.value)));
    } catch (err) {
      console.error(`[settings] stored value for "${row.key}" is invalid, using default: ${err.message}`);
    }
  }
  cache = next;
}

function get(key) {
  const def = DEFINITIONS[key];
  if (!def) throw new Error(`Unknown setting "${key}"`);
  return clone(cache.has(key) ? cache.get(key) : def.default);
}

function getAll({ publicOnly = false } = {}) {
  const out = {};
  for (const [key, def] of Object.entries(DEFINITIONS)) {
    if (publicOnly && !def.public) continue;
    out[key] = get(key);
  }
  return out;
}

// Validate every change before writing any, so a bad value in a batch leaves
// all settings untouched. A null value resets that setting to its default.
async function update(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new SettingsError('Body must be an object of setting name to value');
  }
  const validated = [];
  for (const [key, value] of Object.entries(changes)) {
    const def = DEFINITIONS[key];
    if (!def) throw new SettingsError(`Unknown setting "${key}"`);
    validated.push([key, value === null ? null : def.validate(key, value)]);
  }

  await SchoolConfig.sequelize.transaction(async (transaction) => {
    for (const [key, value] of validated) {
      if (value === null) {
        await SchoolConfig.destroy({ where: { key }, transaction });
      } else {
        await SchoolConfig.upsert({ key, value: JSON.stringify(value) }, { transaction });
      }
    }
  });

  for (const [key, value] of validated) {
    if (value === null) cache.delete(key); else cache.set(key, value);
  }
  return getAll();
}

module.exports = { DEFINITIONS, SettingsError, reload, get, getAll, update };
