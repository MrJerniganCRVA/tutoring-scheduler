// Local-calendar 'YYYY-MM-DD', matching the DATEONLY format the API stores
// and compares against.
//
// new Date().toISOString().split('T')[0] - the pattern this replaces - yields
// the *UTC* day, which rolls over to tomorrow during the evening in US
// timezones. That was harmless while the client filtered an already-downloaded
// list, but now that the day is sent to the server as a query param, an
// after-school page load would ask for the wrong day's requests.
export function toDateOnly(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayDateOnly() {
  return toDateOnly();
}

// First day of the current school year (Aug 1), matching the server's default
// window for the trends, caseload and student-lookup views.
export function schoolYearStartDateOnly(now = new Date()) {
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-08-01`;
}
