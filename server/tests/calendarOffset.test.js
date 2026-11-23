const { zoneOffset } = require('../routes/calendar');

test('Eastern offsets follow daylight saving time', () => {
  expect(zoneOffset('2026-01-15', '11:02', 'America/New_York')).toBe('-05:00');
  expect(zoneOffset('2026-05-15', '11:02', 'America/New_York')).toBe('-04:00');
});

test('other zones, including half-hour offsets and UTC', () => {
  expect(zoneOffset('2026-01-15', '11:02', 'America/Chicago')).toBe('-06:00');
  expect(zoneOffset('2026-01-15', '11:02', 'America/Phoenix')).toBe('-07:00');
  expect(zoneOffset('2026-01-15', '11:02', 'Asia/Kolkata')).toBe('+05:30');
  expect(zoneOffset('2026-01-15', '11:02', 'America/St_Johns')).toBe('-03:30');
  expect(zoneOffset('2026-01-15', '11:02', 'UTC')).toBe('+00:00');
});

test('the day after a DST change uses the new offset', () => {
  // US DST 2026 starts Sunday March 8; Monday lunch is on daylight time.
  expect(zoneOffset('2026-03-06', '11:02', 'America/New_York')).toBe('-05:00');
  expect(zoneOffset('2026-03-09', '11:02', 'America/New_York')).toBe('-04:00');
});
