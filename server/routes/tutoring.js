const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const TutoringRequest = require('../models/TutoringRequest');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Enrollment = require('../models/Enrollment');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const {
  buildRequestInclude,
  toLeanRequest,
  OWN_REQUEST_INCLUDE,
  getPrioritySubjectForDay,
  hasSubjectPriority
} = require('../utils/tutoringQueries');
const { TEACHER_LEAN_ATTRS } = require('../utils/enrollments');
const { isAdmin } = require('../middleware/requireAdmin');
const {
  RR_GROUPS,
  resolveRRMainTeacherId,
  schoolYearStartDate,
  schoolTodayDateOnly,
  parseDateOnly
} = require('../utils/tutoringScope');
const { removeAttendeeFromEvent, parseEventIds } = require('../utils/calendarService');

// Pull a student off every Google Calendar event a request was sent as (one
// per contiguous lunch chunk, so an A,B,D booking has two). `teacherId` is the
// events' organizer. Reports what happened instead of throwing: the teacher may
// have revoked the app's access or never connected Calendar at all, and neither
// should block the booking change that triggered the cleanup.
async function withdrawStudentFromEvents(teacherId, calendarEventIds, student) {
  const eventIds = parseEventIds(calendarEventIds).filter(Boolean);
  if (eventIds.length === 0) {
    return { attempted: false, ok: true, action: 'no-invite' };
  }

  const actions = [];
  const errors = [];
  for (const eventId of eventIds) {
    try {
      const result = await removeAttendeeFromEvent(teacherId, eventId, student.email);
      actions.push(result.action);
    } catch (err) {
      console.error('Calendar cleanup failed:', err.message);
      errors.push(err.message);
    }
  }

  if (errors.length > 0) {
    return { attempted: true, ok: false, action: 'failed', error: errors.join('; ') };
  }
  // 'updated' wins over 'deleted' so the message never claims the whole event
  // is gone while another student is still on one of them.
  const action = ['updated', 'deleted', 'gone', 'not-attendee'].find(a => actions.includes(a));
  return { attempted: true, ok: true, action };
}

// Tell the overridden teacher their session is gone. Without this the request
// just disappears from their dashboard - every list view filters cancelled rows
// out, and conflictReason is not part of the API payload.
async function notifyOverriddenTeacher({ overriddenTeacherId, student, date, requestingTeacher, calendarCleanup }) {
  // `date` is a DATEONLY, which Sequelize reads back as 'YYYY-MM-DD'. Anchoring
  // at midnight local keeps the weekday from drifting a day, and the guard keeps
  // a Date instance from rendering as "Invalid Date".
  const dateOnly = date instanceof Date ? date.toISOString().split('T')[0] : date;
  const dayName = new Date(`${dateOnly}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  let message = `${student.first_name} ${student.last_name} has been requested for tutoring on ${dayName} `
    + `by ${requestingTeacher.first_name} ${requestingTeacher.last_name} `
    + `(${requestingTeacher.subject} priority day) and your tutoring event has been cancelled.`;

  if (calendarCleanup.ok && calendarCleanup.action === 'deleted') {
    message += ` ${student.first_name} was the only student on that calendar event, so the event was removed.`;
  } else if (calendarCleanup.ok && calendarCleanup.action === 'updated') {
    message += ` ${student.first_name} has been removed from your calendar invite.`;
  } else if (!calendarCleanup.ok) {
    message += ` Your calendar invite could not be updated automatically -`
      + ` please remove ${student.first_name} from that event yourself.`;
  }

  try {
    await Notification.create({
      TeacherId: overriddenTeacherId,
      StudentId: student.id,
      type: 'override',
      message,
      relatedDate: dateOnly
    });
    return true;
  } catch (err) {
    // Same reasoning as the calendar cleanup: the booking swap already
    // happened, so a failed notification is logged, not surfaced as an error.
    // The caller reports it as notified:false rather than claiming a message
    // the teacher will never see.
    console.error('Failed to create override notification:', err.message);
    return false;
  }
}

// @route   GET api/tutoring/rr-teachers
// @desc    Teachers whose Raptor Rotation can be covered - the picker for the
//          "Are you covering today?" dialog. Names only.
// @access  Private
//
// Includes every member of a shared RR group (RR_GROUPS), not just the main
// teacher students are enrolled under, so a covering teacher can pick the name
// they were actually told. /coverage resolves the group either way.
router.get('/rr-teachers', auth, async (req, res) => {
  try {
    const rrRows = await Enrollment.findAll({
      where: { period: 'RR' },
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('TeacherId')), 'TeacherId']],
      raw: true
    });
    const ids = new Set(rrRows.map(r => r.TeacherId));
    for (const [member, main] of Object.entries(RR_GROUPS)) {
      if (ids.has(main)) ids.add(Number(member));
    }

    const teachers = await Teacher.findAll({
      where: { id: [...ids], active: true },
      attributes: TEACHER_LEAN_ATTRS,
      order: [['last_name', 'ASC'], ['first_name', 'ASC']]
    });
    res.json(teachers);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/tutoring/coverage/:teacherId
// @desc    Today's "Leaving RR" list for an RR someone is covering
// @access  Private
//
// Deliberately the narrowest view in the app: today only (no date param, so it
// can't be used to browse history or upcoming days), and student names only -
// no tutoring teacher, no lunches. The covering teacher just needs to know who
// should leave the room; anything more is information about a student's
// tutoring they have no reason to see.
router.get('/coverage/:teacherId', auth, async (req, res) => {
  try {
    const mainTeacherId = resolveRRMainTeacherId(req.params.teacherId);
    if (mainTeacherId === null) {
      return res.status(400).json({ msg: 'Invalid teacher id' });
    }

    const requests = await TutoringRequest.findAll({
      where: { date: schoolTodayDateOnly(), status: 'active' },
      attributes: ['id', 'StudentId'],
      include: buildRequestInclude('rr', mainTeacherId)
    });

    // A student booked for two lunch chunks has two requests; list them once.
    const byId = new Map();
    for (const r of requests) {
      const s = r.Student;
      if (s && !byId.has(s.id)) {
        byId.set(s.id, { id: s.id, first_name: s.first_name, last_name: s.last_name });
      }
    }
    const students = [...byId.values()].sort((a, b) =>
      a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));

    res.json({ date: schoolTodayDateOnly(), students });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/tutoring/:id
// @desc    Get tutoring request by ID
// @access  Private - the teacher who booked it, the student's RR teacher, or an admin
router.get('/:id', auth, async (req, res) => {
  try {
    const request = await TutoringRequest.findByPk(req.params.id, {
      include: buildRequestInclude('mine', null)
    });
    const lean = request && toLeanRequest(request);

    const callerId = req.teacher.id;
    const rrTeacherId = lean?.Student?.RR?.id;
    const allowed = lean && (
      lean.TeacherId === callerId
      || (rrTeacherId != null && rrTeacherId === resolveRRMainTeacherId(callerId))
      || await isAdmin(callerId)
    );

    // Same 404 whether it doesn't exist or isn't theirs, so ids can't be probed.
    if (!allowed) {
      return res.status(404).json({ msg: 'Tutoring Event not found' });
    }

    res.json(lean);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});
// @route   GET api/tutoring
// @desc    Get tutoring requests, scoped to what the caller actually needs
// @access  Private
//
// Query params:
//   scope=mine    (default) the caller's own requests. Defaults to this school
//                 year so searching past requests by student name still works.
//   scope=rr      requests for students in the caller's Raptor Rotation,
//                 whoever booked them - the "Leaving RR Today" board.
//   scope=student requests for one student across all teachers, for the
//                 scheduling form's conflict check. Requires studentId.
//                 For non-admins this is clamped to active requests from today
//                 forward - enough to spot a conflict, but not a way to read a
//                 student's tutoring history with other teachers.
//   from/to/date  'YYYY-MM-DD' bounds on the request date.
//   status        e.g. 'active'.
router.get('/', auth, async (req, res) => {
  try {
    const { scope = 'mine', from, to, date, studentId, status } = req.query;

    if (!['mine', 'rr', 'student'].includes(scope)) {
      return res.status(400).json({ msg: `Unknown scope '${scope}'` });
    }

    const where = {};
    if (scope === 'mine') {
      where.TeacherId = req.teacher.id;
    } else if (scope === 'student') {
      const id = parseInt(studentId, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ msg: 'studentId is required for scope=student' });
      }
      where.StudentId = id;
    }

    if (status) where.status = status;

    const exactDate = parseDateOnly(date);
    let fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);
    if ([exactDate, fromDate, toDate].includes(undefined)) {
      return res.status(400).json({ msg: 'Dates must be formatted YYYY-MM-DD' });
    }

    if (scope === 'student' && !(await isAdmin(req.teacher.id))) {
      const today = schoolTodayDateOnly();
      where.status = 'active';
      // DATEONLY strings compare correctly as strings.
      if (exactDate && exactDate < today) return res.json([]);
      if (!fromDate || fromDate < today) fromDate = today;
    }

    if (exactDate) {
      where.date = exactDate;
    } else {
      // Only a teacher's own history is bounded by default - the other scopes
      // are already narrow (one RR board, or one student).
      const lower = fromDate || (scope === 'mine' ? schoolYearStartDate() : null);
      if (lower || toDate) {
        where.date = {
          ...(lower && { [Op.gte]: lower }),
          ...(toDate && { [Op.lte]: toDate })
        };
      }
    }

    const rrMainTeacherId = scope === 'rr' ? resolveRRMainTeacherId(req.teacher.id) : null;

    const requests = await TutoringRequest.findAll({
      where,
      include: buildRequestInclude(scope, rrMainTeacherId),
      order: [['date', 'ASC']]
    });
    res.json(requests.map(toLeanRequest));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/tutoring
// @desc    Create a new tutoring request
// @access  Private
router.post('/', auth, async (req, res) => {
  const { studentId, date, lunches, override = false } = req.body;

  try {
    //Check if priority allows
      let dateObj; 
      if(typeof date === 'string'){
        const [year, month, day] = date.split('-').map(num => parseInt(num, 10));
        dateObj = new Date(year, month - 1, day);
      } else {
        dateObj = new Date(date);
      }
    const dayOfWeek = dateObj.getDay();
    if(dayOfWeek ===3 || dayOfWeek === 0 || dayOfWeek===6){
      return res.status(400).json({msg:'No tutoring allowed on given date'});
    }
    // Check if student exists
    const student = await Student.findByPk(studentId);
    if (!student) {
      return res.status(404).json({ msg: 'Student not found' });
    }
    
    //Check if teacher exists
    const requestingTeacher = await Teacher.findByPk(req.teacher.id);
    if(!requestingTeacher){
      return res.status(404).json({msg:'Teacher not found'});
    }

    // Check if there are existing requests for this student on the same day
    const existingRequests = await TutoringRequest.findAll({
      where: {
        StudentId: studentId,
        date: dateObj,
        status: 'active'
      },
      include: [{ model: Teacher }],
      raw:false
    });
    
    //if no requests on that date make request normally
    if(existingRequests.length === 0){
      const newRequest = await TutoringRequest.create({
        TeacherId: req.teacher.id,
        StudentId: studentId,
        date: dateObj,
        lunchA: lunches.A || false,
        lunchB: lunches.B || false,
        lunchC: lunches.C || false,
        lunchD: lunches.D || false,
        priority: hasSubjectPriority(requestingTeacher.subject, date) ? 1 :0
      });
      //Fetch the created request
      const request = await TutoringRequest.findByPk(newRequest.id, { include: OWN_REQUEST_INCLUDE });
      return res.json(toLeanRequest(request));
    }
    //a conflict exists need to figure out who has priority
    
    const existingRequest = existingRequests[0];
    const existingTeacher = existingRequest.dataValues.Teacher;
    const requestHasPriority = hasSubjectPriority(requestingTeacher.dataValues.subject, date);
    const existHasPriority = hasSubjectPriority(existingTeacher.dataValues.subject, date);

    //priority logic
    if(requestHasPriority && !existHasPriority){
      //request has priority and existing does not so need to override
      if(!override){
        //teacher hasn't confirmed override yet sending override confirmation
        return res.status(409).json({
          msg:'Student already requested by another teacher, but you have priority',
          conflict:{
            existingTeacher: `${existingTeacher.first_name} ${existingTeacher.last_name}`,
            existingSubject: existingTeacher.subject,
            canOverride: true,
            reason: `${requestingTeacher.subject} has priority on ${new Date(date).toLocaleDateString('en-US', {weekday: 'long'})}`
          },
          requireOverride: true
        });
      }
      //have confirmed override so cancel existing and create new.
      // Both writes go in one transaction: cancelling the incumbent without
      // creating the replacement would leave the student with no session at all.
      // The calendar event id is remembered before it is cleared below.
      const overriddenEventId = existingRequest.calendar_event_id;
      const overriddenTeacherId = existingRequest.TeacherId;

      const newRequest = await sequelize.transaction(async (t) => {
        existingRequest.status = 'cancelled';
        existingRequest.conflictReason = `Overriden by ${requestingTeacher.last_name}. Priority given`;
        // Drop the invite bookkeeping so this cancelled row can never be
        // re-grouped into a future calendar event for the overridden teacher.
        existingRequest.calendar_event_id = null;
        existingRequest.invite_sent = false;
        existingRequest.invite_sent_at = null;
        await existingRequest.save({ transaction: t });

        return TutoringRequest.create({
          TeacherId: req.teacher.id,
          StudentId: studentId,
          date: dateObj,
          lunchA: lunches.A || false,
          lunchB: lunches.B || false,
          lunchC: lunches.C || false,
          lunchD: lunches.D || false,
          priority: 1 // Has priority
        }, { transaction: t });
      });

      // Side effects run only once the booking swap is committed, and neither
      // is allowed to fail the override - the student is already reassigned, so
      // throwing here would report failure for work that actually happened.
      const calendarCleanup = await withdrawStudentFromEvents(
        overriddenTeacherId,
        overriddenEventId,
        student
      );

      const notified = await notifyOverriddenTeacher({
        overriddenTeacherId,
        student,
        date: existingRequest.date,
        requestingTeacher,
        calendarCleanup
      });

      const request = await TutoringRequest.findByPk(newRequest.id, { include: OWN_REQUEST_INCLUDE });

      return res.json({
        request: toLeanRequest(request),
        overrideInfo: {
          overriddenTeacher: `${existingTeacher.first_name} ${existingTeacher.last_name}`,
          overriddenSubject: existingTeacher.subject,
          reason: 'Priority day override',
          notified,
          calendarCleanup
        }
      });


    } else if (existHasPriority && !requestHasPriority){
      //exisiting teacher has priority deny request
       return res.status(403).json({
        msg: 'Request denied - existing teacher has priority for this day',
        conflict: {
          existingTeacher: `${existingTeacher.first_name} ${existingTeacher.last_name}`,
          existingSubject: existingTeacher.subject,
          canOverride: false,
          reason: `${existingTeacher.subject} has priority on ${new Date(date).toLocaleDateString('en-US', { weekday: 'long' })}s`
        }
      });
    } else if (requestHasPriority && existHasPriority){
      //both teachers have priority - first one there gets the student
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
      //neither has priority so the first gets the student
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
//@route   GET api/priority/:date
//@desc    Helper route to check what subject has priroity 
//@access  
router.get('/priority/:date', (req, res) => {
  const { date } = req.params;
  let dateObj;
  if (typeof date === 'string') {
    const [year, month, day] = date.split('-').map(num => parseInt(num, 10));
    dateObj = new Date(year, month - 1, day);
  } else {
    dateObj = new Date(date);
  }


  const dayOfWeek = dateObj.getDay();
  const prioritySubject = getPrioritySubjectForDay(dateObj);
  const dayName = dateObj.toLocaleDateString('en-US', {weekday: 'long'});
  
  if (!prioritySubject) {
    return res.json({
      date,
      dateObject: dateObj.toDateString(),
      dayOfWeek: dayOfWeek,
      dayName,
      prioritySubject: null,
      message: dayOfWeek === 3 ? 'No tutoring on Wednesdays' : 'No tutoring on Weekends'
    });
  }
  
  res.json({
    date,
    dayName,
    prioritySubject,
    message: `${prioritySubject} has priority on ${dayName}s`
  });
});


// @route   PATCH api/tutoring/:id/attendance
// @desc    Mark a session's student absent ({ absent: true }) or back to
//          present ({ absent: false })
// @access  Private - only the teacher who booked it, and only for today or
//          earlier (you can't miss a session that hasn't happened)
router.patch('/:id/attendance', auth, async (req, res) => {
  try {
    const { absent } = req.body || {};
    if (typeof absent !== 'boolean') {
      return res.status(400).json({ msg: 'absent must be true or false' });
    }

    const request = await TutoringRequest.findOne({
      where: { id: req.params.id, TeacherId: req.teacher.id, status: 'active' }
    });
    if (!request) {
      return res.status(404).json({ msg: 'Request not found' });
    }
    // DATEONLY strings compare correctly as strings.
    if (request.date > schoolTodayDateOnly()) {
      return res.status(400).json({ msg: 'Attendance can only be marked on or after the session date' });
    }

    await request.update({ absent, absentMarkedAt: absent ? new Date() : null });

    const updated = await TutoringRequest.findByPk(request.id, { include: OWN_REQUEST_INCLUDE });
    res.json(toLeanRequest(updated));
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
    const request = await TutoringRequest.findByPk(req.params.id, {
      include: [{ model: Student, attributes: ['id', 'email'] }]
    });
    
    if (!request) {
      return res.status(404).json({ msg: 'Request not found' });
    }
    
    // Make sure the teacher who created the request is the one cancelling it
    if (request.TeacherId !== req.teacher.id) {
      return res.status(401).json({ msg: 'Not authorized to cancel this request' });
    }
    
    // Update to cancelled status. The invite bookkeeping is cleared (same as
    // an override) after remembering the event ids to withdraw the student from.
    const cancelledEventIds = request.calendar_event_id;
    request.status = 'cancelled';
    request.calendar_event_id = null;
    request.invite_sent = false;
    request.invite_sent_at = null;
    await request.save();

    // Runs after the save and never throws: a calendar failure must not undo
    // or misreport a cancellation that already happened.
    const calendarCleanup = request.Student
      ? await withdrawStudentFromEvents(request.TeacherId, cancelledEventIds, request.Student)
      : { attempted: false, ok: true, action: 'no-invite' };
    
    // The Student include was only loaded for its email; keep it out of the response.
    const { Student: _student, ...requestData } = request.toJSON();
    res.json({ msg: 'Request cancelled successfully', request: requestData, calendarCleanup });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
