const { load, isEmailAllowed, parseDomains, parseTimeZone, DEFAULT_TIME_ZONE } = require('../config/deployment');

describe('ALLOWED_EMAIL_DOMAIN', () => {
  test('parses a comma-separated list, trimming, lowercasing and dropping a leading @', () => {
    expect(parseDomains(' School.org, @district.org ,')).toEqual(['school.org', 'district.org']);
  });

  test('matches the domain exactly', () => {
    const domains = ['school.org'];
    expect(isEmailAllowed('jane@school.org', domains)).toBe(true);
    expect(isEmailAllowed('Jane@SCHOOL.ORG', domains)).toBe(true);
    expect(isEmailAllowed('jane@evilschool.org', domains)).toBe(false);
    expect(isEmailAllowed('jane@staff.school.org', domains)).toBe(false);
    expect(isEmailAllowed('jane@school.org.evil.com', domains)).toBe(false);
    expect(isEmailAllowed('school.org', domains)).toBe(false);
    expect(isEmailAllowed('', domains)).toBe(false);
  });

  test('accepts any of several domains', () => {
    expect(isEmailAllowed('a@district.org', ['school.org', 'district.org'])).toBe(true);
  });

  test('with no domain configured, allows any email (development)', () => {
    expect(isEmailAllowed('anyone@gmail.com', [])).toBe(true);
  });

  test('is required in production', () => {
    expect(() => load({ NODE_ENV: 'production' })).toThrow(/ALLOWED_EMAIL_DOMAIN/);
    expect(load({ NODE_ENV: 'production', ALLOWED_EMAIL_DOMAIN: 'school.org' }).allowedEmailDomains).toEqual(['school.org']);
  });
});

describe('SCHOOL_TIME_ZONE', () => {
  test('defaults to America/New_York', () => {
    expect(parseTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(parseTimeZone('  ')).toBe(DEFAULT_TIME_ZONE);
  });

  test('accepts a valid IANA zone and rejects anything else', () => {
    expect(parseTimeZone('America/Chicago')).toBe('America/Chicago');
    expect(() => parseTimeZone('Mars/Olympus')).toThrow(/not a valid IANA time zone/);
  });
});
