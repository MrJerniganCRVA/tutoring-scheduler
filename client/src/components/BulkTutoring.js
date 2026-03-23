import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Grid,
  Autocomplete
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format } from 'date-fns';
import apiService from '../utils/apiService';
import {useTutoring} from '../contexts/TutoringContext.js';

import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import PersonIcon from '@mui/icons-material/Person';

const BulkTutoring = () => {
  const {createSession} = useTutoring();
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlotIds, setSelectedSlotIds] = useState(new Set());
  const [noTutoringDays, setNoTutoringDays] = useState([0, 6]);

  const [allStudents, setAllStudents] = useState([]);
  const [myStudents, setMyStudents] = useState([]);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const [loading, setLoading] = useState(false);
  const [fetchingStudents, setFetchingStudents] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [results, setResults] = useState([]);

  const teacherId = localStorage.getItem('teacherId');

  useEffect(() => {
    // Fetch tutoring slots and schedule config in parallel with students
    apiService.getTutoringSlots()
      .then(res => setSlots(res.data))
      .catch(err => console.error('Error fetching slots:', err));

    apiService.getScheduleConfig()
      .then(res => setNoTutoringDays(res.data.no_tutoring_days || [0, 6]))
      .catch(err => console.error('Error fetching schedule config:', err));

    const fetchStudents = async () => {
      try {
        setFetchingStudents(true);
        const response = await apiService.getStudents();

        const processStudent = (student) => {
          const slotNames = student.TutoringSlots?.map(s => s.name).join(', ') || null;
          const fullName = `${student.first_name} ${student.last_name}`;
          return {
            ...student,
            slotNames,
            displayName: slotNames ? `${fullName} [${slotNames}]` : fullName
          };
        };

        const processedAll = response.data.map(processStudent);
        const processedMy = response.data
          .filter(student =>
            student.StudentPeriodAssignments?.some(
              a => a.TeacherId === parseInt(teacherId)
            )
          )
          .map(processStudent);

        setAllStudents(processedAll);
        setMyStudents(processedMy);
      } catch (err) {
        console.error('Error fetching students:', err);
        setError(apiService.formatError(err));
      } finally {
        setFetchingStudents(false);
      }
    };

    fetchStudents();
  }, [teacherId]);

  const handleSlotChange = (slotId, checked) => {
    setSelectedSlotIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(slotId);
      else next.delete(slotId);
      return next;
    });
  };

  const handleAddStudent = () => {
    if (!selectedStudentId) return;
    const studentToAdd = allStudents.find(s => s.id === selectedStudentId);
    if (selectedStudents.some(s => s.id === selectedStudentId)) {
      setError(`${studentToAdd.first_name} ${studentToAdd.last_name} is already in your selection.`);
      return;
    }
    setSelectedStudents([...selectedStudents, studentToAdd]);
    setSelectedStudentId('');
    setError('');
  };

  const handleRemoveStudent = (studentId) => {
    setSelectedStudents(selectedStudents.filter(s => s.id !== studentId));
  };

  const isFormValid = () =>
    !!selectedDate && selectedSlotIds.size > 0 && selectedStudents.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setResults([]);

    if (!isFormValid()) {
      setError('Please select a date, at least one tutoring slot, and at least one student.');
      return;
    }

    setLoading(true);

    try {
      const successfulStudents = [];
      const failedStudents = [];

      for (const student of selectedStudents) {
        try {
          const dateObject = new Date(selectedDate.toISOString().split('T')[0]);
          const formData = {
            studentId: student.id,
            date: dateObject,
            slotIds: Array.from(selectedSlotIds)
          };
          const result = await createSession(formData);
          if (result.success) {
            successfulStudents.push({
              student: `${student.first_name} ${student.last_name}`,
              id: result.session.id
            });
          } else {
            failedStudents.push({
              student: `${student.first_name} ${student.last_name}`,
              error: result.message || 'Failed to create session'
            });
          }
        } catch (studentError) {
          failedStudents.push({
            student: `${student.first_name} ${student.last_name}`,
            error: studentError.message || apiService.formatError(studentError)
          });
        }
      }

      const selectedSlotNames = slots
        .filter(s => selectedSlotIds.has(s.id))
        .map(s => s.name)
        .join(', ');

      setResults({
        date: format(selectedDate, 'MMMM d, yyyy'),
        slots: selectedSlotNames,
        total: selectedStudents.length,
        successful: successfulStudents.length,
        successfulStudents,
        failedStudents
      });

      if (failedStudents.length === 0) {
        setSuccess(`Successfully scheduled ${successfulStudents.length} students for tutoring on ${format(selectedDate, 'MMMM d, yyyy')}.`);
        setSelectedStudents([]);
        setSelectedDate(null);
        setSelectedSlotIds(new Set());
      } else if (successfulStudents.length === 0) {
        setError('Failed to schedule any students for tutoring.');
      } else {
        setSuccess(`Partially successful: Scheduled ${successfulStudents.length} out of ${selectedStudents.length} students.`);
      }
    } catch (err) {
      console.error('Error creating tutoring requests:', err);
      setError(apiService.formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const isBlocked = (date) => noTutoringDays.includes(date.getDay());

  const activeStudents = showAllStudents ? allStudents : myStudents;

  return (
    <Box>
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Schedule Multiple Students
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {results.successfulStudents && results.successfulStudents.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>Results Summary</Typography>
            <Typography>Date: {results.date}</Typography>
            <Typography>Slots: {results.slots}</Typography>
            <Typography>Successfully scheduled: {results.successful} out of {results.total} students</Typography>

            {results.failedStudents && results.failedStudents.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" color="error">Failed students:</Typography>
                <List dense>
                  {results.failedStudents.map((failure, index) => (
                    <ListItem key={index}>
                      <ListItemIcon><RemoveIcon color="error" /></ListItemIcon>
                      <ListItemText primary={failure.student} secondary={failure.error} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" gutterBottom>Session Details</Typography>

              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Tutoring Date"
                  value={selectedDate}
                  onChange={(newDate) => setSelectedDate(newDate)}
                  renderInput={(params) => (
                    <TextField {...params} fullWidth margin="normal" />
                  )}
                  shouldDisableDate={isBlocked}
                  minDate={new Date()}
                  disabled={loading}
                />
              </LocalizationProvider>

              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Select Tutoring Slots:
              </Typography>

              <FormGroup>
                <Grid container spacing={1}>
                  {slots.map((slot) => (
                    <Grid item xs={6} key={slot.id}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={selectedSlotIds.has(slot.id)}
                            onChange={(e) => handleSlotChange(slot.id, e.target.checked)}
                            disabled={loading}
                          />
                        }
                        label={slot.name}
                      />
                    </Grid>
                  ))}
                </Grid>
              </FormGroup>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" gutterBottom>Student Selection</Typography>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={showAllStudents}
                    onChange={(e) => {
                      setShowAllStudents(e.target.checked);
                      setSelectedStudentId('');
                    }}
                    disabled={fetchingStudents || loading}
                  />
                }
                label="Show all students (for review sessions)"
                sx={{ mb: 1 }}
              />

              <Autocomplete
                id="student-autocomplete"
                options={activeStudents}
                getOptionLabel={(option) =>
                  option.displayName || `${option.first_name || ''} ${option.last_name || ''}`.trim()
                }
                value={activeStudents.find(s => s.id === selectedStudentId) || null}
                onChange={(event, newValue) => setSelectedStudentId(newValue ? newValue.id : '')}
                filterOptions={(options, { inputValue }) => {
                  const searchText = inputValue.toLowerCase();
                  return options.filter(option => {
                    const displayName = option.displayName || `${option.first_name || ''} ${option.last_name || ''}`.trim();
                    return displayName.toLowerCase().includes(searchText);
                  });
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Add Student"
                    margin="normal"
                    fullWidth
                    placeholder="Type student name..."
                    disabled={fetchingStudents || loading}
                    helperText={fetchingStudents ? 'Loading students...' : 'Type to search by student name'}
                  />
                )}
                renderOption={(props, option) => {
                  const { key, ...cleanProps } = props;
                  return (
                    <Box component="li" key={key} {...cleanProps} sx={{ display: 'flex', alignItems: 'center', py: 1 }}>
                      <Typography variant="body1">
                        {option.displayName || `${option.first_name || ''} ${option.last_name || ''}`.trim()}
                      </Typography>
                    </Box>
                  );
                }}
                noOptionsText={fetchingStudents ? 'Loading students...' : 'No students found'}
                loading={fetchingStudents}
                disabled={loading}
                clearOnBlur
                selectOnFocus
                handleHomeEndKeys
                autoHighlight
                openOnFocus
              />

              <Button
                variant="outlined"
                color="primary"
                onClick={handleAddStudent}
                disabled={!selectedStudentId || loading}
                startIcon={<AddIcon />}
                sx={{ mt: 1 }}
              >
                Add Student
              </Button>
            </Grid>
          </Grid>

          {selectedStudents.length > 0 && (
            <Box sx={{ mt: 3, mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                Selected Students ({selectedStudents.length})
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, maxHeight: 200, overflow: 'auto' }}>
                <List dense>
                  {selectedStudents.map((student) => (
                    <ListItem
                      key={student.id}
                      sx={{ pr: 15 }}
                      secondaryAction={
                        <Button
                          edge="end"
                          color="error"
                          size="small"
                          onClick={() => handleRemoveStudent(student.id)}
                          disabled={loading}
                        >
                          Remove
                        </Button>
                      }
                    >
                      <ListItemIcon><PersonIcon /></ListItemIcon>
                      <ListItemText
                        primary={`${student.first_name} ${student.last_name}`}
                        secondary={student.slotNames ? `Slots: ${student.slotNames}` : 'No slot info'}
                        sx={{ mr: 2 }}
                      />
                      {student.slotNames && (
                        <Box sx={{ flexShrink: 0 }}>
                          <Chip label={student.slotNames} size="small" color="primary" />
                        </Box>
                      )}
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Box>
          )}

          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mt: 3 }}
            disabled={!isFormValid() || loading}
          >
            {loading ? (
              <CircularProgress size={24} />
            ) : (
              `Schedule ${selectedStudents.length} Students for Tutoring`
            )}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default BulkTutoring;
