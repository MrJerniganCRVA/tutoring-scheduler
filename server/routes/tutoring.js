const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const TutoringRequest = require('../models/TutoringRequest');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const TutoringSlot = require('../models/TutoringSlot');
const SchoolConfig = require('../models/SchoolConfig');
const auth = require('../middleware/auth');

// Returns the priority subject for a given date based on SchoolConfig,
// or null if priority scheduling is disabled or no subject is mapped.
const getPrioritySubjectForDay = async (date) => {
  const enabled = await SchoolConfig.getConfig('subject_priority_enabled');
  if (!enabled) return null;

  let dateObj;
  if (typeof date === 'string') {
    const [year, month, day] = date.split('-').map(num => parseInt(num, 10));
    dateObj = new Date(year, month - 1, day);
  } else {
    dateObj = new Date(date);
  }

  const dayOfWeek = dateObj.getDay();
  const priorityMap = await SchoolConfig.getConfig('subject_priority_map') || {};
  return priorityMap[dayOfWeek] || null;
};

const hasSubjectPriority = async (teacherSubject, date) => {
  const prioritySubject = await getPrioritySubjectForDay(date);
  return teacherSubject === prioritySubject;
};

// Returns true if tutoring is blocked on the given date per SchoolConfig
const isNoTutoringDay = async (date) => {
  let dateObj;
  if (typeof date === 'string') {
    const [year, month, day] = date.split('-').map(num => parseInt(num, 10));
    dateObj = new Date(year, month - 1, day);
  } else {
    dateObj = new Date(date);
  }
  const dayOfWeek = dateObj.getDay();
  const noTutoringDays = await SchoolConfig.getConfig('no_tutoring_days') || [0, 6];
  return noTutoringDays.includes(dayOfWeek);
};

// @route   GET api/tutoring/:id
// @desc    Get tutoring event by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const tutoringevent = await TutoringRequest.findByPk(req.params.id, {
      include: [
        { model: Teacher },
        { model: Student },
        { model: TutoringSlot, through: { attributes: [] } }
      ]
    });

    if (!tutoringevent) {
      return res.status(404).json({ msg: 'Tutoring Event not found' });
    }

    res.json(tutoringevent);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/tutoring
// @desc    Get all tutoring requests
// @access  Public
router.get('/', async (req, res) => {
  try {
    const requests = await TutoringRequest.findAll({
      include: [
        { model: Teacher },
        { model: Student },
        { model: TutoringSlot, through: { attributes: [] } }
      ]
    });
    res.json(requests);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/tutoring
// @desc    Create a new tutoring request
// @access  Private
// Body: { studentId, date, slotIds: [1, 2, ...], override: false }
router.post('/', auth, async (req, res) => {
  const { studentId, date, slotIds = [], override = false } = req.body;

  try {
    // Check if tutoring is allowed on this date
    if (await isNoTutoringDay(date)) {
      return res.status(400).json({ msg: 'No tutoring allowed on given date' });
    }

    // Check if student exists
    const student = await Student.findByPk(studentId);
    if (!student) {
      return res.status(404).json({ msg: 'Student not found' });
    }

    // Check if teacher exists
    const requestingTeacher = await Teacher.findByPk(req.teacher.id);
    if (!requestingTeacher) {
      return res.status(404).json({ msg: 'Teacher not found' });
    }

    // Validate slot IDs exist
    let slots = [];
    if (slotIds.length > 0) {
      slots = await TutoringSlot.findAll({ where: { id: slotIds } });
      if (slots.length !== slotIds.length) {
        return res.status(400).json({ msg: 'One or more tutoring slot IDs are invalid' });
      }
    }

    // Enforce slot matching if configured (default: true)
    const requireSlotMatch = await SchoolConfig.getConfig('require_slot_match');
    if (requireSlotMatch !== false && slots.length > 0) {
      const teacherSlots = await requestingTeacher.getTutoringSlots();
      const studentSlots = await student.getTutoringSlots();
      const teacherSlotIds = new Set(teacherSlots.map(s => s.id));
      const studentSlotIds = new Set(studentSlots.map(s => s.id));
      const overlap = slots.some(s => teacherSlotIds.has(s.id) && studentSlotIds.has(s.id));
      if (!overlap) {
        return res.status(400).json({
          msg: 'No shared tutoring slot between teacher and student',
          teacherSlots: teacherSlots.map(s => s.name),
          studentSlots: studentSlots.map(s => s.name)
        });
      }
    }

    // Parse date
    let dateObj;
    if (typeof date === 'string') {
      const [year, month, day] = date.split('-').map(num => parseInt(num, 10));
      dateObj = new Date(year, month - 1, day);
    } else {
      dateObj = new Date(date);
    }

    // Check for existing active requests for this student on the same day
    const existingRequests = await TutoringRequest.findAll({
      where: {
        StudentId: studentId,
        date: dateObj,
        status: 'active'
      },
      include: [{ model: Teacher }],
      raw: false
    });

    const createRequest = async (priority) => {
      const newRequest = await TutoringRequest.create({
        TeacherId: req.teacher.id,
        StudentId: studentId,
        date: dateObj,
        priority
      });
      if (slots.length > 0) {
        await newRequest.setTutoringSlots(slots);
      }
      return TutoringRequest.findByPk(newRequest.id, {
        include: [
          { model: Teacher },
          { model: Student },
          { model: TutoringSlot, through: { attributes: [] } }
        ]
      });
    };

    // No conflict — create immediately
    if (existingRequests.length === 0) {
      const hasPriority = await hasSubjectPriority(requestingTeacher.subject, date);
      const request = await createRequest(hasPriority ? 1 : 0);
      return res.json(request);
    }

    // Conflict — determine priority
    const existingRequest = existingRequests[0];
    const existingTeacher = existingRequest.dataValues.Teacher;
    const requestHasPriority = await hasSubjectPriority(requestingTeacher.dataValues.subject, date);
    const existHasPriority = await hasSubjectPriority(existingTeacher.dataValues.subject, date);

    if (requestHasPriority && !existHasPriority) {
      if (!override) {
        return res.status(409).json({
          msg: 'Student already requested by another teacher, but you have priority',
          conflict: {
            existingTeacher: `${existingTeacher.first_name} ${existingTeacher.last_name}`,
            existingSubject: existingTeacher.subject,
            canOverride: true,
            reason: `${requestingTeacher.subject} has priority on ${new Date(date).toLocaleDateString('en-US', { weekday: 'long' })}`
          },
          requireOverride: true
        });
      }
      // Confirmed override — cancel existing, create new
      existingRequest.status = 'cancelled';
      existingRequest.conflictReason = `Overridden by ${requestingTeacher.last_name}. Priority given`;
      await existingRequest.save();

      const request = await createRequest(1);
      return res.json({
        request,
        overrideInfo: {
          overriddenTeacher: `${existingTeacher.first_name} ${existingTeacher.last_name}`,
          overriddenSubject: existingTeacher.subject,
          reason: 'Priority day override'
        }
      });

    } else if (existHasPriority && !requestHasPriority) {
      return res.status(403).json({
        msg: 'Request denied - existing teacher has priority for this day',
        conflict: {
          existingTeacher: `${existingTeacher.first_name} ${existingTeacher.last_name}`,
          existingSubject: existingTeacher.subject,
          canOverride: false,
          reason: `${existingTeacher.subject} has priority on ${new Date(date).toLocaleDateString('en-US', { weekday: 'long' })}s`
        }
      });
    } else if (requestHasPriority && existHasPriority) {
      return res.status(400).json({
        msg: 'Student already requested by another teacher from the same priority subject',
        conflict: {
          existingTeacher: `${existingTeacher.first_name} ${existingTeacher.last_name}`,
          existingSubject: existingTeacher.subject,
          canOverride: false,
          reason: `Both teachers have ${requestingTeacher.subject} priority for this day`
        }
      });
    } else {
      return res.status(400).json({
        msg: 'Student already requested by another teacher',
        conflict: {
          existingTeacher: `${existingTeacher.first_name} ${existingTeacher.last_name}`,
          existingSubject: existingTeacher.subject,
          canOverride: false,
          reason: 'First come, first served (no priority subjects involved)'
        }
      });
    }

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/tutoring/override
// @desc    Handle override requests (same as POST / but with override=true)
// @access  Private
router.post('/override', auth, async (req, res) => {
  req.body.override = true;
  return router.post('/', auth)(req, res);
});

// @route   GET api/tutoring/priority/:date
// @desc    Check what subject has priority on a given date (or null if disabled)
// @access  Public
router.get('/priority/:date', async (req, res) => {
  const { date } = req.params;
  try {
    let dateObj;
    if (typeof date === 'string') {
      const [year, month, day] = date.split('-').map(num => parseInt(num, 10));
      dateObj = new Date(year, month - 1, day);
    } else {
      dateObj = new Date(date);
    }

    const noTutoring = await isNoTutoringDay(date);
    const dayOfWeek = dateObj.getDay();
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

    if (noTutoring) {
      return res.json({
        date,
        dayName,
        dayOfWeek,
        prioritySubject: null,
        message: 'No tutoring on this day'
      });
    }

    const prioritySubject = await getPrioritySubjectForDay(date);
    res.json({
      date,
      dayName,
      prioritySubject,
      message: prioritySubject
        ? `${prioritySubject} has priority on ${dayName}s`
        : 'No priority subject configured for this day'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/tutoring/cancel/:id
// @desc    Cancel a tutoring request
// @access  Private
router.put('/cancel/:id', auth, async (req, res) => {
  try {
    const request = await TutoringRequest.findByPk(req.params.id);

    if (!request) {
      return res.status(404).json({ msg: 'Request not found' });
    }

    if (request.TeacherId !== req.teacher.id) {
      return res.status(401).json({ msg: 'Not authorized to cancel this request' });
    }

    request.status = 'cancelled';
    await request.save();

    res.json({ msg: 'Request cancelled successfully', request });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
