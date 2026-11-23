const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const TutoringRequest = require('../models/TutoringRequest');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/requireAdmin');
const { summarizeTutoring, studentTutoringDetail, lunchTimesOf } = require('../utils/tutoringQueries');
const { resolveRange, schoolTodayDateOnly } = require('../utils/tutoringScope');
const { lunchesOf } = require('../utils/lunchTimes');
const { CASELOAD_PERIOD } = require('./caseload');

// Enrollments that don't make a student one of the teacher's class students:
// a SPED caseload isn't a class (that lives on the Caseload page), and RR
// students aren't usually tutored by their RR teacher.
const NON_CLASS_PERIODS = [CASELOAD_PERIOD, 'RR'];

// Everything here is one teacher's own tutoring: sessions they ran, with the
// students they teach or have tutored. Sessions are counted the same way the
// caseload and admin views count them (utils/tutoringQueries.js): absent
// sessions add to absences, never to sessions or service minutes.

// A teacher's analytics are their own. Admins can read anyone's; everyone else
// gets 403 for any id but their own.
async function ownOrAdmin(req, res, next) {
    try {
        if (String(req.params.teacherId) === String(req.teacher.id) || await isAdmin(req.teacher.id)) {
            return next();
        }
        return res.status(403).json({ msg: 'You can only view your own analytics' });
    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
}

// from/to (YYYY-MM-DD, default this school year so far) for every route below.
function withRange(req, res, next) {
    const range = resolveRange(req.query);
    if (!range) {
        return res.status(400).json({ msg: 'Dates must be formatted YYYY-MM-DD' });
    }
    req.range = range;
    next();
}

// Date math on DATEONLY strings, done in UTC so a 'YYYY-MM-DD' never shifts a
// day depending on the server's timezone.
const parseDay = (dateOnly) => {
    const [y, m, d] = dateOnly.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};
const formatDay = (date) => date.toISOString().split('T')[0];
const mondayOf = (dateOnly) => {
    const date = parseDay(dateOnly);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return formatDay(date);
};
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Every Monday-start week from `from` to `to`, including empty ones, so a
// quiet week shows as a zero instead of vanishing from the chart.
function weekBuckets(from, to) {
    const weeks = new Map();
    const end = parseDay(to);
    for (const day = parseDay(mondayOf(from)); day <= end; day.setUTCDate(day.getUTCDate() + 7)) {
        weeks.set(formatDay(day), 0);
    }
    return weeks;
}

const studentName = (row) => `${row['Student.first_name']} ${row['Student.last_name']}`;

// Active students enrolled in one of the teacher's class periods (see
// NON_CLASS_PERIODS).
async function classStudentIds(teacherId) {
    const rows = await Enrollment.findAll({
        where: { TeacherId: teacherId, period: { [Op.notIn]: NON_CLASS_PERIODS } },
        attributes: ['StudentId'],
        include: [{ model: Student, attributes: [], where: { active: true } }],
        raw: true
    });
    return new Set(rows.map(r => r.StudentId));
}

// The students a teacher may look up here: their class students plus anyone
// they tutored in the range (even if since withdrawn).
async function rosterIds(teacherId, range) {
    const [classIds, tutored] = await Promise.all([
        classStudentIds(teacherId),
        TutoringRequest.findAll({
            where: {
                TeacherId: teacherId,
                status: 'active',
                date: { [Op.between]: [range.from, range.to] }
            },
            attributes: ['StudentId'],
            group: ['StudentId'],
            raw: true
        })
    ]);
    return { classIds, tutoredIds: new Set(tutored.map(r => r.StudentId)) };
}

// Same rule as rosterIds for one student, but over every session ever, so a
// student tutored last year can still be opened with an older date range.
async function isRosterStudent(teacherId, studentId) {
    const [enrolled, tutored] = await Promise.all([
        Enrollment.count({ where: { TeacherId: teacherId, StudentId: studentId, period: { [Op.notIn]: NON_CLASS_PERIODS } } }),
        TutoringRequest.count({ where: { TeacherId: teacherId, StudentId: studentId, status: 'active' } })
    ]);
    return enrolled > 0 || tutored > 0;
}

// @route   GET api/analytics/:teacherId
// @desc    Overview of the teacher's own tutoring over a date range: totals,
//          sessions per week and per weekday, and their next sessions
// @access  Private - own analytics, or any teacher's for admins
router.get('/:teacherId', auth, ownOrAdmin, withRange, async (req, res) => {
    const { teacherId } = req.params;
    const { from, to } = req.range;
    try {
        const sessionAttrs = ['id', 'StudentId', 'date', 'lunchA', 'lunchB', 'lunchC', 'lunchD', 'absent'];
        const [rows, upcomingRows, classIds] = await Promise.all([
            TutoringRequest.findAll({
                where: { TeacherId: teacherId, status: 'active', date: { [Op.between]: [from, to] } },
                attributes: sessionAttrs,
                raw: true
            }),
            TutoringRequest.findAll({
                where: { TeacherId: teacherId, status: 'active', absent: false, date: { [Op.gte]: schoolTodayDateOnly() } },
                attributes: sessionAttrs,
                include: [{ model: Student, attributes: ['first_name', 'last_name'] }],
                order: [['date', 'ASC'], ['id', 'ASC']],
                limit: 10,
                raw: true
            }),
            classStudentIds(teacherId)
        ]);

        let sessions = 0;
        let absences = 0;
        const students = new Set();
        const weeks = weekBuckets(from, to);
        const days = new Map(WEEKDAYS.map(d => [d, 0]));
        for (const row of rows) {
            if (row.absent) {
                absences += 1;
                continue;
            }
            sessions += 1;
            students.add(row.StudentId);
            const week = mondayOf(row.date);
            if (weeks.has(week)) weeks.set(week, weeks.get(week) + 1);
            const weekday = WEEKDAYS[(parseDay(row.date).getUTCDay() + 6) % 7];
            if (days.has(weekday)) days.set(weekday, days.get(weekday) + 1);
        }

        res.json({
            from,
            to,
            sessions,
            absences,
            uniqueStudents: students.size,
            // Class students with no attended session with this teacher in
            // the range - who they haven't reached yet.
            classStudents: classIds.size,
            notYetTutored: [...classIds].filter(id => !students.has(id)).length,
            weekly: [...weeks].map(([weekOf, count]) => ({ weekOf, sessions: count })),
            dayOfWeek: [...days].map(([day, count]) => ({ day, sessions: count })),
            upcoming: upcomingRows.map(row => {
                const lunches = lunchesOf(row);
                return {
                    id: row.id,
                    date: row.date,
                    lunches,
                    times: lunchTimesOf(lunches),
                    studentId: row.StudentId,
                    studentName: studentName(row)
                };
            })
        });
    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// @route   GET api/analytics/:teacherId/students
// @desc    Every student the teacher teaches or tutored in the range, with the
//          teacher's own sessions, absences and last session, plus
//          the student's SPED case manager when they have one
// @access  Private - own analytics, or any teacher's for admins
router.get('/:teacherId/students', auth, ownOrAdmin, withRange, async (req, res) => {
    const { teacherId } = req.params;
    const { from, to } = req.range;
    try {
        const { classIds, tutoredIds } = await rosterIds(teacherId, req.range);
        const ids = [...new Set([...classIds, ...tutoredIds])];

        const [students, summary, caseloads] = await Promise.all([
            Student.findAll({
                where: { id: ids },
                attributes: ['id', 'first_name', 'last_name'],
                order: [['last_name', 'ASC'], ['first_name', 'ASC']],
                raw: true
            }),
            summarizeTutoring(ids, from, to, { teacherId }),
            Enrollment.findAll({
                where: { period: CASELOAD_PERIOD, StudentId: ids },
                attributes: ['StudentId'],
                include: [{ model: Teacher, attributes: ['id', 'first_name', 'last_name'] }],
                raw: true
            })
        ]);
        const caseManagers = new Map(caseloads.map(row => [row.StudentId, {
            id: row['Teacher.id'],
            first_name: row['Teacher.first_name'],
            last_name: row['Teacher.last_name']
        }]));

        res.json({
            from,
            to,
            students: students.map(s => {
                const { totalSessions, totalAbsences, lastSession } = summary.get(s.id);
                return {
                    ...s,
                    totalSessions,
                    totalAbsences,
                    lastSession,
                    inClass: classIds.has(s.id),
                    caseManager: caseManagers.get(s.id) || null
                };
            })
        });
    } catch (error) {
        console.error('Analytics roster error:', error);
        res.status(500).json({ error: error.message });
    }
});

// @route   GET api/analytics/:teacherId/students/:studentId/sessions
// @desc    The teacher's own sessions with one student (date, lunches and
//          times, absences) - the popup behind a name in My Students
// @access  Private - only students the teacher teaches or has ever tutored
//          (404 otherwise, so it can't be used to probe other students)
router.get('/:teacherId/students/:studentId/sessions', auth, ownOrAdmin, withRange, async (req, res) => {
    const { teacherId, studentId } = req.params;
    const { from, to } = req.range;
    try {
        const id = parseInt(studentId, 10);
        const detail = !Number.isNaN(id) && await isRosterStudent(teacherId, id)
            ? await studentTutoringDetail(id, from, to, { teacherId })
            : null;
        if (!detail) {
            return res.status(404).json({ msg: 'Student not found among your students' });
        }
        res.json(detail);
    } catch (error) {
        console.error('Analytics student detail error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
