const express = require('express');
const router = express.Router();
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const auth = require('../middleware/auth');
const { summarizeTutoring, studentTutoringDetail } = require('../utils/tutoringQueries');
const { resolveRange } = require('../utils/tutoringScope');

// A SPED caseload is stored as an ordinary Enrollment with period 'SPED'
// pointing at the case manager - case managers often don't teach their
// caseload students in any rotation period, so nothing else links them.
const CASELOAD_PERIOD = 'SPED';

// @route   GET api/caseload
// @desc    Tutoring summary for every student on the caller's SPED caseload
// @access  Private - always scoped to the caller; there is no way to ask for
//          another teacher's caseload or an arbitrary student here (admins
//          use /api/admin/students/:id/tutoring for that)
router.get('/', auth, async (req, res) => {
  try {
    const range = resolveRange(req.query);
    if (!range) {
      return res.status(400).json({ msg: 'Dates must be formatted YYYY-MM-DD' });
    }

    const rows = await Enrollment.findAll({
      where: { period: CASELOAD_PERIOD, TeacherId: req.teacher.id },
      attributes: ['StudentId'],
      raw: true
    });
    const studentIds = rows.map(r => r.StudentId);

    const [students, summary] = await Promise.all([
      Student.findAll({
        where: { id: studentIds },
        attributes: ['id', 'first_name', 'last_name'],
        order: [['last_name', 'ASC'], ['first_name', 'ASC']],
        raw: true
      }),
      summarizeTutoring(studentIds, range.from, range.to)
    ]);

    res.json({
      ...range,
      students: students.map(s => ({ ...s, ...summary.get(s.id) }))
    });
  } catch (err) {
    console.error('Caseload error:', err);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/caseload/students/:id/sessions
// @desc    One caseload student's sessions (date, lunches, minutes, teacher,
//          subject) plus totals - the popup behind a name on My Caseload
// @access  Private - only students on the caller's own caseload (404 otherwise,
//          so it can't be used to probe whether other students exist)
router.get('/students/:id/sessions', auth, async (req, res) => {
  try {
    const range = resolveRange(req.query);
    if (!range) {
      return res.status(400).json({ msg: 'Dates must be formatted YYYY-MM-DD' });
    }
    const onCaseload = await Enrollment.count({
      where: { period: CASELOAD_PERIOD, TeacherId: req.teacher.id, StudentId: req.params.id }
    });
    const detail = onCaseload ? await studentTutoringDetail(req.params.id, range.from, range.to) : null;
    if (!detail) {
      return res.status(404).json({ msg: 'Student not found on your caseload' });
    }
    res.json(detail);
  } catch (err) {
    console.error('Caseload detail error:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
module.exports.CASELOAD_PERIOD = CASELOAD_PERIOD;
