import React, { useState, useEffect } from 'react';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Box, Chip, Alert, Typography } from '@mui/material';
import { useTutoring } from '../contexts/TutoringContext';
import apiService from '../utils/apiService';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PriorityDatePicker = ({
  studentId,
  value,
  onChange,
  ...muiDatePickerProps
}) => {
  const { getSessionsForStudent } = useTutoring();
  const [currentTeacher, setCurrentTeacher] = useState(null);
  const [scheduleConfig, setScheduleConfig] = useState(null);
  const [dateStatus, setDateStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInitialData = async () => {
      const teacherId = localStorage.getItem('teacherId');
      if (!teacherId) {
        console.error('No teacher id in local storage');
        setLoading(false);
        return;
      }
      try {
        const [teacherRes, configRes] = await Promise.all([
          apiService.getTeacher(teacherId),
          apiService.getScheduleConfig()
        ]);
        setCurrentTeacher(teacherRes.data);
        setScheduleConfig(configRes.data);
      } catch (e) {
        console.error('Error loading date picker data', apiService.formatError(e));
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const studentSessions = studentId ? getSessionsForStudent(studentId) : [];

  const isSameDay = (date1, date2) =>
    date1.toISOString().split('T')[0] === date2.toISOString().split('T')[0];

  const getPrioritySubjectForDay = (dayOfWeek) => {
    if (!scheduleConfig?.subject_priority_enabled) return null;
    const map = scheduleConfig.subject_priority_map || {};
    return map[dayOfWeek] || null;
  };

  const shouldDisableDate = (date) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date < yesterday) return true;

    const dayOfWeek = date.getDay();
    const noTutoringDays = scheduleConfig?.no_tutoring_days || [0, 6];
    if (noTutoringDays.includes(dayOfWeek)) return true;

    if (!studentId || !currentTeacher) return false;

    const existingSession = studentSessions.find(session =>
      isSameDay(new Date(session.date), date)
    );
    if (!existingSession) return false;

    // If current teacher's subject has priority for this day, allow selection (can override)
    const dayPrioritySubject = getPrioritySubjectForDay(dayOfWeek);
    if (currentTeacher.subject === dayPrioritySubject) return false;

    return true;
  };

  const getDateStatusInfo = (date) => {
    if (!studentId || !date || !currentTeacher) return null;

    const dayOfWeek = date.getDay();
    const existingSession = studentSessions.find(session =>
      isSameDay(new Date(session.date), date)
    );
    if (!existingSession) return { type: 'available', message: 'Available' };

    const dayPrioritySubject = getPrioritySubjectForDay(dayOfWeek);
    if (currentTeacher.subject === dayPrioritySubject) {
      return {
        type: 'canOverride',
        message: `Will override existing booking (${currentTeacher.subject} priority day)`,
        existingSession
      };
    }

    return { type: 'blocked', message: 'Already booked', existingSession };
  };

  const handleDateChange = (newDate) => {
    setDateStatus(newDate ? getDateStatusInfo(newDate) : null);
    onChange(newDate);
  };

  const getStatusColor = (type) => {
    switch (type) {
      case 'available': return 'success';
      case 'canOverride': return 'warning';
      case 'blocked': return 'error';
      default: return 'default';
    }
  };

  // Build priority caption from config
  const priorityCaption = scheduleConfig?.subject_priority_enabled
    ? Object.entries(scheduleConfig.subject_priority_map || {})
        .map(([dayIndex, subject]) => `${DAY_NAMES[parseInt(dayIndex)]}(${subject})`)
        .join(' | ')
    : null;

  if (loading) {
    return (
      <Box sx={{ p: 2, border: '1px dashed #ccc', borderRadius: 1 }}>
        <Typography color="text.secondary">Loading date picker...</Typography>
      </Box>
    );
  }

  if (!studentId) {
    return (
      <Box sx={{ p: 2, border: '1px dashed #ccc', borderRadius: 1 }}>
        <Typography color="text.secondary">Please select a student first</Typography>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <DatePicker
          value={value}
          onChange={handleDateChange}
          shouldDisableDate={shouldDisableDate}
          {...muiDatePickerProps}
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
                  This will override the existing booking because {currentTeacher?.subject} has
                  priority on {value?.toLocaleDateString('en-US', { weekday: 'long' })}s.
                </Typography>
              </Alert>
            )}
          </Box>
        )}

        {priorityCaption && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Priority: {priorityCaption}
          </Typography>
        )}
      </Box>
    </LocalizationProvider>
  );
};

export default PriorityDatePicker;
