// Per-deployment settings: things the host sets once per school in the
// environment and that a school's own admins must not be able to change.
// School policy (priority days, labels, school year...) lives in the
// database instead - see utils/schoolSettings.js.
require('./env');

const DEFAULT_TIME_ZONE = 'America/New_York';

// ALLOWED_EMAIL_DOMAIN: the Google Workspace domain(s) staff sign in with.
// Comma-separated for schools with more than one (e.g. "school.org,district.org").
// Matching is exact on the part after "@", so "school.org" does not admit
// "evilschool.org" or "staff.school.org".
function parseDomains(raw) {
  return String(raw || '')
    .split(',')
    .map(d => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

function parseTimeZone(raw) {
  const zone = String(raw || '').trim();
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    throw new Error(`SCHOOL_TIME_ZONE "${zone}" is not a valid IANA time zone (e.g. America/Chicago).`);
  }
}

function load(env = process.env) {
  const allowedEmailDomains = parseDomains(env.ALLOWED_EMAIL_DOMAIN);
  const isProduction = env.NODE_ENV === 'production';

  // Fail closed in production: with no domain, any Google account whose email
  // matched a Teacher row could sign in.
  if (isProduction && allowedEmailDomains.length === 0) {
    throw new Error('ALLOWED_EMAIL_DOMAIN must be set in production (e.g. ALLOWED_EMAIL_DOMAIN=yourschool.org).');
  }

  return {
    allowedEmailDomains,
    schoolTimeZone: parseTimeZone(env.SCHOOL_TIME_ZONE),
    isProduction
  };
}

const deployment = load();

if (deployment.allowedEmailDomains.length === 0) {
  console.warn('[config] ALLOWED_EMAIL_DOMAIN is unset: sign-in accepts any Google domain (development only).');
}

// True when `email` is on an allowed domain, or when no domain is configured
// (development only - load() refuses that combination in production).
function isEmailAllowed(email, domains = deployment.allowedEmailDomains) {
  if (domains.length === 0) return true;
  const at = String(email || '').lastIndexOf('@');
  if (at < 1) return false;
  const domain = String(email).slice(at + 1).toLowerCase();
  return domains.includes(domain);
}

module.exports = {
  ...deployment,
  isEmailAllowed,
  // Exported for tests.
  load,
  parseDomains,
  parseTimeZone,
  DEFAULT_TIME_ZONE
};
