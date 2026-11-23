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

const RaptorRotationEvents = () => {
  // rrSessions is already scoped by the server to today's requests for students
  // in this teacher's Raptor Rotation (including the RR-group mapping, which
  // used to live here as a hardcoded table). Cancelled rows are still filtered
  // out here so a cancellation shows immediately, before the next refetch.
  const {rrSessions, error } = useTutoring();

  const todaysRequests = rrSessions.filter(request => request.status !== 'cancelled');

  // Helper function to show lunch periods
  const getLunchPeriods = (request) => {
    const periods = [];
    if (request.lunchA) periods.push('A');
    if (request.lunchB) periods.push('B');
    if (request.lunchC) periods.push('C');
    if (request.lunchD) periods.push('D');
    
    return periods.join(', ');
  };
  const getFullName = (person) => {
    if(!person?.first_name || !person?.last_name) return 'Unknown';
    return `${person.first_name} ${person.last_name}`;
  };
  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
        <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
          {todaysRequests.length>0 ?(
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Teacher</TableCell>
                  <TableCell>Lunch Periods</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {todaysRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{getFullName(request.Student)}</TableCell>
                    <TableCell>{getFullName(request.Teacher)}</TableCell>
                    <TableCell>{getLunchPeriods(request)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          ) : (
            <Alert severity="info">No one requested from your RR today!</Alert>
          )}
        </Paper>
    </Box>
  );
};

export default RaptorRotationEvents;
