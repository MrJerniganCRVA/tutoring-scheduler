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
  Tooltip
} from '@mui/material';
import { Search as SearchIcon, CheckCircleOutline as CheckCircleOutlineIcon, Undo as UndoIcon } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import {useTutoring} from '../contexts/TutoringContext';
import CalendarInviteButton from './CalendarInviteButton';

const TutoringRequestList = () => {
  const [filterDate, setFilterDate] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const teacherId = localStorage.getItem('teacherId');
  const {sessions, error, cancelSession, markInviteSent, unmarkInviteSent} = useTutoring();
  const getFullName = (person) => {
    if (!person?.first_name || !person?.last_name) return '';
    return `${person.first_name} ${person.last_name}`;
  };
  const handleCancelRequest = async (requestId) => {
    cancelSession(requestId);
  };
  
  // Filter requests by date and search term as well as remove any non teacher requests
  const filteredRequests = sessions.filter(request => {
    if(request.status==='cancelled'){
      return false;
    }

    const requestTeacherName = getFullName(request.Teacher).toLowerCase();
    const currentTeacherName = (localStorage.getItem('teacherName') || '').toLowerCase();

    if(requestTeacherName !== currentTeacherName){
      return false;
    }

    if (filterDate) {
      const selectedDate = filterDate.toISOString().split('T')[0];
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
      const today = new Date().toISOString().split('T')[0];
      return request.date >= today;
    }

    return true;
  });

  // Helper function to format date
  const formatDate = (dateString) => {
    return format(parseISO(dateString), 'MMM dd, yyyy');
  };
  
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
        <Typography variant="h5" component="h2" gutterBottom>
          Tutoring Requests by {localStorage.getItem('teacherName')}
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
                  <TableCell>Tutoring Slots</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Invite Status</TableCell>
                  <TableCell align="right">Cancel Event?</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{formatDate(request.date)}</TableCell>
                    <TableCell>{getFullName(request.Student) || 'Unknown'}</TableCell>
                    <TableCell>{getSlotNames(request)}</TableCell>
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
                    <TableCell align="right">
                      {request.status === 'active' && 
                       request.Teacher?.id === parseInt(teacherId) && (
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
