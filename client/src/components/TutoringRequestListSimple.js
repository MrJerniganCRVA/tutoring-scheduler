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
import {useTutoring} from '../contexts/TutoringContext';
import { todayDateOnly } from '../utils/dates';
import AttendanceToggle from './AttendanceToggle';

const TutoringRequestListSimple = () => {

  const {sessions, error} = useTutoring();
  const getFullName = (person) => {
    if (!person?.first_name || !person?.last_name) return '';
    return `${person.first_name} ${person.last_name}`;
  };

  // sessions is already this teacher's own requests, so only the day and the
  // cancelled check are left. (This used to match teachers by comparing
  // lowercased display names, which broke for any two teachers sharing one.)
  const filteredRequests = sessions.filter(request => {
    if(request.status==='cancelled'){
      return false;
    }
    return request.date === todayDateOnly();
  });

  
  // Helper function to show lunch periods
  const getLunchPeriods = (request) => {
    const periods = [];
    if (request.lunchA) periods.push('A');
    if (request.lunchB) periods.push('B');
    if (request.lunchC) periods.push('C');
    if (request.lunchD) periods.push('D');
    
    return periods.join(', ');
  };
  
  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Paper elevation={3} sx={{ p: 3 }}>

        {filteredRequests.length === 0 ? (
          <Alert severity="info">You have no students coming for tutoring today.</Alert>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Lunch Periods</TableCell>
                  <TableCell>Attendance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell sx={{ opacity: request.absent ? 0.6 : 1 }}>{getFullName(request.Student) || 'Unknown'}</TableCell>
                    <TableCell sx={{ opacity: request.absent ? 0.6 : 1 }}>{getLunchPeriods(request)}</TableCell>
                    <TableCell><AttendanceToggle request={request} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default TutoringRequestListSimple;
