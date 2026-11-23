import React, { useState } from 'react';
import { Button, CircularProgress, Snackbar, Alert } from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import apiService from '../utils/apiService';
import { useTutoring } from '../contexts/TutoringContext';
import { useAuth } from '../contexts/AuthContext';
import { todayDateOnly } from '../utils/dates';

function CalendarInviteButton() {
  const { sessions, refreshSessions } = useTutoring();
  const { currentUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const today = todayDateOnly();
  const pendingCount = sessions.filter(s =>
    s.date >= today &&
    !s.invite_sent &&
    s.TeacherId === currentUser?.id
  ).length;

  const handleSendInvites = async () => {
    setSending(true);

    try {
      const response = await apiService.sendCalendarInvites();

      setSnackbar({
        open: true,
        message: response.data.msg,
        severity: 'success'
      });

      refreshSessions();
    } catch (err) {
      console.error('Error sending invites:', err);
      setSnackbar({
        open: true,
        message: err.response?.data?.details || err.response?.data?.error || 'Error sending calendar invites',
        severity: 'error'
      });
    } finally {
      setSending(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <>
        <Button
          variant="contained"
          color="primary"
          startIcon={sending ? <CircularProgress size={20} color="inherit" /> : <CalendarTodayIcon />}
          onClick={handleSendInvites}
          disabled={pendingCount === 0 || sending}
          sx={{ mr: 2 }}
        >
          {sending ? 'Sending...' : 'Send Calendar Invites'}
        </Button>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

export default CalendarInviteButton;
