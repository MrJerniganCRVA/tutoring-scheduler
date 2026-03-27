import React from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert
} from '@mui/material';
import {useTutoring } from '../contexts/TutoringContext';

const StudentsLeavingToday = () => {
  const {sessions, error } = useTutoring();

  const teacherId = parseInt(localStorage.getItem('teacherId'));

  // Show today's sessions where:
  // - the student has this teacher assigned to any period, AND
  // - the request was made by a different teacher (student is leaving for someone else's tutoring)
  const todaysRequests = sessions.filter(request => {
    if (request.status === 'cancelled') return false;

    const requestDate = new Date(request.date + 'T00:00:00');
    const today = new Date();
    const isToday =
      requestDate.getFullYear() === today.getFullYear() &&
      requestDate.getMonth() === today.getMonth() &&
      requestDate.getDate() === today.getDate();

    if (!isToday) return false;

    // Only show requests made by OTHER teachers
    if (request.TeacherId === teacherId) return false;

    // Only show students who have this teacher in one of their period assignments
    const studentHasThisTeacher = request.Student?.StudentPeriodAssignments?.some(
      a => a.TeacherId === teacherId
    );
    return !!studentHasThisTeacher;
  });

  const getSlotNames = (request) => {
    return (request.TutoringSlots || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(s => s.name)
      .join(', ');
  };

  const getFullName = (person) => {
    if (!person?.first_name || !person?.last_name) return 'Unknown';
    return `${person.first_name} ${person.last_name}`;
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        {todaysRequests.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Teacher</TableCell>
                  <TableCell>Tutoring Slots</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {todaysRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{getFullName(request.Student)}</TableCell>
                    <TableCell>{getFullName(request.Teacher)}</TableCell>
                    <TableCell>{getSlotNames(request)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Alert severity="info">No students from your classes are leaving for tutoring today.</Alert>
        )}
      </Paper>
    </Box>
  );
};

export default StudentsLeavingToday;
