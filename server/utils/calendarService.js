const { google } = require('googleapis');
const Teacher = require('../models/Teacher');

// Helper to get OAuth2 client for a teacher
async function getOAuth2Client(teacherId) {
  const teacher = await Teacher.findByPk(teacherId);
  
  if (!teacher || !teacher.access_token) {
    throw new Error('Teacher not authenticated with Google Calendar');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token: teacher.access_token,
    refresh_token: teacher.refresh_token,
    expiry_date: teacher.token_expiry ? new Date(teacher.token_expiry).getTime() : null
  });

  // Handle automatic token refresh
  oauth2Client.on('tokens', async (tokens) => {
    console.log('Token refresh triggered');
    if (tokens.refresh_token) {
      await teacher.update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: new Date(tokens.expiry_date)
      });
    } else {
      await teacher.update({
        access_token: tokens.access_token,
        token_expiry: new Date(tokens.expiry_date)
      });
    }
  });

  // Proactively ensure the token is fresh before any Calendar API call.
  // Silent if valid; silently refreshes via refresh_token if expired; throws a
  // user-friendly message if the refresh_token itself is invalid or revoked.
  try {
    await oauth2Client.getAccessToken();
  } catch (err) {
    throw new Error('Google Calendar authorization has expired. Please sign out and sign back in.');
  }

  return oauth2Client;
}

// Create OR update a calendar event
async function upsertCalendarEvent(teacherId, eventDetails, existingEventId = null) {
  const oauth2Client = await getOAuth2Client(teacherId);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const event = {
    summary: eventDetails.summary,
    description: eventDetails.description,
    start: {
      dateTime: eventDetails.startDateTime,
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: eventDetails.endDateTime,
      timeZone: 'America/New_York',
    },
    attendees: eventDetails.attendees,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 10 }       // 10 minutes before
      ],
    },
    sendUpdates: 'all', // Send email invites to attendees
  };

  try {
    if (existingEventId) {
      // UPDATE existing event
      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: existingEventId,
        resource: event,
        sendUpdates: 'all'
      });
      console.log('Updated calendar event:', existingEventId);
      return response.data;
    } else {
      // CREATE new event
      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        sendUpdates: 'all'
      });
      console.log('Created calendar event:', response.data.id);
      return response.data;
    }
  } catch (error) {
    console.error('Calendar API error:', error.message);
    throw error;
  }
}

// Withdraw one student from an event the app previously created.
//
// `teacherId` is the event's *organizer* - the teacher whose calendar the event
// lives on - which for the override path is the teacher being overridden, not
// the one making the request. That works because getOAuth2Client() above builds
// its client from whichever teacher's stored refresh_token it is handed.
//
// Deletes the event outright when the removed student was its last attendee;
// otherwise patches the attendee list so the other students in the same lunch
// block keep their invite. `sendUpdates: 'all'` is what makes Google mail the
// student the cancellation.
async function removeAttendeeFromEvent(teacherId, eventId, studentEmail) {
  const oauth2Client = await getOAuth2Client(teacherId);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const target = (studentEmail || '').toLowerCase();

  try {
    const { data: event } = await calendar.events.get({
      calendarId: 'primary',
      eventId
    });

    const attendees = event.attendees || [];
    const remaining = attendees.filter(a => (a.email || '').toLowerCase() !== target);

    // Nothing to do - the student was never on this event.
    if (remaining.length === attendees.length) {
      return { action: 'not-attendee' };
    }

    if (remaining.length === 0) {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId,
        sendUpdates: 'all'
      });
      console.log('Deleted calendar event (last attendee removed):', eventId);
      return { action: 'deleted' };
    }

    await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      resource: { attendees: remaining },
      sendUpdates: 'all'
    });
    console.log(`Removed ${studentEmail} from calendar event:`, eventId);
    return { action: 'updated' };
  } catch (error) {
    // The event is already gone (deleted by hand, or a previous run got it).
    // Nothing left to clean up, so this is a success, not a failure.
    if (error.code === 404 || error.code === 410) {
      console.log('Calendar event already gone, nothing to remove:', eventId);
      return { action: 'gone' };
    }
    console.error('Calendar API error removing attendee:', error.message);
    throw error;
  }
}

// A request with non-contiguous lunches (e.g. A, B, D) needs one event per
// contiguous chunk, so `calendar_event_id` holds a comma-separated list ordered
// by chunk index ("idAB,idD"). A legacy single id is simply chunk 0. Positions
// are preserved: a chunk without an event yet is an empty slot (",idD").
function parseEventIds(value) {
  if (!value) return [];
  return value.split(',').map(id => id.trim());
}

function joinEventIds(ids) {
  const slots = Array.from(ids, id => id || '');
  while (slots.length && !slots[slots.length - 1]) slots.pop();
  return slots.length ? slots.join(',') : null;
}

module.exports = {
  upsertCalendarEvent,
  removeAttendeeFromEvent,
  parseEventIds,
  joinEventIds
};
