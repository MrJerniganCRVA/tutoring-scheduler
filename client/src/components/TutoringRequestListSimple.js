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

const TutoringRequestListSimple = () => {

  const {sessions, error} = useTutoring();
  const getFullName = (person) => {
    if (!person?.first_name || !person?.last_name) return '';
    return `${person.first_name} ${person.last_name}`;
  };
  
  // Filter requests by date 
  const filteredRequests = sessions.filter(request => {
    if(request.status==='cancelled'){
      return false;
    }
    const requestTeacherName = getFullName(request.Teacher).toLowerCase();
    const currentTeacherName = (localStorage.getItem('teacherName') || '').toLowerCase();

    if(requestTeacherName !== currentTeacherName){
      return false;
    }
    const today = new Date().toISOString().split('T')[0];
    return request.date === today;
  });

  
  // Helper function to show tutoring slot names
  const getSlotNames = (request) => {
    return (request.TutoringSlots || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(s => s.name)
      .join(', ');
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
                  <TableCell>Tutoring Slots</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{getFullName(request.Student) || 'Unknown'}</TableCell>
                    <TableCell>{getSlotNames(request)}</TableCell>
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
