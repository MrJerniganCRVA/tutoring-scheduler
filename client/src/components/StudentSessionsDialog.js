import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import apiService from '../utils/apiService';

const formatDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const SmallTable = ({ head, children }) => (
  <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
    <Table size="small">
      <TableHead>
        <TableRow>
          {head.map(([label, align]) => <TableCell key={label} align={align}><strong>{label}</strong></TableCell>)}
        </TableRow>
      </TableHead>
      <TableBody>{children}</TableBody>
    </Table>
  </TableContainer>
);

// Every tutoring session for one student over the selected range: date,
// lunches (with clock times), service minutes, tutoring teacher and subject - plus the minutes
// totalled by subject - for reporting SPED service minutes. Minutes are the
// sum of the booked lunch blocks (A/B/C 23, D 24; passing time not counted).
// Sessions the student was marked absent from are listed but add no minutes.
//
// `ownSessions` is for a teacher looking at their own sessions with a student
// (Analytics): teacher and subject are always theirs and minutes don't matter
// there, so only the date, lunch and attendance are shown.
const StudentSessionsDialog = ({ student, range, loadDetail, onClose, ownSessions = false }) => {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!student) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    // Only the dates go on the wire. Passing a whole response object here once
    // put the entire caseload into the query string, which the server rejects
    // (HTTP 431) and the browser reports as a connection failure.
    loadDetail(student.id, { from: range.from, to: range.to })
      .then(res => { if (!cancelled) setDetail(res.data); })
      .catch(err => { if (!cancelled) setError(apiService.formatError(err)); });
    return () => { cancelled = true; };
  }, [student, range.from, range.to, loadDetail]);

  const totals = detail?.student;

  return (
    <Dialog open={!!student} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {student && `${student.last_name}, ${student.first_name}`}
        <Typography variant="body2" color="text.secondary">
          {formatDate(range.from)} – {formatDate(range.to)}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error">{error}</Alert>}
        {!error && !detail && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        )}
        {detail && (
          <>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              {totals.totalSessions} session{totals.totalSessions === 1 ? '' : 's'}
              {!ownSessions && ` · ${totals.totalMinutes} minutes`}
              {totals.totalAbsences > 0 && ` · ${totals.totalAbsences} absence${totals.totalAbsences === 1 ? '' : 's'}`}
            </Typography>

            {!ownSessions && totals.bySubject.length > 0 && (
              <SmallTable head={[['Subject'], ['Sessions', 'right'], ['Minutes', 'right']]}>
                {totals.bySubject.map(s => (
                  <TableRow key={s.subject}>
                    <TableCell>{s.subject}</TableCell>
                    <TableCell align="right">{s.sessions}</TableCell>
                    <TableCell align="right">{s.minutes}</TableCell>
                  </TableRow>
                ))}
              </SmallTable>
            )}

            {detail.sessions.length === 0 ? (
              <Alert severity="info">No tutoring in this date range.</Alert>
            ) : (
              <SmallTable head={ownSessions ? [['Date'], ['Lunch']] : [['Date'], ['Lunch'], ['Minutes', 'right'], ['Teacher'], ['Subject']]}>
                {detail.sessions.map(s => (
                  <TableRow key={s.id} sx={{ opacity: s.absent ? 0.7 : 1 }}>
                    <TableCell>{formatDate(s.date)}</TableCell>
                    <TableCell>
                      {s.lunches.map((l, i) => `${l}${s.times ? ` (${s.times[i]})` : ''}`).join(', ')}
                      {s.absent && <Chip label="Absent" color="warning" size="small" sx={{ ml: 1 }} />}
                    </TableCell>
                    {!ownSessions && (
                      <>
                        <TableCell align="right">{s.absent ? '—' : s.minutes}</TableCell>
                        <TableCell>{s.teacher}</TableCell>
                        <TableCell>{s.subject}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </SmallTable>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default StudentSessionsDialog;
