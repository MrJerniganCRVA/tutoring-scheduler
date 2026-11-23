// Each test file gets its own in-memory SQLite database.
jest.mock('../config/db', () => {
  const { Sequelize } = require('sequelize');
  return new Sequelize('sqlite::memory:', { logging: false });
});

const sequelize = require('../config/db');
const SchoolConfig = require('../models/SchoolConfig');
const settings = require('../utils/schoolSettings');

beforeEach(async () => {
  await sequelize.sync({ force: true });
  await settings.reload();
});

afterAll(() => sequelize.close());

test('an empty table gives the original hard-coded behaviour', () => {
  expect(settings.getAll()).toEqual({
    schoolName: '',
    homeroomLabel: 'Raptor Rotation',
    homeroomShortLabel: 'RR',
    priorityByWeekday: { 1: 'CS', 2: 'Math', 4: 'Humanities', 5: 'Science' },
    noTutoringWeekdays: [0, 3, 6],
    schoolYearStart: { month: 8, day: 1 },
    calendarEventPrefix: 'RR Tutoring',
    gradeLevels: { enabled: true, labels: ['9th', '10th', '11th', '12th'] }
  });
});

test('the public view leaves out admin-only settings', () => {
  const pub = settings.getAll({ publicOnly: true });
  expect(pub).toHaveProperty('homeroomLabel');
  expect(pub).not.toHaveProperty('gradeLevels');
});

test('update validates, saves, and survives a reload', async () => {
  await settings.update({
    homeroomLabel: '  Advisory ',
    priorityByWeekday: { 1: 'Math', 3: '', 5: null },
    noTutoringWeekdays: [6, 0, 0]
  });
  await settings.reload();
  expect(settings.get('homeroomLabel')).toBe('Advisory');
  expect(settings.get('priorityByWeekday')).toEqual({ 1: 'Math' });
  expect(settings.get('noTutoringWeekdays')).toEqual([0, 6]);
});

test('one bad value rejects the whole batch', async () => {
  await expect(settings.update({ homeroomLabel: 'Advisory', schoolYearStart: { month: 2, day: 30 } }))
    .rejects.toThrow(settings.SettingsError);
  expect(settings.get('homeroomLabel')).toBe('Raptor Rotation');
  expect(await SchoolConfig.count()).toBe(0);
});

test.each([
  [{ unknownKey: 1 }, /Unknown setting/],
  [{ homeroomLabel: '' }, /cannot be empty/],
  [{ homeroomLabel: 42 }, /must be text/],
  [{ priorityByWeekday: { 7: 'CS' } }, /not a weekday number/],
  [{ priorityByWeekday: ['CS'] }, /must be an object/],
  [{ noTutoringWeekdays: [0, 1, 2, 3, 4, 5, 6] }, /every day/],
  [{ noTutoringWeekdays: [9] }, /0 \(Sunday\) to 6/],
  [{ schoolYearStart: { month: 13, day: 1 } }, /month must be 1-12/],
  [{ gradeLevels: { labels: [] } }, /labels must be/]
])('rejects %j', async (change, message) => {
  await expect(settings.update(change)).rejects.toThrow(message);
});

test('null resets a setting to its default', async () => {
  await settings.update({ homeroomLabel: 'Advisory' });
  await settings.update({ homeroomLabel: null });
  expect(settings.get('homeroomLabel')).toBe('Raptor Rotation');
  expect(await SchoolConfig.count()).toBe(0);
});

test('a stored value that no longer validates falls back to the default', async () => {
  await SchoolConfig.create({ key: 'schoolYearStart', value: '{"month":99}' });
  await SchoolConfig.create({ key: 'retiredSetting', value: '"x"' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await settings.reload();
  expect(settings.get('schoolYearStart')).toEqual({ month: 8, day: 1 });
});

test('returned values are copies, so callers cannot change the cache', () => {
  settings.get('priorityByWeekday')[1] = 'Art';
  expect(settings.get('priorityByWeekday')[1]).toBe('CS');
});
