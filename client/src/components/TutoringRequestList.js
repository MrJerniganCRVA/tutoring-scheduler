import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  TextField,
  InputAdornment,
  Alert,
  IconButton,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { Search as SearchIcon, CheckCircleOutline as CheckCircleOutlineIcon, Undo as UndoIcon } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import {useTutoring} from '../contexts/TutoringContext';
import { useAuth } from '../contexts/AuthContext';
import { toDateOnly, todayDateOnly } from '../utils/dates';
import CalendarInviteButton from './CalendarInviteButton';
import AttendanceToggle from './AttendanceToggle';

const TutoringRequestList = () => {
  const [filterDate, setFilterDate] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  // 'upcoming' = today and later; 'past' = earlier this school year, which is
  // where a teacher catches up on attendance they didn't take on the day.
  const [view, setView] = useState('upcoming');

  const { currentUser } = useAuth();
  const teacherId = currentUser?.id;
  const {sessions, error, cancelSession, markInviteSent, unmarkInviteSent} = useTutoring();
  const getFullName = (person) => {
    if (!person?.first_name || !person?.last_name) return '';
    return `${person.first_name} ${person.last_name}`;
  };
  const handleCancelRequest = async (requestId) => {
    cancelSession(requestId);
  };

  // sessions is already scoped to this teacher for the current school year, so
  // the date/search filters below are all that's left. Searching still reaches
  // back over the year; clearing it returns to the Upcoming/Past view.
  const filteredRequests = sessions.filter(request => {
    if(request.status==='cancelled'){
      return false;
    }

    if (filterDate) {
      const selectedDate = toDateOnly(filterDate);
      if (request.date !== selectedDate)
      {
        return false;
      }
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const studentName = getFullName(request.Student).toLowerCase();
      return studentName.includes(term);
    }

    if(!filterDate && !searchTerm){
      return view === 'past'
        ? request.date < todayDateOnly()
        : request.date >= todayDateOnly();
    }

    return true;
  });
  // Past sessions read newest first, so yesterday is at the top.
  if (view === 'past' && !filterDate && !searchTerm) {
    filteredRequests.reverse();
  }

  // Helper function to format date
  const formatDate = (dateString) => {
    return format(parseISO(dateString), 'MMM dd, yyyy');
  };
  
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
        <Typography variant="h5" component="h2" gutterBottom>
          Tutoring Requests by {currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : ''}
        </Typography>
        
        <Box sx={{ display: 'flex', mb: 3, gap: 2, alignItems:'center' }}>
          <TextField
            label="Search by name"
            variant="outlined"
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ flexGrow: 1 }}
          />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(e, next) => { if (next) setView(next); }}
            aria-label="Which sessions to show"
          >
            <ToggleButton value="upcoming">Upcoming</ToggleButton>
            <ToggleButton value="past">Past</ToggleButton>
          </ToggleButtonGroup>
          
          {/* <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="Filter by date"
              value={filterDate}
              onChange={setFilterDate}
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  size="small" 
                  sx={{ width: 180 }}
                />
              )}
            />
          </LocalizationProvider> */}
          <Button 
            variant="outlined" 
            onClick={() => {
              setFilterDate(null);
              setSearchTerm('');
            }}
          >
            Clear Filters
          </Button>
          <CalendarInviteButton />
        </Box>
        
        {filteredRequests.length === 0 ? (
          <Alert severity="info">No tutoring requests found.</Alert>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Student</TableCell>
                  <TableCell>Lunch Periods</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Invite Status</TableCell>
                  <TableCell>Attendance</TableCell>
                  <TableCell align="right">Cancel Event?</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{formatDate(request.date)}</TableCell>
                    <TableCell>{getFullName(request.Student) || 'Unknown'}</TableCell>
                    <TableCell>{getLunchPeriods(request)}</TableCell>
                    <TableCell>
                      <Chip 
                        label={request.status} 
                        color={request.status === 'active' ? 'success' : 'default'} 
                        size="small" 
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {request.invite_sent && request.calendar_event_id ? (
                          <Chip label="Invited" color="success" size="small" />
                        ) : request.invite_sent ? (
                          <Chip label="Invited (Manual)" color="info" size="small" />
                        ) : (
                          <Chip label="Pending" color="warning" size="small" />
                        )}
                        {!request.invite_sent && (
                          <Tooltip title="Mark as manually sent">
                            <IconButton size="small" onClick={() => markInviteSent(request.id)}>
                              <CheckCircleOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {request.invite_sent && !request.calendar_event_id && (
                          <Tooltip title="Undo manual mark">
                            <IconButton size="small" onClick={() => unmarkInviteSent(request.id)}>
                              <UndoIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <AttendanceToggle request={request} />
                    </TableCell>
                    <TableCell align="right">
                      {request.status === 'active' && 
                       request.Teacher?.id === teacherId && (
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleCancelRequest(request.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </TableCell>
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

export default TutoringRequestList;
