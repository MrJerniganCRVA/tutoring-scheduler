const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const TutoringSlot = require('../models/TutoringSlot');
const Period = require('../models/Period');
const StudentPeriodAssignment = require('../models/StudentPeriodAssignment');
const auth = require('../middleware/auth');

// @route   GET api/students
// @desc    Get all students with their tutoring slots and period assignments
// @access  Public
router.get('/', async (req, res) => {
  try {
    const students = await Student.findAll({
      include: [
        { model: TutoringSlot, through: { attributes: [] } },
        {
          model: StudentPeriodAssignment,
          include: [
            { model: Teacher, attributes: ['id', 'first_name', 'last_name', 'subject'] },
            { model: Period, attributes: ['id', 'name', 'order'] }
          ]
        }
      ]
    });
    res.json(students);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/students/:id/periods
// @desc    Get all period assignments for a student
// @access  Public
router.get('/:id/periods', async (req, res) => {
  try {
    const student = await Student.findByPk(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Student not found' });
    const assignments = await StudentPeriodAssignment.findAll({
      where: { StudentId: req.params.id },
      include: [
        { model: Teacher, attributes: ['id', 'first_name', 'last_name', 'subject'] },
        { model: Period, attributes: ['id', 'name', 'order'] }
      ],
      order: [[Period, 'order', 'ASC']]
    });
    res.json(assignments);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/students/:id/periods
// @desc    Replace all period assignments for a student
// @access  Admin only
// Body: [{ periodId, teacherId }]
router.put('/:id/periods', auth, async (req, res) => {
  try {
    const requestingTeacher = await Teacher.findByPk(req.teacher.id);
    if (!requestingTeacher?.is_admin) {
      return res.status(403).json({ msg: 'Admin access required' });
    }
    const student = await Student.findByPk(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Student not found' });

    const assignments = req.body;
    if (!Array.isArray(assignments)) {
      return res.status(400).json({ msg: 'Body must be an array of { periodId, teacherId }' });
    }

    await StudentPeriodAssignment.destroy({ where: { StudentId: req.params.id } });
    for (const { periodId, teacherId } of assignments) {
      if (periodId && teacherId) {
        await StudentPeriodAssignment.create({
          StudentId: req.params.id,
          PeriodId: periodId,
          TeacherId: teacherId
        });
      }
    }
    res.json({ msg: 'Period assignments updated' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/students/bulk-periods
// @desc    Bulk replace period assignments for multiple students
// @access  Admin only
// Body: { updates: [{ studentId, assignments: [{ periodId, teacherId }] }] }
router.post('/bulk-periods', auth, async (req, res) => {
  try {
    const requestingTeacher = await Teacher.findByPk(req.teacher.id);
    if (!requestingTeacher?.is_admin) {
      return res.status(403).json({ msg: 'Admin access required' });
    }

    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ msg: 'updates array is required' });
    }

    const succeeded = [];
    const failed = [];

    for (const { studentId, assignments } of updates) {
      try {
        const student = await Student.findByPk(studentId);
        if (!student) {
          failed.push({ studentId, reason: 'Student not found' });
          continue;
        }
        await StudentPeriodAssignment.destroy({ where: { StudentId: studentId } });
        for (const { periodId, teacherId } of assignments) {
          if (periodId && teacherId) {
            await StudentPeriodAssignment.create({
              StudentId: studentId,
              PeriodId: periodId,
              TeacherId: teacherId
            });
          }
        }
        succeeded.push(studentId);
      } catch (rowErr) {
        failed.push({ studentId, reason: rowErr.message });
      }
    }

    res.json({ succeeded, failed });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/students/:id
// @desc    Get a single student with their tutoring slots and period assignments
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findByPk(req.params.id, {
      include: [
        { model: TutoringSlot, through: { attributes: [] } },
        {
          model: StudentPeriodAssignment,
          include: [
            { model: Teacher, attributes: ['id', 'first_name', 'last_name', 'subject'] },
            { model: Period, attributes: ['id', 'name', 'order'] }
          ]
        }
      ]
    });
    if (!student) return res.status(404).json({ msg: 'Student not found' });
    res.json(student);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/students
// @desc    Add a new student
// @access  Public
router.post('/', async (req, res) => {
  const { id, first_name, last_name, email } = req.body;
  try {
    let student_exists = await Student.findOne({ where: { first_name, last_name } });
    if (student_exists) {
      return res.status(400).json({ msg: 'Student already exists. Consider updating instead.' });
    }
    const student = await Student.create({ id, first_name, last_name, email });
    res.json(student);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/students/:id
// @desc    Update a student's basic info
// @access  Admin only
router.put('/:id', auth, async (req, res) => {
  try {
    const requestingTeacher = await Teacher.findByPk(req.teacher.id);
    if (!requestingTeacher?.is_admin) {
      return res.status(403).json({ msg: 'Admin access required' });
    }

    const student = await Student.findByPk(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Student not found' });

    const { first_name, last_name, email } = req.body;
    const updates = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (email !== undefined) updates.email = email;

    await student.update(updates);
    res.json(student);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/students/bulk-slots
// @desc    Bulk update student tutoring slot assignments
// @access  Admin only
router.post('/bulk-slots', auth, async (req, res) => {
  try {
    const requestingTeacher = await Teacher.findByPk(req.teacher.id);
    if (!requestingTeacher?.is_admin) {
      return res.status(403).json({ msg: 'Admin access required' });
    }

    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ msg: 'updates array is required' });
    }

    const succeeded = [];
    const failed = [];

    for (const { studentId, slotIds } of updates) {
      try {
        const student = await Student.findByPk(studentId);
        if (!student) {
          failed.push({ studentId, reason: 'Student not found' });
          continue;
        }
        if (Array.isArray(slotIds)) {
          await student.setTutoringSlots(slotIds);
        }
        succeeded.push(studentId);
      } catch (rowErr) {
        failed.push({ studentId, reason: rowErr.message });
      }
    }

    res.json({ succeeded, failed });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
