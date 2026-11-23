const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Enrollment = require('../models/Enrollment');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { STUDENT_ENROLLMENT_INCLUDE, reshapeStudent, setEnrollments } = require('../utils/enrollments');

// @route   GET api/students/teacher/:teacherId
// @desc    Get all students with any class assignment (any period) for a specific teacher
// @access  Private
router.get('/teacher/:teacherId', auth, async (req, res) => {
  try {
    const teacherId = req.params.teacherId;
    const studentIds = (
      await Enrollment.findAll({ where: { TeacherId: teacherId }, attributes: ['StudentId'] })
    ).map(e => e.StudentId);

    const students = await Student.findAll({
      where: { id: studentIds },
      include: [STUDENT_ENROLLMENT_INCLUDE]
    });
    res.json(students.map(reshapeStudent));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/students
// @desc    Get all students
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const students = await Student.findAll({
      include: [STUDENT_ENROLLMENT_INCLUDE]
    });
    res.json(students.map(reshapeStudent));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Thrown for expected, client-facing failures (bad input, duplicates) so callers
// can distinguish them from unexpected server errors and respond 400 vs 500.
class StudentInputError extends Error {}

// Shared creation logic used by both the single-student and bulk-import routes.
// R1Id/R2Id/RRId/R4Id/R5Id here are teacher IDs (or null/undefined) for each
// named period - internally these become Enrollment rows, not columns.
async function createStudentRecord({ id, first_name, last_name, email, R1Id, R2Id, RRId, R4Id, R5Id }) {
  const id_exists = await Student.findByPk(id);
  if (id_exists) {
    throw new StudentInputError(`Student ID ${id} already exists.`);
  }
  const name_exists = await Student.findOne({ where: { first_name, last_name } });
  if (name_exists) {
    throw new StudentInputError('Student already exists. Consider Updating instead of POST');
  }

  let student;
  try {
    student = await Student.create({ id, first_name, last_name, email });
  } catch (err) {
    if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
      throw new StudentInputError(err.errors?.[0]?.message || 'Invalid student data.');
    }
    throw err;
  }

  await setEnrollments(student.id, { R1: R1Id, R2: R2Id, RR: RRId, R4: R4Id, R5: R5Id });
  return student;
}

// @route   POST api/students
// @desc    Add a new student
// @access  Private
router.post('/', auth, async (req, res) => {
  const { id, first_name, last_name, email, teachers } = req.body;
  try {
    const student = await createStudentRecord({
      id,
      first_name,
      last_name,
      email,
      R1Id: teachers?.R1 || null,
      R2Id: teachers?.R2 || null,
      RRId: teachers?.RR || null,
      R4Id: teachers?.R4 || null,
      R5Id: teachers?.R5 || null
    });
    const newStudent = await Student.findByPk(student.id, { include: [STUDENT_ENROLLMENT_INCLUDE] });
    res.json(reshapeStudent(newStudent));
  } catch (err) {
    if (err instanceof StudentInputError) {
      return res.status(400).json({ msg: err.message });
    }
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/students/bulk-create
// @desc    Bulk-create students (e.g. onboarding a new year's population from CSV)
// @access  Admin only
router.post('/bulk-create', auth, requireAdmin, async (req, res) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ msg: 'students array is required' });
    }

    const succeeded = [];
    const failed = [];

    for (const studentData of students) {
      try {
        const student = await createStudentRecord(studentData);
        succeeded.push(student.id);
      } catch (rowErr) {
        if (!(rowErr instanceof StudentInputError)) {
          console.error(rowErr.message);
        }
        failed.push({ studentId: studentData.id, reason: rowErr.message });
      }
    }

    res.json({ succeeded, failed });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Periods that can be bulk-assigned from a CSV: RR homerooms, and SPED
// caseloads (case manager per student).
const BULK_PERIODS = ['RR', 'SPED'];

async function applyBulkEnrollment(period, updates) {
  const succeeded = [];
  const failed = [];

  for (const { studentId, teacherId } of updates) {
    try {
      const student = await Student.findByPk(studentId);
      if (!student) {
        failed.push({ studentId, reason: 'Student not found' });
        continue;
      }
      await setEnrollments(studentId, { [period]: teacherId });
      succeeded.push(studentId);
    } catch (rowErr) {
      failed.push({ studentId, reason: rowErr.message });
    }
  }

  return { succeeded, failed };
}

// @route   POST api/students/bulk-enrollment
// @desc    Bulk set one period's teacher (RR or SPED case manager) per student
// @access  Admin only
router.post('/bulk-enrollment', auth, requireAdmin, async (req, res) => {
  try {
    const { period, updates } = req.body;
    if (!BULK_PERIODS.includes(period)) {
      return res.status(400).json({ msg: `period must be one of ${BULK_PERIODS.join(', ')}` });
    }
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ msg: 'updates array is required' });
    }
    res.json(await applyBulkEnrollment(period, updates));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/students/bulk-rr
// @desc    Bulk update RR teacher assignments (kept for existing callers;
//          same as bulk-enrollment with period 'RR')
// @access  Admin only
router.post('/bulk-rr', auth, requireAdmin, async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ msg: 'updates array is required' });
    }
    const normalized = updates.map(({ studentId, rrTeacherId }) => ({ studentId, teacherId: rrTeacherId }));
    res.json(await applyBulkEnrollment('RR', normalized));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/students/:id
// @desc    Update a student's teacher assignments (any period, not just the
//          five named rotation slots - pass any period key to add/change/clear it)
// @access  Admin only
router.put('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const student = await Student.findByPk(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Student not found' });

    const { R1Id, R2Id, RRId, R4Id, R5Id, enrollments } = req.body;
    const periodMap = {};
    for (const [period, val] of Object.entries({ R1: R1Id, R2: R2Id, RR: RRId, R4: R4Id, R5: R5Id })) {
      if (val !== undefined) periodMap[period] = val;
    }
    // Optional: arbitrary extra periods, e.g. { period: 'Online-CS', teacherId: 7 }
    if (Array.isArray(enrollments)) {
      for (const { period, teacherId } of enrollments) {
        if (period) periodMap[period] = teacherId ?? null;
      }
    }

    for (const [period, val] of Object.entries(periodMap)) {
      if (val !== null) {
        const exists = await Teacher.findByPk(val);
        if (!exists) return res.status(400).json({ msg: `Teacher ${val} not found` });
      }
    }

    await setEnrollments(req.params.id, periodMap);

    const updated = await Student.findByPk(req.params.id, { include: [STUDENT_ENROLLMENT_INCLUDE] });
    res.json(reshapeStudent(updated));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
