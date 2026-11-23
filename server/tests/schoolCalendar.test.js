jest.mock('../config/db', () => {
  const { Sequelize } = require('sequelize');
  return new Sequelize('sqlite::memory:', { logging: false });
});

const sequelize = require('../config/db');
const settings = require('../utils/schoolSettings');
const cal = require('../utils/schoolCalendar');

beforeEach(async () => {
  await sequelize.sync({ force: true });
  await settings.reload();
});
afterAll(() => sequelize.close());

// 2026-11-23 is a Monday.
const MON = '2026-11-23', TUE = '2026-11-24', WED = '2026-11-25', THU = '2026-11-26', FRI = '2026-11-27', SAT = '2026-11-28';

describe('with default settings (today\'s behaviour)', () => {
  test('priority subjects by weekday', () => {
    expect([MON, TUE, WED, THU, FRI, SAT].map(cal.getPrioritySubjectForDay))
      .toEqual(['CS', 'Math', null, 'Humanities', 'Science', null]);
  });

  test('no tutoring on Wednesdays or weekends', () => {
    expect([MON, WED, SAT, '2026-11-29'].map(cal.isTutoringDay)).toEqual([true, false, false, false]);
    expect(cal.noPriorityMessage(WED)).toBe('No tutoring on Wednesdays');
    expect(cal.noPriorityMessage(SAT)).toBe('No tutoring on Weekends');
  });

  test('accepts the ISO timestamps the client sends', () => {
    expect(cal.weekdayOf('2026-11-24T00:00:00.000Z')).toBe(2);
    expect(cal.isTutoringDay('2026-11-25T00:00:00.000Z')).toBe(false);
  });

  test('hasSubjectPriority', () => {
    expect(cal.hasSubjectPriority('CS', MON)).toBe(true);
    expect(cal.hasSubjectPriority('Math', MON)).toBe(false);
    expect(cal.hasSubjectPriority(null, WED)).toBe(false);
  });

  test('school year starts August 1', () => {
    expect(cal.schoolYearStartDate(new Date(2026, 6, 31))).toBe('2025-08-01');
    expect(cal.schoolYearStartDate(new Date(2026, 7, 1))).toBe('2026-08-01');
    expect(cal.schoolYearStartDate(new Date(2027, 1, 10))).toBe('2026-08-01');
  });

  test('grade from the student ID entry year', () => {
    expect(cal.gradeLevel(26000123, 2026)).toBe('9th');
    expect(cal.gradeLevel(23000123, 2026)).toBe('12th');
    expect(cal.gradeLevel(19000123, 2026)).toBe('Other');
    expect(cal.gradeLevelBuckets()).toEqual({ '9th': 0, '10th': 0, '11th': 0, '12th': 0, Other: 0 });
  });
});

describe('with a different school\'s settings', () => {
  beforeEach(() => settings.update({
    priorityByWeekday: { 3: 'Art', 1: 'Math' },
    noTutoringWeekdays: [0, 5, 6],
    schoolYearStart: { month: 9, day: 3 },
    gradeLevels: { enabled: true, labels: ['6th', '7th', '8th'] }
  }));

  test('priority and tutoring days follow the settings', () => {
    expect([MON, TUE, WED, THU, FRI].map(cal.getPrioritySubjectForDay))
      .toEqual(['Math', null, 'Art', null, null]);
    expect(cal.isTutoringDay(WED)).toBe(true);
    expect(cal.isTutoringDay(FRI)).toBe(false);
    expect(cal.noPriorityMessage(TUE)).toBe('No priority subject on Tuesdays - first come, first served');
    expect(cal.noPriorityMessage(FRI)).toBe('No tutoring on Fridays');
  });

  test('school year start and grade labels follow the settings', () => {
    expect(cal.schoolYearStartDate(new Date(2026, 8, 2))).toBe('2025-09-03');
    expect(cal.schoolYearStartDate(new Date(2026, 8, 3))).toBe('2026-09-03');
    expect(cal.gradeLevel(26000123, 2026)).toBe('6th');
    expect(cal.gradeLevel(24000123, 2026)).toBe('8th');
  });

  test('grade levels can be turned off', async () => {
    await settings.update({ gradeLevels: { enabled: false } });
    expect(cal.gradeLevel(26000123, 2026)).toBeNull();
    expect(cal.gradeLevelBuckets()).toBeNull();
  });
});
