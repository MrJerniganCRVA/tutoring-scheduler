const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { upsertCalendarEvent } = require('../utils/calendarService');
const TutoringRequest = require('../models/TutoringRequest');
const TutoringSlot = require('../models/TutoringSlot');
const Student = require('../models/Student');
const SchoolConfig = require('../models/SchoolConfig');
const { Op } = require('sequelize');

// @route   POST /api/calendar/send-invites
// @desc    Create/update calendar invites for pending tutoring requests
// @access  Private
router.post('/send-invites', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Read configurable values from SchoolConfig
    const eventPrefix = await SchoolConfig.getConfig('calendar_event_prefix') || 'Tutoring';
    const periodName = await SchoolConfig.getConfig('tutoring_period_name') || 'Tutoring Session';
    const timezone = await SchoolConfig.getConfig('calendar_timezone') || 'America/New_York';

    // Get ALL future tutoring requests for this teacher so already-sent requests
    // can provide their calendar_event_id when adding new students to an existing event.
    const allRequests = await TutoringRequest.findAll({
      where: {
        TeacherId: req.teacher.id,
        date: { [Op.gte]: today }
      },
      include: [
        { model: Student, attributes: ['id', 'first_name', 'last_name', 'email'] },
        { model: TutoringSlot, through: { attributes: [] } }
      ]
    });

    const anyPending = allRequests.some(r => !r.invite_sent);
    if (!anyPending) {
      return res.status(200).json({
        msg: 'All invites are up to date!',
        results: []
      });
    }

    const groupedByDateAndTime = groupByDateAndTimeSlot(allRequests, timezone);

    const results = [];

    for (const group of groupedByDateAndTime) {
      const pendingInGroup = group.requests.filter(r => !r.invite_sent);
      if (pendingInGroup.length === 0) continue;

      const existingEventId = group.requests.find(r => r.calendar_event_id)?.calendar_event_id;

      const manuallyMarkedStudentIds = new Set(
        group.requests
          .filter(r => r.invite_sent && !r.calendar_event_id)
          .map(r => r.Student.id)
      );
      const groupAttendees = group.students
        .filter(s => !manuallyMarkedStudentIds.has(s.id))
        .map(student => ({
          email: student.email,
          displayName: `${student.first_name} ${student.last_name}`
        }));

      if (groupAttendees.length === 0) continue;

      const eventDetails = {
        summary: `${eventPrefix} - ${req.user.subject}`,
        description: `Tutoring session today during ${periodName}.`,
        startDateTime: group.startDateTime,
        endDateTime: group.endDateTime,
        attendees: groupAttendees,
        timezone
      };

      const event = await upsertCalendarEvent(req.teacher.id, eventDetails, existingEventId);

      for (const request of pendingInGroup) {
        await request.update({
          invite_sent: true,
          invite_sent_at: new Date(),
          calendar_event_id: event.id
        });
      }

      results.push({
        action: existingEventId ? 'updated' : 'created',
        eventId: event.id,
        date: group.date,
        timeSlot: group.timeSlot,
        studentCount: groupAttendees.length
      });
    }

    res.json({
      msg: `Processed ${results.length} calendar event(s)`,
      results
    });

  } catch (err) {
    console.error('Error creating calendar invites:', err);
    res.status(500).json({
      error: 'Failed to create calendar invites',
      details: err.message
    });
  }
});

// @route   GET /api/calendar/pending-count
// @desc    Get count of pending invites for this teacher
// @access  Private
router.get('/pending-count', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await TutoringRequest.count({
      where: {
        TeacherId: req.teacher.id,
        date: { [Op.gte]: today },
        invite_sent: false
      }
    });

    res.json({ pendingCount: count });
  } catch (err) {
    console.error('Error getting pending count:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PATCH /api/calendar/mark-sent/:id
// @desc    Manually mark a tutoring request as invite-sent
// @access  Private
router.patch('/mark-sent/:id', auth, async (req, res) => {
  try {
    const request = await TutoringRequest.findOne({
      where: { id: req.params.id, TeacherId: req.teacher.id }
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    await request.update({ invite_sent: true, invite_sent_at: new Date() });
    res.json({ message: 'Marked as manually sent', request });
  } catch (err) {
    console.error('Error marking invite as sent:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PATCH /api/calendar/unmark-sent/:id
// @desc    Undo a manual mark (only when no Google Calendar event is attached)
// @access  Private
router.patch('/unmark-sent/:id', auth, async (req, res) => {
  try {
    const request = await TutoringRequest.findOne({
      where: { id: req.params.id, TeacherId: req.teacher.id }
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.calendar_event_id) {
      return res.status(400).json({ error: 'Cannot unmark an invite that was sent via the app' });
    }

    await request.update({ invite_sent: false, invite_sent_at: null });
    res.json({ message: 'Invite unmarked', request });
  } catch (err) {
    console.error('Error unmarking invite:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Group requests by date + merged contiguous time slot.
// Uses TutoringSlot.order for sequencing instead of hardcoded lunch letter order.
function groupByDateAndTimeSlot(requests, timezone) {
  const groups = {};

  requests.forEach(request => {
    const slots = (request.TutoringSlots || []).slice().sort((a, b) => a.order - b.order);
    if (slots.length === 0) return;

    const chunks = getContiguousChunks(slots);

    chunks.forEach(chunk => {
      const timeSlot = getMergedTimeSlot(chunk, request.date, timezone);
      const key = `${request.date}-${timeSlot.start}-${timeSlot.end}`;

      if (!groups[key]) {
        groups[key] = {
          date: request.date,
          timeSlot: chunk.map(s => s.name).join('+'),
          startDateTime: timeSlot.start,
          endDateTime: timeSlot.end,
          students: [],
          requests: []
        };
      }

      if (!groups[key].students.find(s => s.id === request.Student.id)) {
        groups[key].students.push(request.Student);
      }
      groups[key].requests.push(request);
    });
  });

  return Object.values(groups);
}

// Break an array of TutoringSlot objects (sorted by order) into contiguous chunks.
// Example: slots with orders [0,1,3] → [[slot0, slot1], [slot3]]
function getContiguousChunks(sortedSlots) {
  if (sortedSlots.length === 0) return [];

  const chunks = [];
  let currentChunk = [sortedSlots[0]];

  for (let i = 1; i < sortedSlots.length; i++) {
    if (sortedSlots[i].order === sortedSlots[i - 1].order + 1) {
      currentChunk.push(sortedSlots[i]);
    } else {
      chunks.push(currentChunk);
      currentChunk = [sortedSlots[i]];
    }
  }

  chunks.push(currentChunk);
  return chunks;
}

// Get merged ISO datetime range for a contiguous chunk of TutoringSlots
function getMergedTimeSlot(slotChunk, date, timezone) {
  return {
    start: toTimezoneISO(date, slotChunk[0].startTime, timezone),
    end: toTimezoneISO(date, slotChunk[slotChunk.length - 1].endTime, timezone)
  };
}

function toTimezoneISO(date, time, timezone) {
  const dt = new Date(`${date}T${time}:00`);
  const offset = getTimezoneOffset(dt, timezone);
  return `${date}T${time}:00${offset}`;
}

function getTimezoneOffset(dt, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset'
  });
  const parts = formatter.formatToParts(dt);
  const offsetPart = parts.find(p => p.type === 'timeZoneName').value; // e.g. "GMT-4"
  const match = offsetPart.match(/GMT([+-]\d+)/);
  const hours = parseInt(match[1]);
  return hours >= 0
    ? `+${String(hours).padStart(2, '0')}:00`
    : `-${String(Math.abs(hours)).padStart(2, '0')}:00`;
}

module.exports = router;
