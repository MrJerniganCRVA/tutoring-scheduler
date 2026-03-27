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

// Add a request interceptor to include teacher ID in headers
apiClient.interceptors.request.use(
  config => {
    const teacherId = localStorage.getItem('teacherId');
    if (teacherId) {
      config.headers['x-teacher-id'] = teacherId;
    }
    return config;
  },
  error => {
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

  bulkUpdateRR: async (updates) => {
    return apiClient.post('/api/students/bulk-rr', { updates });
  },
  
  // Tutoring request endpoints
  getTutoringRequests: async () => {
    return apiClient.get('/api/tutoring');
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
  
  cancelTutoringRequest: async (requestId) => {
    return apiClient.put(`/api/tutoring/cancel/${requestId}`);
  },
  
  // Enhanced error formatting to handle conflict responses
  formatError: (error) => {
    let errorMessage = 'An unknown error occurred';
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      if (error.response.data && error.response.data.msg) {
        errorMessage = error.response.data.msg;
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

  // Period endpoints (admin-managed)
  getPeriods: async () => {
    return apiClient.get('/api/admin/periods');
  },
  createPeriod: async (data) => {
    return apiClient.post('/api/admin/periods', data);
  },
  updatePeriod: async (id, data) => {
    return apiClient.put(`/api/admin/periods/${id}`, data);
  },
  deletePeriod: async (id) => {
    return apiClient.delete(`/api/admin/periods/${id}`);
  },

  // Student period assignment endpoints
  updateStudentPeriods: async (studentId, assignments) => {
    return apiClient.put(`/api/students/${studentId}/periods`, assignments);
  },

  bulkUpdatePeriods: async (updates) => {
    return apiClient.post('/api/students/bulk-periods', { updates });
  },

  // Tutoring slot endpoints (admin-managed)
  getTutoringSlots: async () => {
    return apiClient.get('/api/admin/tutoring-slots');
  },
  createTutoringSlot: async (data) => {
    return apiClient.post('/api/admin/tutoring-slots', data);
  },
  updateTutoringSlot: async (id, data) => {
    return apiClient.put(`/api/admin/tutoring-slots/${id}`, data);
  },
  deleteTutoringSlot: async (id) => {
    return apiClient.delete(`/api/admin/tutoring-slots/${id}`);
  },

  // School config (admin-managed)
  getAdminConfig: async () => {
    return apiClient.get('/api/admin/config');
  },
  updateAdminConfig: async (updates) => {
    return apiClient.put('/api/admin/config', updates);
  },

  // Scheduling config (no_tutoring_days, priority map) — no auth required
  getScheduleConfig: async () => {
    return apiClient.get('/api/tutoring/schedule-config');
  },

  getTeacherAnalytics: async (teacherId) => {
    return await apiClient.get(`/api/analytics/${teacherId}`);
  },
  getStudentHistory: async (teacherId, studentId) => {
    return await apiClient.get(`/api/analytics/${teacherId}/student/${studentId}`);
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
  unmarkInviteSent: async (requestId) => {
    return await apiClient.patch(`/api/calendar/unmark-sent/${requestId}`);
  }
};

export default apiService;