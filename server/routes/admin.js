const express = require('express');
const router = express.Router();
const { Readable } = require('stream');
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const TutoringRequest = require('../models/TutoringRequest');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const {
  buildRequestInclude,
  toLeanRequest,
  getPrioritySubjectForDay,
  summarizeTutoring,
  studentTutoringDetail
} = require('../utils/tutoringQueries');
const {
  RR_GROUPS,
  schoolYearStartDate,
  schoolTodayDateOnly,
  resolveRange
} = require('../utils/tutoringScope');
const schoolSettings = require('../utils/schoolSettings');
const { gradeLevel, gradeLevelBuckets } = require('../utils/schoolCalendar');

// Everything in this file is mounted behind auth + requireAdmin in server.js.

const LUNCHES = ['A', 'B', 'C', 'D'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const fullName = (p) => (p ? `${p.first_name} ${p.last_name}` : 'Unknown');

// 'YYYY-MM-DD' -> local-midnight Date, so getDay() is the calendar weekday
// rather than whatever UTC midnight happens to be in the server's zone.
function dateFromDateOnly(value) {
  const str = value instanceof Date ? value.toISOString().split('T')[0] : String(value);
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Monday of the week containing `date`, as 'YYYY-MM-DD'. Tutoring only runs on
// weekdays, so labelling weeks by their Monday reads naturally.
function weekStart(date) {
  const d = new Date(date);
  const offset = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - offset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Grade is inferred from the student ID's first two digits (see
// utils/schoolCalendar.js), the same rule the tutoring-analytics-report repo's
// Student.getGradeLevel uses.

// Teachers who share an RR with `mainId` (see RR_GROUPS), so the admin view
// can show who the board actually belongs to.
function rrGroupMemberIds(mainId) {
  return Object.entries(RR_GROUPS)
    .filter(([, main]) => main === mainId)
    .map(([member]) => Number(member));
}

// @route   GET api/admin/today
// @desc    Everything happening in tutoring today, school-wide
// @access  Admin
router.get('/today', async (req, res) => {
  try {
    const today = schoolTodayDateOnly();
    const requests = await TutoringRequest.findAll({
      where: { date: today, status: 'active' },
      include: buildRequestInclude('mine', null),
      order: [['id', 'ASC']]
    });
    const lean = requests.map(toLeanRequest);

    // One row per student, answering "should this student be out of RR, and
    // where are they headed?" - what an admin needs when they meet a student
    // in the hall. Shared RRs (RR_GROUPS) list every teacher in the room, so
    // it's recognizable by whichever name the admin knows it by.
    const mainIds = [...new Set(lean.map(r => r.Student?.RR?.id).filter(Boolean))];
    const memberIds = mainIds.flatMap(rrGroupMemberIds);
    const members = memberIds.length
      ? await Teacher.findAll({ where: { id: memberIds }, attributes: ['id', 'first_name', 'last_name'], raw: true })
      : [];
    const memberNameById = Object.fromEntries(members.map(m => [m.id, fullName(m)]));
    const rrLabel = (rr) => [fullName(rr), ...rrGroupMemberIds(rr.id).map(id => memberNameById[id]).filter(Boolean)].join(' / ');

    const lastFirst = (p) => (p ? `${p.last_name}, ${p.first_name}` : 'Unknown');

    // A booking spanning non-adjacent lunches is stored as separate requests,
    // so fold them into one row per student. If different teachers have them
    // at different lunches, say which lunch is with whom.
    const byStudent = new Map();
    for (const r of lean) {
      if (!byStudent.has(r.StudentId)) {
        byStudent.set(r.StudentId, {
          studentId: r.StudentId,
          studentName: lastFirst(r.Student),
          leavingFrom: r.Student?.RR ? rrLabel(r.Student.RR) : null,
          stops: new Map() // tutoring teacher -> lunches
        });
      }
      const teacher = fullName(r.Teacher);
      const stops = byStudent.get(r.StudentId).stops;
      stops.set(teacher, [...(stops.get(teacher) || []), ...LUNCHES.filter(l => r[`lunch${l}`])]);
    }
    const leaving = [...byStudent.values()]
      .map(({ stops, ...row }) => {
        const lunches = LUNCHES.filter(l => [...stops.values()].some(ls => ls.includes(l)));
        const goingTo = stops.size === 1
          ? [...stops.keys()][0]
          : [...stops].map(([teacher, ls]) => `${teacher} (${LUNCHES.filter(l => ls.includes(l)).join(', ')})`).join(' · ');
        return { ...row, goingTo, lunches };
      })
      .sort((x, y) => x.studentName.localeCompare(y.studentName));

    res.json({
      date: today,
      prioritySubject: getPrioritySubjectForDay(today),
      uniqueStudents: new Set(lean.map(r => r.StudentId)).size,
      leaving
    });
  } catch (err) {
    console.error('Admin today error:', err);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/trends
// @desc    School-wide trends over a date range (defaults to this school year)
// @access  Admin
//
// The same measures as the Kotlin Excel report (tutoring-analytics-report
// repo), served live. Aggregation runs
// in SQL down to per-day / per-teacher / per-student rows, and the calendar
// bucketing (weeks, weekdays, grades) happens here so it behaves identically
// on SQLite in development and Postgres in production.
router.get('/trends', async (req, res) => {
  try {
    const range = resolveRange(req.query);
    if (!range) {
      return res.status(400).json({ msg: 'Dates must be formatted YYYY-MM-DD' });
    }
    const { from, to } = range;
    const dateRange = { [Op.between]: [from, to] };
    // Sessions the student actually attended. Absences are counted on their own
    // so "booked" and "showed up" can be told apart.
    const activeInRange = { status: 'active', absent: false, date: dateRange };
    const count = [sequelize.fn('COUNT', sequelize.col('TutoringRequest.id')), 'count'];

    const [perDay, perTeacher, perStudent, perStatus, activeStudentCount, absences] = await Promise.all([
      TutoringRequest.findAll({
        where: activeInRange,
        attributes: ['date', count],
        group: ['date'],
        raw: true
      }),
      TutoringRequest.findAll({
        where: activeInRange,
        attributes: ['TeacherId', count],
        include: [{ model: Teacher, attributes: ['first_name', 'last_name', 'subject'] }],
        group: ['TeacherId', 'Teacher.id', 'Teacher.first_name', 'Teacher.last_name', 'Teacher.subject'],
        raw: true
      }),
      TutoringRequest.findAll({
        where: activeInRange,
        attributes: ['StudentId', count],
        group: ['StudentId'],
        raw: true
      }),
      TutoringRequest.findAll({
        where: { date: dateRange },
        attributes: ['status', count],
        group: ['status'],
        raw: true
      }),
      Student.count({ where: { active: true } }),
      TutoringRequest.count({ where: { status: 'active', absent: true, date: dateRange } })
    ]);

    const byWeek = {};
    const byDayOfWeek = Object.fromEntries(WEEKDAYS.map(d => [d, 0]));
    let totalSessions = 0;
    for (const row of perDay) {
      const n = parseInt(row.count, 10);
      const date = dateFromDateOnly(row.date);
      totalSessions += n;
      const week = weekStart(date);
      byWeek[week] = (byWeek[week] || 0) + n;
      const dayName = WEEKDAYS[date.getDay() - 1];
      if (dayName) byDayOfWeek[dayName] += n;
    }

    const byDepartment = {};
    const teacherRows = perTeacher.map(row => {
      const sessions = parseInt(row.count, 10);
      const subject = row['Teacher.subject'] || 'Unknown';
      byDepartment[subject] = (byDepartment[subject] || 0) + sessions;
      return {
        teacherId: row.TeacherId,
        name: `${row['Teacher.first_name']} ${row['Teacher.last_name']}`,
        subject,
        sessions
      };
    });
    // Percentile = share of teachers with fewer sessions (matches the report).
    const sortedCounts = teacherRows.map(t => t.sessions).sort((a, b) => a - b);
    const byTeacher = teacherRows
      .map(t => ({
        ...t,
        percentile: Math.floor((sortedCounts.indexOf(t.sessions) / sortedCounts.length) * 100)
      }))
      .sort((a, b) => b.sessions - a.sessions);

    const yearStart = parseInt(schoolYearStartDate(dateFromDateOnly(to)).slice(0, 4), 10);
    // null when the school has turned grade levels off.
    const byGradeLevel = gradeLevelBuckets();
    if (byGradeLevel) {
      for (const row of perStudent) {
        byGradeLevel[gradeLevel(row.StudentId, yearStart)] += parseInt(row.count, 10);
      }
    }

    const tutoredIds = perStudent.map(r => r.StudentId);
    const activeStudentsTutored = tutoredIds.length
      ? await Student.count({ where: { active: true, id: tutoredIds } })
      : 0;

    res.json({
      from,
      to,
      totalSessions,
      absences,
      uniqueStudents: perStudent.length,
      activeStudentsWithoutSessions: activeStudentCount - activeStudentsTutored,
      byStatus: Object.fromEntries(perStatus.map(r => [r.status, parseInt(r.count, 10)])),
      byWeek: Object.keys(byWeek).sort().map(week => ({ week, sessions: byWeek[week] })),
      byDayOfWeek,
      byDepartment,
      byTeacher,
      byGradeLevel
    });
  } catch (err) {
    console.error('Admin trends error:', err);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/students/:id/tutoring
// @desc    One student's tutoring over a date range, by tutoring teacher -
//          the admin "Student lookup" (any student; teachers only ever see
//          their own SPED caseload, via /api/caseload)
// @access  Admin
router.get('/students/:id/tutoring', async (req, res) => {
  try {
    const range = resolveRange(req.query);
    if (!range) {
      return res.status(400).json({ msg: 'Dates must be formatted YYYY-MM-DD' });
    }
    const student = await Student.findByPk(req.params.id, { attributes: ['id', 'first_name', 'last_name'] });
    if (!student) {
      return res.status(404).json({ msg: 'Student not found' });
    }
    const summary = await summarizeTutoring([student.id], range.from, range.to);
    res.json({
      ...range,
      student: { id: student.id, first_name: student.first_name, last_name: student.last_name, ...summary.get(student.id) }
    });
  } catch (err) {
    console.error('Admin student lookup error:', err);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/students/:id/sessions
// @desc    One student's sessions (date, lunches, minutes, teacher, subject)
//          plus totals - the popup behind a name in Student Lookup
// @access  Admin
router.get('/students/:id/sessions', async (req, res) => {
  try {
    const range = resolveRange(req.query);
    if (!range) {
      return res.status(400).json({ msg: 'Dates must be formatted YYYY-MM-DD' });
    }
    const detail = await studentTutoringDetail(req.params.id, range.from, range.to);
    if (!detail) {
      return res.status(404).json({ msg: 'Student not found' });
    }
    res.json(detail);
  } catch (err) {
    console.error('Admin student detail error:', err);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/report
// @desc    Run the Kotlin Excel report and stream the .xlsx back
// @access  Admin
//
// The report is its own service (tutoring-analytics-report), reachable
// only over the project's private network and guarded by a shared token, so
// REPORT_SERVICE_URL and REPORT_TOKEN live on this backend service - never on
// the frontend, whose env vars are compiled into the browser bundle. The
// service sleeps when idle, so the first request after a quiet spell includes
// a JVM cold start - hence the generous timeout.
router.get('/report', async (req, res) => {
  const baseUrl = process.env.REPORT_SERVICE_URL;
  const token = process.env.REPORT_TOKEN;
  if (!baseUrl || !token) {
    return res.status(503).json({
      msg: 'The report service is not configured. Set REPORT_SERVICE_URL and REPORT_TOKEN on the backend service.'
    });
  }

  try {
    const upstream = await fetch(`${baseUrl.replace(/\/+$/, '')}/report`, {
      headers: { 'X-Report-Token': token },
      signal: AbortSignal.timeout(120_000)
    });
    if (!upstream.ok || !upstream.body) {
      console.error('Report service responded', upstream.status);
      return res.status(502).json({ msg: `The report service failed (HTTP ${upstream.status}).` });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tutoring_report_${schoolTodayDateOnly()}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('Report service error:', err.message);
    const timedOut = err.name === 'TimeoutError';
    res.status(timedOut ? 504 : 502).json({
      msg: timedOut ? 'The report took too long to generate.' : 'Could not reach the report service.'
    });
  }
});

// @route   GET api/admin/settings
// @desc    Every school setting, including admin-only ones
// @access  Admin
router.get('/settings', (req, res) => {
  res.json(schoolSettings.getAll());
});

// @route   PUT api/admin/settings
// @desc    Change one or more settings: { "homeroomLabel": "Advisory", ... }.
//          All values are validated before any is saved; null resets a
//          setting to its default. Returns every setting after the change.
// @access  Admin
router.put('/settings', async (req, res) => {
  try {
    res.json(await schoolSettings.update(req.body));
  } catch (err) {
    if (err instanceof schoolSettings.SettingsError) {
      return res.status(400).json({ msg: err.message });
    }
    console.error('Settings update failed:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
