import axios from 'axios';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

// Create an axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Redirect to login on session expiry
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && window.location.pathname !== '/select-teacher') {
      localStorage.removeItem('teacherId');
      localStorage.removeItem('teacherName');
      window.location.href = '/select-teacher';
    }
    return Promise.reject(error);
  }
);

// API service methods
const apiService = {
  // Teacher endpoints
  getTeachers: async () => {
    return apiClient.get('/api/teachers');
  },
  
  getTeacher: async (id) => {
    return apiClient.get(`/api/teachers/${id}`);
  },
  
  createTeacher: async (teacherData) => {
    return apiClient.post('/api/teachers', teacherData);
  },

  updateTeacher: async (id, data) => {
    return apiClient.put(`/api/teachers/${id}`, data);
  },

  bulkCreateTeachers: async (teachers) => {
    return apiClient.post('/api/teachers/bulk-create', { teachers });
  },
  
  // Student endpoints
  getStudents: async () => {
    return apiClient.get('/api/students');
  },
  
  getStudent: async (id) => {
    return apiClient.get(`/api/students/${id}`);
  },
  
  createStudent: async (studentData) => {
    return apiClient.post('/api/students', studentData);
  },

  updateStudent: async (id, data) => {
    return apiClient.put(`/api/students/${id}`, data);
  },

  // period is 'RR' or 'SPED' (case manager); updates are { studentId, teacherId }.
  bulkUpdateEnrollment: async (period, updates) => {
    return apiClient.post('/api/students/bulk-enrollment', { period, updates });
  },

  // SPED caseload: tutoring summary for the signed-in teacher's own caseload.
  getCaseload: async (params = {}) => {
    return apiClient.get('/api/caseload', { params });
  },

  // Admin student lookup: one student's tutoring summary.
  getStudentTutoring: async (studentId, params = {}) => {
    return apiClient.get(`/api/admin/students/${studentId}/tutoring`, { params });
  },

  // Per-student session detail (dates, lunches, minutes) for the name popup:
  // caseload-scoped for case managers, any student for admins.
  getCaseloadStudentSessions: async (studentId, params = {}) => {
    return apiClient.get(`/api/caseload/students/${studentId}/sessions`, { params });
  },

  getStudentSessions: async (studentId, params = {}) => {
    return apiClient.get(`/api/admin/students/${studentId}/sessions`, { params });
  },

  bulkCreateStudents: async (students) => {
    return apiClient.post('/api/students/bulk-create', { students });
  },
  
  // Tutoring request endpoints
  // params narrow what comes back - see GET /api/tutoring for the supported
  // scopes. Called with no params it returns this teacher's requests for the
  // current school year.
  getTutoringRequests: async (params = {}) => {
    return apiClient.get('/api/tutoring', { params });
  },
  
  createTutoringRequest: async (requestData) => {
    return apiClient.post('/api/tutoring', requestData);
  },
  
  // NEW: Create tutoring request with override
  createTutoringRequestWithOverride: async (requestData) => {
    return apiClient.post('/api/tutoring', {
      ...requestData,
      override: true
    });
  },
  
  // NEW: Check priority for a specific date
  checkPriorityForDate: async (date) => {
    return apiClient.get(`/api/tutoring/priority/${date}`);
  },
  
  // "Are you covering today?" - RR teachers to pick from, then today's
  // leaving list for the chosen RR (student names only).
  getRRTeachers: async () => {
    return apiClient.get('/api/tutoring/rr-teachers');
  },

  getCoverageList: async (teacherId) => {
    return apiClient.get(`/api/tutoring/coverage/${teacherId}`);
  },

  // Admin dashboard
  getAdminToday: async () => {
    return apiClient.get('/api/admin/today');
  },

  getAdminTrends: async (params = {}) => {
    return apiClient.get('/api/admin/trends', { params });
  },

  // Runs the Kotlin report service, which may be waking from sleep - so a long
  // timeout, and a Blob response the caller saves as a file.
  downloadReport: async () => {
    return apiClient.get('/api/admin/report', { responseType: 'blob', timeout: 150000 });
  },

  cancelTutoringRequest: async (requestId) => {
    return apiClient.put(`/api/tutoring/cancel/${requestId}`);
  },

  // Mark a session's student absent (true) or back to present (false).
  setAttendance: async (requestId, absent) => {
    return apiClient.patch(`/api/tutoring/${requestId}/attendance`, { absent });
  },
  
  // Enhanced error formatting to handle conflict responses
  formatError: (error) => {
    let errorMessage = 'An unknown error occurred';
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      if (error.response.data && error.response.data.msg) {
        errorMessage = error.response.data.msg;

        // The non-overridable conflicts (403 existing-teacher-has-priority,
        // 400 same-subject, 400 first-come-first-served) all ship the incumbent
        // teacher's name in `conflict`, but `msg` alone never mentions them -
        // so the teacher was left reading "Request denied" with no idea who
        // holds the student.
        const conflict = error.response.data.conflict;
        if (conflict && conflict.existingTeacher) {
          errorMessage += ` - already requested by ${conflict.existingTeacher}`;
          if (conflict.existingSubject) errorMessage += ` (${conflict.existingSubject})`;
          if (conflict.reason) errorMessage += `. ${conflict.reason}`;
        }
      } else {
        errorMessage = `Server error: ${error.response.status}`;
      }
    } else if (error.request) {
      // The request was made but no response was received
      errorMessage = 'No response from server. Please check your connection.';
    } else {
      // Something happened in setting up the request that triggered an Error
      errorMessage = error.message;
    }
    
    return errorMessage;
  },

  // NEW: Helper to check if error is a conflict that can be overridden
  isOverridableConflict: (error) => {
    return error.response && 
           error.response.status === 409 && 
           error.response.data && 
           error.response.data.requireOverride === true;
  },

  // NEW: Get conflict details from error response
  getConflictDetails: (error) => {
    if (error.response && error.response.data && error.response.data.conflict) {
      return error.response.data.conflict;
    }
    return null;
  },

  // Teacher analytics: the teacher's own tutoring over a from/to range.
  getTeacherAnalytics: async (teacherId, params = {}) => {
    return apiClient.get(`/api/analytics/${teacherId}`, { params });
  },
  // Students the teacher teaches or tutored, with their own sessions/minutes.
  getTeacherStudents: async (teacherId, params = {}) => {
    return apiClient.get(`/api/analytics/${teacherId}/students`, { params });
  },
  getTeacherStudentSessions: async (teacherId, studentId, params = {}) => {
    return apiClient.get(`/api/analytics/${teacherId}/students/${studentId}/sessions`, { params });
  },
  getPendingInviteCount: async () => {
    return await apiClient.get('/api/calendar/pending-count');
  },
  sendCalendarInvites: async () => {
    return await apiClient.post('/api/calendar/send-invites');
  },
  markInviteSent: async (requestId) => {
    return await apiClient.patch(`/api/calendar/mark-sent/${requestId}`);
  },
  getNotifications: async ({ unreadOnly = false } = {}) => {
    return await apiClient.get('/api/notifications', {
      params: unreadOnly ? { unread: 'true' } : {}
    });
  },
  markNotificationRead: async (notificationId) => {
    return await apiClient.patch(`/api/notifications/${notificationId}/read`);
  },
  markAllNotificationsRead: async () => {
    return await apiClient.patch('/api/notifications/read-all');
  },

  unmarkInviteSent: async (requestId) => {
    return await apiClient.patch(`/api/calendar/unmark-sent/${requestId}`);
  }
};

export default apiService;