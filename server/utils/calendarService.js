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
      timeZone: eventDetails.timezone || 'UTC',
    },
    end: {
      dateTime: eventDetails.endDateTime,
      timeZone: eventDetails.timezone || 'UTC',
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

module.exports = {
  upsertCalendarEvent
};
