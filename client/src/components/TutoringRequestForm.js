import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormGroup,
  FormControlLabel,
  Autocomplete,
  Checkbox,
  Alert,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import apiService from '../utils/apiService';
import PriorityDatePicker from './PriorityDatePicker.js';
import {useTutoring} from '../contexts/TutoringContext.js';

const TutoringRequestForm = () => {
  const { createSession, confirmOverride, dismissOverride, conflictDetails } = useTutoring();
  const [allStudents, setAllStudents] = useState([]);
  const [myStudents, setMyStudents] = useState([]);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlotIds, setSelectedSlotIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [fetchingStudents, setFetchingStudents] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const teacherId = localStorage.getItem('teacherId');

  useEffect(() => {
    // Fetch tutoring slots
    apiService.getTutoringSlots()
      .then(res => setSlots(res.data))
      .catch(err => console.error('Error fetching slots:', err));

    // Fetch students
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

  const resetForm = () => {
    setSelectedStudent('');
    setSelectedDate(null);
    setSelectedSlotIds(new Set());
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedStudent) {
      setError('Please select a student');
      return;
    }
    if (!selectedDate) {
      setError('Please select a date');
      return;
    }
    if (selectedSlotIds.size === 0) {
      setError('Please select at least one tutoring slot');
      return;
    }

    try {
      setLoading(true);
      const constructedDate = new Date(selectedDate.toISOString().split('T')[0]);
      const formData = {
        studentId: selectedStudent,
        date: constructedDate,
        slotIds: Array.from(selectedSlotIds)
      };
      const result = await createSession(formData);

      if (result.success) {
        setSuccess('Student successfully requested for tutoring');
        if (result.session.overrideInfo) {
          setSuccess(prev => `${prev}. Override successful: ${result.session.overrideInfo.reason}`);
        }
        resetForm();
      } else if (result.requiresOverride) {
        console.log('Override required:', result.conflictDetails);
      }
    } catch (err) {
      console.error('Error creating tutoring request:', err);
      setError(err.message || apiService.formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOverrideConfirm = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await confirmOverride();
      if (result.success) {
        setSuccess('Override successful! Student request has been processed.');
        if (result.overrideInfo) {
          setSuccess(prev => `${prev} ${result.overrideInfo.overriddenTeacher}'s request was cancelled.`);
        }
        resetForm();
      }
    } catch (err) {
      console.error('Error confirming override:', err);
      setError(err.message || 'Failed to confirm override');
    } finally {
      setLoading(false);
    }
  };

  const handleOverrideCancel = () => {
    dismissOverride();
    setLoading(false);
  };

  const activeStudents = showAllStudents ? allStudents : myStudents;

  return (
    <>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Request a Student for Tutoring
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <FormControlLabel
            control={
              <Checkbox
                checked={showAllStudents}
                onChange={(e) => {
                  setShowAllStudents(e.target.checked);
                  setSelectedStudent('');
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
              option.name || `${option.first_name || ''} ${option.last_name || ''}`.trim()
            }
            value={activeStudents.find(s => s.id === selectedStudent) || null}
            onChange={(event, newValue) => setSelectedStudent(newValue ? newValue.id : '')}
            filterOptions={(options, { inputValue }) => {
              const searchText = inputValue.toLowerCase();
              return options.filter(option => {
                const displayName = option.name || `${option.first_name || ''} ${option.last_name || ''}`.trim();
                return displayName.toLowerCase().includes(searchText);
              });
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Select Student"
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
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body1">
                      {option.name || `${option.first_name || ''} ${option.last_name || ''}`.trim()}
                    </Typography>
                  </Box>
                  {option.slotNames && (
                    <Chip
                      label={option.slotNames}
                      size="small"
                      color="primary"
                      sx={{ ml: 1 }}
                    />
                  )}
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

          <PriorityDatePicker
            studentId={selectedStudent}
            value={selectedDate}
            onChange={setSelectedDate}
            label="Select Tutoring Date"
          />

          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
            Select Tutoring Slots:
          </Typography>

          <FormGroup>
            {slots.map(slot => (
              <FormControlLabel
                key={slot.id}
                control={
                  <Checkbox
                    checked={selectedSlotIds.has(slot.id)}
                    onChange={(e) => handleSlotChange(slot.id, e.target.checked)}
                    disabled={loading}
                  />
                }
                label={slot.startTime && slot.endTime ? `${slot.name} (${slot.startTime}–${slot.endTime})` : slot.name}
              />
            ))}
          </FormGroup>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mt: 3 }}
            disabled={loading || fetchingStudents}
          >
            {loading ? <CircularProgress size={24} /> : 'Submit Request'}
          </Button>
        </Box>
      </Paper>

      {/* Override Confirmation Dialog */}
      <Dialog
        open={!!conflictDetails}
        onClose={handleOverrideCancel}
        aria-labelledby="override-dialog-title"
        aria-describedby="override-dialog-description"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="override-dialog-title">
          Priority Override Required
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="override-dialog-description">
            {conflictDetails?.reason}
          </DialogContentText>

          {conflictDetails && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Current Request:</strong> {conflictDetails.existingTeacher} ({conflictDetails.existingSubject})
              </Typography>
              <Typography variant="body2" color="primary" sx={{ mt: 1 }}>
                <strong>Your Priority:</strong> {conflictDetails.reason}
              </Typography>
            </Box>
          )}

          <Alert severity="warning" sx={{ mt: 2 }}>
            Confirming this override will cancel the existing teacher's request and create your request instead.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleOverrideCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleOverrideConfirm}
            variant="contained"
            color="primary"
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : 'Confirm Override'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TutoringRequestForm;
