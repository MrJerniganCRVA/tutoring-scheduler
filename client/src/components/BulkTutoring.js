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
import {useTutoring} from '../contexts/TutoringContext.js'
import { getMyStudents } from '../utils/enrollments';

// Icons
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import PersonIcon from '@mui/icons-material/Person';

const BulkTutoring = () => {
  // State for form fields
  const {createSession, dismissOverride} = useTutoring();
  const [selectedDate, setSelectedDate] = useState(null);
  const [lunches, setLunches] = useState({
    A: false,
    B: false,
    C: false,
    D: false
  });
  
  // State for students management
  const [allStudents, setAllStudents] = useState([]);
  const [myStudents, setMyStudents] = useState([]);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  // const [studentFilter, setStudentFilter] = useState('');
  
  // State for API interactions
  const [loading, setLoading] = useState(false);
  const [fetchingStudents, setFetchingStudents] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [results, setResults] = useState([]);
  
  // Get the logged in teacher
  const teacherId = localStorage.getItem('teacherId');

  // Load all students when component mounts
  useEffect(() => {
    // Fetch all students from API
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

//   // Filter students when search term changes
//   const filteredStudents = allStudents.filter(student => {
//     const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
//     return fullName.includes(studentFilter.toLowerCase());
// });
  
  // Handler for lunch checkbox changes
  const handleLunchChange = (event) => {
    setLunches({
      ...lunches,
      [event.target.name]: event.target.checked
    });
  };
  
  // Handler for adding a student to the selected list
  const handleAddStudent = () => {
    if (!selectedStudentId) return;
    
    // Find the student from all students
    const studentToAdd = allStudents.find(s => s.id === selectedStudentId);
    
    // Check if student is already selected
    if (selectedStudents.some(s => s.id === selectedStudentId)) {
      const studentName = `${studentToAdd.first_name} ${studentToAdd.last_name}`;
      setError(`${studentName} is already in your selection.`);
      return;
    }
    
    // Add to selected students
    setSelectedStudents([...selectedStudents, studentToAdd]);
    
    //Clear out any lunches that have been selected
    if (studentToAdd.lunchPeriod){
      setLunches(prevLunches =>({
        ...prevLunches,
        [studentToAdd.lunchPeriod]: false
      }));
    }
    // Reset selection
    setSelectedStudentId('');
    setError('');
  };
  
  // Handler for removing a student from the selected list
  const handleRemoveStudent = (studentId) => {
    setSelectedStudents(selectedStudents.filter(s => s.id !== studentId));
  };
  
  // Check if the form is valid for submission
  const isFormValid = () => {
    // Need a date
    if (!selectedDate) return false;
    
    // Need at least one lunch period
    if (!Object.values(lunches).some(v => v)) return false;
    
    // Need at least one student
    if (selectedStudents.length === 0) return false;
    
    return true;
  };
  
  // Handler for form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Reset messages
    setError('');
    setSuccess('');
    setResults([]);
    
    // Validate form
    if (!isFormValid()) {
      setError('Please select a date, at least one lunch period, and at least one student.');
      return;
    }
    
    setLoading(true);
    
    try {
      // Process each student as a separate request
      const successfulStudents = [];
      const failedStudents = [];
      
      for (const student of selectedStudents) {
        try {
          const dateObject = new Date(selectedDate.toISOString().split('T')[0]);
          const formData = {
            studentId: student.id,
            date: dateObject,
            lunches
          };
          const result = await createSession(formData);
          if(result.success){
            successfulStudents.push({
              student: `${student.first_name} ${student.last_name}`,
              id: result.session.id
            });
          } else if (result.requiresOverride && result.conflictDetails){
            failedStudents.push({
              student:`${student.first_name} ${student.last_name}`,
              error: `Already booked by ${result.conflictDetails.existingTeacher} — ${result.conflictDetails.reason}. Use the Individual Student tab to request an override.`
            });
            // Clear the shared conflict state so it doesn't leak a stray
            // override dialog into the Individual Student tab later.
            dismissOverride();
          } else{
            failedStudents.push({
              student:`${student.first_name} ${student.last_name}`,
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
      
      // Set results
      setResults({
        date: format(selectedDate, 'MMMM d, yyyy'),
        lunches: Object.keys(lunches).filter(key => lunches[key]),
        total: selectedStudents.length,
        successful: successfulStudents.length,
        successfulStudents,
        failedStudents
      });
      
      if (failedStudents.length === 0) {
        setSuccess(`Successfully scheduled ${successfulStudents.length} students for tutoring on ${format(selectedDate, 'MMMM d, yyyy')}.`);
      } else if (successfulStudents.length === 0) {
        setError('Failed to schedule any students for tutoring.');
      } else {
        setSuccess(`Partially successful: Scheduled ${successfulStudents.length} out of ${selectedStudents.length} students.`);
      }
      
      // Reset form if completely successful
      if (failedStudents.length === 0) {
        setSelectedStudents([]);
        setSelectedDate(null);
        setLunches({
          A: false,
          B: false,
          C: false,
          D: false
        });
      }
      
    } catch (err) {
      console.error('Error creating tutoring requests:', err);
      setError(apiService.formatError(err));
    } finally {
      setLoading(false);
    }
  };
      // Helper function to disable lunches
  // Returns a set
  const getDisabledLunches = () => {
    const disabledLunches = new Set();
    selectedStudents.forEach(student => {
      if(student.lunchPeriod){
        disabledLunches.add(student.lunchPeriod);
      }
    });
    return disabledLunches;
  }
  // Function to check if a date should be disabled
  const isBlocked = (date) => {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek ===3 || dayOfWeek === 6;
  };
  
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
            <Typography variant="h6" gutterBottom>
              Results Summary
            </Typography>
            <Typography>
              Date: {results.date}
            </Typography>
            <Typography>
              Lunch Periods: {results.lunches.join(', ')}
            </Typography>
            <Typography>
              Successfully scheduled: {results.successful} out of {results.total} students
            </Typography>
            
            {results.failedStudents && results.failedStudents.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" color="error">
                  Failed students:
                </Typography>
                <List dense>
                  {results.failedStudents.map((failure, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <RemoveIcon color="error" />
                      </ListItemIcon>
                      <ListItemText 
                        primary={failure.student} 
                        secondary={failure.error} 
                      />
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
              <Typography variant="subtitle1" gutterBottom>
                Session Details
              </Typography>
              
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
                Select Lunch Periods:
              </Typography>
              
              <FormGroup>
                <Grid container spacing={1}>
                  {['A', 'B', 'C', 'D'].map((period) => {
                    const disabledLunches = getDisabledLunches();
                    const isDisabled = disabledLunches.has(period);
                    
                  return (
                    <Grid item xs={6} key={period}>
                      <FormControlLabel 
                        control={
                          <Checkbox 
                            checked={lunches[period]} 
                            onChange={handleLunchChange} 
                            name={period} 
                            disabled={loading || isDisabled}
                          />
                        } 
                        label={`Lunch ${period}`} 
                      />
                    </Grid>
                  );
                })}
                </Grid>
              </FormGroup>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" gutterBottom>
                Student Selection
              </Typography>

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
  options={showAllStudents ? allStudents : myStudents}
  getOptionLabel={(option) => option.name || `${option.first_name || ''} ${option.last_name || ''}`.trim()}
  value={(showAllStudents ? allStudents : myStudents).find(student => student.id === selectedStudentId) || null}
  onChange={(event, newValue) => {
    const studentId = newValue ? newValue.id : '';
    setSelectedStudentId(studentId);
  }}
  filterOptions={(options, { inputValue }) => {
    const searchText = inputValue.toLowerCase();
    return options.filter(option => {
      const fullName = `${option.first_name || ''} ${option.last_name || ''}`.trim();
      return fullName.toLowerCase().includes(searchText);
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
      helperText={fetchingStudents ? "Loading students..." : "Type to search by student name"}
    />
  )}
  renderOption={(props, option) => {
    const { key, ...cleanProps} = props;
    return (
      <Box component="li" key={key} {...cleanProps} sx={{ display: 'flex', alignItems: 'center', py: 1 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body1">
            {`${option.first_name || ''} ${option.last_name || ''}`.trim()}
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
                      sx={{pr:15}}
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
                      <ListItemIcon>
                        <PersonIcon />
                      </ListItemIcon>
                      <ListItemText 
                        primary={`${student.first_name} ${student.last_name}`}
                        secondary={
                          student.lunchPeriod ? `Lunch: ${student.lunchPeriod}` : 'No lunch info'
                        } 
                        sx={{mr:2}}
                      />
                      {student.lunchPeriod && (
                        <Box sx={{ flexShrink: 0 }}>
                          <Chip
                            label={`Lunch ${student.lunchPeriod}`}
                            size="small"
                            color={
                              student.lunchPeriod === 'A' ? 'error' :
                              student.lunchPeriod === 'B' ? 'success' :
                              student.lunchPeriod === 'C' ? 'primary' :
                              student.lunchPeriod === 'D' ? 'warning' : 'default'
                            }
                          />
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
