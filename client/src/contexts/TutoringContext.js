import React, {createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiService from '../utils/apiService';
import { useAuth } from './AuthContext';
import { todayDateOnly } from '../utils/dates';
const TutoringContext = createContext();

export const TutoringProvider = ({children}) => {
    const { currentUser, authLoading } = useAuth();
    // This teacher's own requests for the current school year.
    const [sessions, setSessions] = useState([]);
    // Today's requests for students in this teacher's Raptor Rotation,
    // whichever teacher booked them. Scoped by the server from the session.
    const [rrSessions, setRrSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [conflictDetails, setConflictDetails] = useState(null);

    const fetchSessions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try{
            const [mine, rr] = await Promise.all([
                apiService.getTutoringRequests({ scope: 'mine' }),
                apiService.getTutoringRequests({ scope: 'rr', date: todayDateOnly() })
            ]);
            setSessions(mine.data);
            setRrSessions(rr.data);
        } catch (e){
            const errorMessage = apiService.formatError(e);
            setError(errorMessage);
            console.error('error fetching tutoring requests', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // UPDATED: Enhanced createSession that handles conflicts
    const createSession = async (sessionData) => {
        try{
            setError(null);
            setConflictDetails(null);
            
            const response = await apiService.createTutoringRequest(sessionData);
            const newSession = response.data;
            
            // Handle successful response (might include override info)
            if (response.data.overrideInfo) {
                console.log('Override successful:', response.data.overrideInfo);
            }
            
            setSessions(prev => [...prev, newSession]);
            return { success: true, session: newSession };
            
        } catch (e) {
            // Check if this is an overridable conflict
            if (apiService.isOverridableConflict(e)) {
                const conflict = apiService.getConflictDetails(e);
                setConflictDetails({
                    ...conflict,
                    originalRequestData: sessionData // Store the original request
                });
                
                return { 
                    success: false, 
                    requiresOverride: true, 
                    conflictDetails: conflict 
                };
            } else {
                // Handle other errors normally
                const errorMessage = apiService.formatError(e);
                setError(errorMessage);
                console.error('error creating tutoring request', e);
                throw new Error(errorMessage);
            }
        }
    };

    // NEW: Handle override confirmation
    const confirmOverride = async () => {
        if (!conflictDetails || !conflictDetails.originalRequestData) {
            throw new Error('No conflict data available for override');
        }

        try {
            setError(null);
            const response = await apiService.createTutoringRequestWithOverride(
                conflictDetails.originalRequestData
            );
            
            const newSession = response.data.request || response.data;
            setSessions(prev => [...prev, newSession]);
            
            // Clear conflict state
            setConflictDetails(null);
            
            return { 
                success: true, 
                session: newSession, 
                overrideInfo: response.data.overrideInfo 
            };
            
        } catch (e) {
            const errorMessage = apiService.formatError(e);
            setError(errorMessage);
            console.error('error confirming override', e);
            throw new Error(errorMessage);
        }
    };

    const dismissOverride = () => {
        setConflictDetails(null);
    };

    const cancelSession = async (sessionId) =>{
        try{
            const response = await apiService.cancelTutoringRequest(sessionId);
            setSessions(prev => prev.map(session =>
                session.id===sessionId
                ?{...session, status:'cancelled'}
                : session
            ));
            return response.data;
        } catch (e){
            const errorMessage = apiService.formatError(e);
            console.error('error cancelling tutoring request', e);
            throw new Error(errorMessage);
        } 
    };

    // Optimistic: the row flips immediately so a teacher taking attendance at
    // lunch isn't waiting on the network, and flips back if the save fails.
    const setAttendance = async (sessionId, absent) => {
        const flip = (value) => setSessions(prev => prev.map(session =>
            session.id === sessionId ? { ...session, absent: value } : session
        ));
        setError(null);
        flip(absent);
        try {
            await apiService.setAttendance(sessionId, absent);
        } catch (e) {
            flip(!absent);
            const errorMessage = apiService.formatError(e);
            setError(errorMessage);
            console.error('error saving attendance', e);
        }
    };

    // Active bookings for one student from today forward, across every teacher -
    // the scheduling form needs other teachers' requests to spot a conflict.
    // Fetched on demand rather than filtered out of `sessions`, which only ever
    // holds this teacher's own rows.
    const fetchStudentSessions = useCallback(async (studentId) => {
        if (!studentId) return [];
        try {
            const response = await apiService.getTutoringRequests({
                scope: 'student',
                studentId,
                status: 'active',
                from: todayDateOnly()
            });
            return response.data;
        } catch (e) {
            console.error('error fetching sessions for student', e);
            return [];
        }
    }, []);

    const checkPriorityForDate = async (date) => {
        try {
            const response = await apiService.checkPriorityForDate(date);
            return response.data;
        } catch (e) {
            console.error('Error checking priority for date', e);
            return null;
        }
    };

    // Load once the session is known, and reload if the signed-in teacher
    // changes. Keyed on auth state rather than localStorage: after a Google
    // login the app remounts before AuthProvider has resolved the session, so a
    // mount-only fetch found no teacher and left the dashboard permanently
    // empty until a manual refresh. Still never fires while logged out, which
    // is what keeps a 401 from bouncing us into a redirect loop.
    useEffect(()=>{
        if (authLoading) return;
        if (currentUser) {
            fetchSessions();
        } else {
            setSessions([]);
            setRrSessions([]);
            setError(null);
        }
    }, [authLoading, currentUser, fetchSessions]);

    const markInviteSent = async (requestId) => {
        await apiService.markInviteSent(requestId);
        await fetchSessions();
    };

    const unmarkInviteSent = async (requestId) => {
        await apiService.unmarkInviteSent(requestId);
        await fetchSessions();
    };

    const value = {
        sessions,
        rrSessions,
        loading,
        error,
        conflictDetails,
        createSession,
        confirmOverride,
        dismissOverride,
        cancelSession,
        setAttendance,
        fetchStudentSessions,
        checkPriorityForDate,
        refreshSessions: fetchSessions,
        markInviteSent,
        unmarkInviteSent
    };

    return (
        <TutoringContext.Provider value={value}>
            {children}
        </TutoringContext.Provider>
    );
};

export const useTutoring = () => {
    const context = useContext(TutoringContext);
    if(!context){
        throw new Error('useTutoring must be used within a Tutoring Provider');
    }
    return context;
}
