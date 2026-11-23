//Need to implement mui component and add in context to the app

import React, { useState, useEffect } from 'react';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Box, Chip, Alert, Typography } from '@mui/material';
import { useTutoring } from '../contexts/TutoringContext';
import { useAuth } from '../contexts/AuthContext';
import apiService from '../utils/apiService';
import { toDateOnly } from '../utils/dates';

// Priority mapping
const SUBJECT_PRIORITIES = {
  1: 'CS',        // Monday
  2: 'Math',      // Tuesday  
  4: 'Humanities', // Thursday
  5: 'Science'    // Friday
};

const PriorityDatePicker = ({ 
  studentId,
  value, 
  onChange,
  ...muiDatePickerProps 
}) => {
  const { fetchStudentSessions } = useTutoring();
  const { currentUser } = useAuth();
  const [currentTeacher, setCurrentTeacher] = useState(null);
  const [dateStatus, setDateStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [studentSessions, setStudentSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // The teacher's subject decides which days they can override, so it has to
  // be loaded before any date can be judged.
  useEffect(() => {
    const fetchCurrentTeacher = async () =>{
      if(!currentUser){
        setLoading(false);
        return;
      }
      try{
        const response = await apiService.getTeacher(currentUser.id);
        setCurrentTeacher(response.data);
      } catch(e){
        console.error("Error fetching teacher", apiService.formatError(e));
      } finally{
        setLoading(false);
      }

    }

    fetchCurrentTeacher();

  }, [currentUser]);

  // Every teacher's active bookings for this student, fetched on demand -
  // spotting a conflict means seeing other teachers' requests, which the
  // teacher-scoped `sessions` list deliberately no longer carries.
  useEffect(() => {
    let cancelled = false;
    if (!studentId) {
      setStudentSessions([]);
      return undefined;
    }
    setSessionsLoading(true);
    fetchStudentSessions(studentId)
      .then(rows => { if (!cancelled) setStudentSessions(rows); })
      .finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [studentId, fetchStudentSessions]);

  // A session's date is already a 'YYYY-MM-DD' string; compare against the
  // picker's local calendar day rather than round-tripping both through UTC.
  const sessionOn = (date) =>
    studentSessions.find(session => session.date === toDateOnly(date));

  const shouldDisableDate = (date) => {
    const yesteday = new Date();
    yesteday.setDate(yesteday.getDate()-1);
    if(date < yesteday) return true;
    const dayOfWeek = date.getDay();
    
    // Disable weekends and Wednesday
    if (dayOfWeek === 0 || dayOfWeek === 6 || dayOfWeek === 3) {
      return true;
    }
    
    if (!studentId || !currentTeacher) return false;

    // Check if student has a session on this date
    const existingSession = sessionOn(date);

    if (!existingSession) {
      return false;
    }

    // If current teacher's subject has priority for this day, allow selection
    const dayPrioritySubject = SUBJECT_PRIORITIES[dayOfWeek];
    if (currentTeacher.subject === dayPrioritySubject) {
      return false; // Can override
    }
    return true; // Otherwise, disable the date
  };

  const getDateStatusInfo = (date) => {
    if (!studentId || !date || !currentTeacher) return null;

    const dayOfWeek = date.getDay();
    const existingSession = sessionOn(date);
    if (!existingSession) {
      return { type: 'available', message: 'Available' };
    }

    const dayPrioritySubject = SUBJECT_PRIORITIES[dayOfWeek];
    // The booking teacher is already on the session we just found - naming them
    // here is what lets the teacher see who they are about to override before
    // they submit, rather than only in the confirmation dialog.
    const existingTeacher = existingSession.Teacher
      ? `${existingSession.Teacher.first_name} ${existingSession.Teacher.last_name}`
      : 'another teacher';

    if (currentTeacher.subject === dayPrioritySubject) {
      return { 
        type: 'canOverride', 
        message: `Will override ${existingTeacher}'s booking (${currentTeacher.subject} priority day)`,
        existingTeacher,
        existingSession
      };
    }

    return { 
      type: 'blocked', 
      message: `Already booked by ${existingTeacher}`,
      existingTeacher,
      existingSession
    };
  };

  const handleDateChange = (newDate) => {
    if (newDate) {
      setDateStatus(getDateStatusInfo(newDate));
    } else {
      setDateStatus(null);
    }
    onChange(newDate);
  };
  //Don't render if loading
  if(loading || sessionsLoading){
    return (
      <Box sx={{ p: 2, border: '1px dashed #ccc', borderRadius: 1 }}>
        <Typography color="text.secondary">
          {loading ? 'Loading teacher information...' : 'Checking existing bookings...'}
        </Typography>
      </Box>
    );
  }
  // Don't render if no student selected
  if (!studentId) {
    return (
      <Box sx={{ p: 2, border: '1px dashed #ccc', borderRadius: 1 }}>
        <Typography color="text.secondary">
          Please select a student first
        </Typography>
      </Box>
    );
  };

  const getStatusColor = (type) => {
    switch (type) {
      case 'available': return 'success';
      case 'canOverride': return 'warning';
      case 'blocked': return 'error';
      default: return 'default';
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <DatePicker
          value={value}
          onChange={handleDateChange}
          shouldDisableDate={shouldDisableDate}
          {...muiDatePickerProps} // All your existing MUI props
        />
        
        {dateStatus && (
          <Box sx={{ mt: 2 }}>
            <Chip
              label={dateStatus.message}
              color={getStatusColor(dateStatus.type)}
              variant="outlined"
              size="small"
            />
            
            {dateStatus.type === 'canOverride' && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                <Typography variant="body2">
                  This will override {dateStatus.existingTeacher}'s booking because {currentTeacher?.subject} has 
                  priority on {value?.toLocaleDateString('en-US', { weekday: 'long' })}s.
                  They will be notified and the student will be removed from their calendar invite.
                </Typography>
              </Alert>
            )}
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Priority: Mon(CS) | Tue(Math) | Thu(Humanities) | Fri(Science) 
        </Typography>
      </Box>
    </LocalizationProvider>
  );
};

export default PriorityDatePicker;