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
import { getMyStudents } from '../utils/enrollments';

const TutoringRequestForm = () => {
  const { createSession, confirmOverride, dismissOverride, conflictDetails } = useTutoring();
  const [allStudents, setAllStudents] = useState([]);
  const [myStudents, setMyStudents] = useState([]);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [studentLunchPeriod, setStudentLunchPeriod] = useState(null);
  const [lunches, setLunches] = useState({
    A: false,
    B: false,
    C: false,
    D: false
  });
  const [loading, setLoading] = useState(false);
  const [fetchingStudents, setFetchingStudents] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Get the logged in teacher
  const teacherId = localStorage.getItem('teacherId');
  useEffect(() => {
    // Fetch students
    const fetchStudents = async () => {
      try {
        setFetchingStudents(true);
        const response = await apiService.getStudents();
        const processStudent = (student) => {
          let lunchPeriod = null;
          if(student.teachers && student.teachers.RR && student.teachers.RR.lunch){
            lunchPeriod = student.teachers.RR.lunch;
          } else if (student.RR && student.RR.lunch){
            lunchPeriod = student.RR.lunch;
          } else if (student.lunchPeriod){
            lunchPeriod = student.lunchPeriod;
          } else if (student.lunch){
            lunchPeriod = student.lunch;
          }
          const fullName = `${student.first_name} ${student.last_name}`;
          return {
            ...student,
            lunchPeriod,
            displayName: lunchPeriod ? `[${lunchPeriod}] ${fullName}` : fullName
          };
        };
        const processedAll = response.data.map(processStudent);
        const processedMy = getMyStudents(response.data, teacherId).map(processStudent);
        setAllStudents(processedAll);
        setMyStudents(processedMy);
        setFetchingStudents(false);
      } catch (err) {
        console.error('Error fetching students:', err);
        setError(apiService.formatError(err));
        setFetchingStudents(false);
      }
    };
    
    fetchStudents();
  }, [teacherId]);

  const handleStudentChange = async (event) =>{
    const studentId = event.target.value;
    setSelectedStudent(studentId);

    const student = allStudents.find(s => s.id === studentId) || myStudents.find(s => s.id === studentId);
    if(student){
      try{
        const rrTeacherId = student.RRId;
        const teacherResponse = await apiService.getTeacher(rrTeacherId);
        const teacherLunch = teacherResponse.data.lunch;
        setStudentLunchPeriod(teacherLunch);
      } catch (error){
        console.log("Couldn't find lunch of student");
      }
    }
    else{
      setStudentLunchPeriod(null);
    }
  }
  const handleLunchChange = (event) => {
    setLunches({
      ...lunches,
      [event.target.name]: event.target.checked
    });
  };
  const resetForm = () => {
    setSelectedStudent('');
    setSelectedDate(null);
    setLunches({
      A: false,
      B: false,
      C: false,
      D: false
    });
    setStudentLunchPeriod(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Reset messages
    setError('');
    setSuccess('');
    
    // Validate form
    if (!selectedStudent) {
      setError('Please select a student');
      return;
    }
    
    if (!selectedDate) {
      setError('Please select a date');
      return;
    }
    
    const anyLunchSelected = Object.values(lunches).some(val => val);
    if (!anyLunchSelected) {
      setError('Please select at least one lunch period');
      return;
    }

    // Submit request
    try {
      setLoading(true);
      let constructedDate = new Date(selectedDate.toISOString().split('T')[0]);
      const formData = {studentId: selectedStudent, date: constructedDate, lunches};
      const result = await createSession(formData);

      if (result.success) {
        // Request succeeded
        setSuccess('Student successfully requested for tutoring');
        if (result.session.overrideInfo) {
          setSuccess(prev => `${prev}. Override successful: ${result.session.overrideInfo.reason}`);
        }
        resetForm();
      } else if (result.requiresOverride) {
        // Conflict detected - dialog will show automatically via conflictDetails
        // Don't reset form or show success/error yet
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
          const { overriddenTeacher, notified, calendarCleanup } = result.overrideInfo;
          setSuccess(prev => `${prev} ${overriddenTeacher}'s request was cancelled`
            + `${notified ? ' and they have been notified' : ''}.`);

          // Say so when the other teacher's calendar could not be updated -
          // otherwise the teacher walks away assuming the student was pulled off
          // an invite that still lists them.
          if (calendarCleanup && calendarCleanup.attempted && !calendarCleanup.ok) {
            setSuccess(prev => `${prev} Note: their Google Calendar invite could not be`
              + ` updated automatically, so the student may still appear on it.`);
          } else if (calendarCleanup && calendarCleanup.action === 'deleted') {
            setSuccess(prev => `${prev} Their calendar event was removed.`);
          } else if (calendarCleanup && calendarCleanup.action === 'updated') {
            setSuccess(prev => `${prev} The student was removed from their calendar invite.`);
          }
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
                  setStudentLunchPeriod(null);
                }}
                disabled={fetchingStudents || loading}
              />
            }
            label="Show all students (for review sessions)"
            sx={{ mb: 1 }}
          />

          <Autocomplete
            id="student-autocomplete"
            options={showAllStudents ? allStudents : myStudents}
            getOptionLabel={(option) => option.name || `${option.first_name || ''} ${option.last_name || ''}`.trim()}
            value={(showAllStudents ? allStudents : myStudents).find(student => student.id === selectedStudent) || null}
            onChange={(event, newValue) => {
              const studentId = newValue ? newValue.id : '';
              handleStudentChange({target: {value: studentId}});
            }}
            filterOptions={(options, { inputValue }) => {
              // Only filter by student name
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
                helperText={fetchingStudents ? "Loading students..." : "Type to search by student name"}
              />
            )}
            renderOption={(props, option) => {
              const { key, ...cleanProps} = props;
              return (
                <Box component="li" key={key} {...cleanProps} sx={{ display: 'flex', alignItems: 'center', py: 1 }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="body1">
                    {option.name || `${option.first_name || ''} ${option.last_name || ''}`.trim()}
                  </Typography>
                </Box>
                {option.lunchPeriod && (
                  <Chip
                    label={`Lunch ${option.lunchPeriod}`}
                    size="small"
                    color={
                      option.lunchPeriod === 'A' ? 'error' :
                      option.lunchPeriod === 'B' ? 'success' :
                      option.lunchPeriod === 'C' ? 'primary' :
                      option.lunchPeriod === 'D' ? 'warning' : 'default'
                    }
                    sx={{ ml: 1 }}
                  />
              )}
              </Box>
              );
            }}
            noOptionsText={
              fetchingStudents ? "Loading students..." : "No students found"
            }
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
            Select Lunch Periods:
          </Typography>
          
          <FormGroup>
            {['A','B','C','D'].map(period => (
              <FormControlLabel
              key={period}
              control={
                <Checkbox
                checked={lunches[period]}
                onChange={handleLunchChange}
                name={period}
                disabled={period===studentLunchPeriod || loading}
                />
              }
              label={
                period===studentLunchPeriod
                ? `Lunch ${period} (Unavailable)`
                : `Lunch ${period}`
              }
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
            Confirming this override will cancel {conflictDetails?.existingTeacher || "the existing teacher"}'s
            request and create your request instead. They will be notified, and if they had already sent a
            calendar invite the student will be removed from it.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleOverrideCancel} 
            disabled={loading}
          >
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