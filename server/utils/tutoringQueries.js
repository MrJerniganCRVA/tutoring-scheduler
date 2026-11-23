const { Op } = require('sequelize');
const sequelize = require('../config/db');
const Teacher = require('../models/Teacher');
const TutoringRequest = require('../models/TutoringRequest');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const { TEACHER_LEAN_ATTRS, STUDENT_LEAN_ATTRS } = require('./enrollments');
const { LUNCH_TIMES, lunchesOf, minutesFor } = require('./lunchTimes');

// Query shapes shared by routes/tutoring.js and routes/admin.js, so the admin
// views return exactly the same request shape the teacher views do.

// Only the RR enrollment is ever needed alongside a tutoring request (the
// "Leaving RR Today" board keys off it). Loading just that one period instead
// of all five is what keeps this query from fanning out to
// requests x enrollments rows and serializing every rotation teacher twice.
//
// `scope === 'rr'` turns the same include into the filter itself: an inner
// join restricted to one RR teacher, so the database does the scoping.
function buildRequestInclude(scope, rrMainTeacherId) {
  const isRR = scope === 'rr';
  return [
    { model: Teacher, attributes: TEACHER_LEAN_ATTRS },
    {
      model: Student,
      attributes: STUDENT_LEAN_ATTRS,
      required: isRR,
      include: [{
        model: Enrollment,
        attributes: ['id', 'period'],
        where: isRR ? { period: 'RR', TeacherId: rrMainTeacherId } : { period: 'RR' },
        required: isRR,
        include: [{ model: Teacher, attributes: TEACHER_LEAN_ATTRS }]
      }]
    }
  ];
}

// The shape every tutoring endpoint returns. Deliberately narrow: this is the
// full set of fields the client actually reads. Notably absent are the
// student's email and the rest of their schedule, which the old response
// included for every request in the database.
function toLeanRequest(requestInstance) {
  const data = requestInstance.toJSON ? requestInstance.toJSON() : requestInstance;
  const student = data.Student;
  const rrTeacher = (student?.Enrollments || []).find(e => e.period === 'RR')?.Teacher || null;
  const name = (person) => (person
    ? { id: person.id, first_name: person.first_name, last_name: person.last_name }
    : null);

  return {
    id: data.id,
    date: data.date,
    status: data.status,
    lunchA: data.lunchA,
    lunchB: data.lunchB,
    lunchC: data.lunchC,
    lunchD: data.lunchD,
    invite_sent: data.invite_sent,
    absent: data.absent,
    calendar_event_id: data.calendar_event_id,
    TeacherId: data.TeacherId,
    StudentId: data.StudentId,
    Teacher: name(data.Teacher),
    Student: student ? { ...name(student), RR: name(rrTeacher) } : null
  };
}

// Used by the POST handlers, which always return a single request to the
// teacher who just created it.
const OWN_REQUEST_INCLUDE = buildRequestInclude('mine', null);

const getPrioritySubjectForDay = (date) => {
  let dateObj; 
  if(typeof date === 'string'){
    const [year, month, day] = date.split('-').map(num => parseInt(num, 10));
    dateObj = new Date(year, month - 1, day);
  } else {
    dateObj = new Date(date);
  }
  const dayOfWeek = dateObj.getDay()
  const priorityMap = {
    0: null,
    1: 'CS',
    2: 'Math',
    3: null,
    4: 'Humanities',
    5: 'Science',
    6: null
  };
  return priorityMap[dayOfWeek];
};
const hasSubjectPriority = (teacherSubject, date) =>{
  const prioritySubject = getPrioritySubjectForDay(date);
  return teacherSubject === prioritySubject;
};

// The active sessions for a set of students over a date range, with the
// tutoring teacher's name and subject. Shared by the summary and the
// per-student session list so both count exactly the same rows. Absent rows
// are included (flagged) so the session list can show them; the summary
// leaves them out of sessions and minutes.
//
// `teacherId` narrows to one tutoring teacher's sessions - the teacher
// analytics page, where a teacher only ever sees their own sessions with a
// student (the same rule GET /api/tutoring applies to past sessions).
function findSessions(studentIds, from, to, { teacherId } = {}) {
  const where = { StudentId: studentIds, status: 'active', date: { [Op.between]: [from, to] } };
  if (teacherId) where.TeacherId = teacherId;
  return TutoringRequest.findAll({
    where,
    attributes: ['id', 'StudentId', 'TeacherId', 'date', 'lunchA', 'lunchB', 'lunchC', 'lunchD', 'absent'],
    include: [{ model: Teacher, attributes: ['first_name', 'last_name', 'subject'] }],
    order: [['date', 'DESC'], ['id', 'DESC']],
    raw: true
  });
}

const teacherOf = (row) => ({
  teacherId: row.TeacherId,
  name: `${row['Teacher.first_name']} ${row['Teacher.last_name']}`,
  subject: row['Teacher.subject'] || 'Unknown'
});

// Adds one session to a { sessions, minutes } bucket keyed in `map`.
function tally(map, key, seed, minutes) {
  if (!map.has(key)) map.set(key, { ...seed, sessions: 0, minutes: 0 });
  const bucket = map.get(key);
  bucket.sessions += 1;
  bucket.minutes += minutes;
}

// Per-student tutoring totals over a date range: sessions and service minutes
// (see utils/lunchTimes.js), broken down by tutoring teacher and by subject
// (the tutoring teacher's subject). Backs the SPED caseload page and the admin
// student lookup. Every requested id gets an entry, so a student never
// tutored shows zeros. Sessions the student missed count only toward
// totalAbsences - service minutes are minutes actually delivered.
async function summarizeTutoring(studentIds, from, to, { teacherId } = {}) {
  const working = new Map(studentIds.map(id => [id, { totalSessions: 0, totalMinutes: 0, totalAbsences: 0, lastSession: null, teachers: new Map(), subjects: new Map() }]));
  if (studentIds.length > 0) {
    for (const row of await findSessions(studentIds, from, to, { teacherId })) {
      const entry = working.get(row.StudentId);
      if (!entry) continue;
      if (row.absent) {
        entry.totalAbsences += 1;
        continue;
      }
      const minutes = minutesFor(lunchesOf(row));
      const teacher = teacherOf(row);
      entry.totalSessions += 1;
      entry.totalMinutes += minutes;
      // Rows arrive newest first, so the first attended one is the latest.
      if (!entry.lastSession) entry.lastSession = row.date;
      tally(entry.teachers, teacher.teacherId, teacher, minutes);
      tally(entry.subjects, teacher.subject, { subject: teacher.subject }, minutes);
    }
  }

  const bySessions = (a, b) => b.minutes - a.minutes || b.sessions - a.sessions;
  const summary = new Map();
  for (const [id, { teachers, subjects, ...totals }] of working) {
    summary.set(id, {
      ...totals,
      byTeacher: [...teachers.values()].sort((a, b) => bySessions(a, b) || a.name.localeCompare(b.name)),
      bySubject: [...subjects.values()].sort((a, b) => bySessions(a, b) || a.subject.localeCompare(b.subject))
    });
  }
  return summary;
}

// Clock times for booked lunches, e.g. ['11:28–11:51'], so the client never
// keeps its own copy of the bell schedule.
const lunchTimesOf = (lunches) => lunches.map(l => `${LUNCH_TIMES[l].start}–${LUNCH_TIMES[l].end}`);

// One student's sessions over a date range, newest first - the detail behind
// summarizeTutoring, for reporting service minutes date by date.
async function listSessions(studentId, from, to, { teacherId } = {}) {
  const rows = await findSessions([studentId], from, to, { teacherId });
  return rows.map(row => {
    const lunches = lunchesOf(row);
    const { name, subject } = teacherOf(row);
    const absent = Boolean(row.absent);
    return {
      id: row.id,
      date: row.date,
      lunches,
      times: lunchTimesOf(lunches),
      minutes: absent ? 0 : minutesFor(lunches),
      absent,
      teacher: name,
      subject
    };
  });
}

// Everything the per-student detail popup shows: name, totals (overall, by
// subject, by teacher) and every session, for one student and date range.
// Returns null for an unknown student. Callers enforce who may see whom.
// `teacherId` limits everything to that tutoring teacher's sessions.
async function studentTutoringDetail(studentId, from, to, { teacherId } = {}) {
  const student = await Student.findByPk(studentId, { attributes: ['id', 'first_name', 'last_name'], raw: true });
  if (!student) return null;
  const [summary, sessions] = await Promise.all([
    summarizeTutoring([student.id], from, to, { teacherId }),
    listSessions(student.id, from, to, { teacherId })
  ]);
  return { from, to, student: { ...student, ...summary.get(student.id) }, sessions };
}

module.exports = {
  summarizeTutoring,
  listSessions,
  lunchTimesOf,
  studentTutoringDetail,
  buildRequestInclude,
  toLeanRequest,
  OWN_REQUEST_INCLUDE,
  getPrioritySubjectForDay,
  hasSubjectPriority
};
