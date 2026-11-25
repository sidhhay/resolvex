import { api } from './client.js';

export const authApi = {
  login: async (credentials) => (await api.post('/auth/login', credentials)).data,
  register: async (data) => (await api.post('/auth/register', data)).data,
  verifyRegistration: async (email, code) => (await api.post('/auth/register/verify', { email, code })).data,
  me: async () => (await api.get('/auth/me')).data,
  forgotPassword: async (email) => (await api.post('/auth/forgot-password', { email })).data,
  resetPasswordWithOtp: async (email, code, password) => (await api.post('/auth/forgot-password/verify', { email, code, password })).data,
  resetPassword: async (token, password) => (await api.post('/auth/reset-password', { token, password })).data,
  requestOtp: async (email) => (await api.post('/auth/otp/request', { email })).data,
  verifyOtp: async (email, code) => (await api.post('/auth/otp/verify', { email, code })).data,
};

export const complaintApi = {
  list: async (params) => (await api.get('/complaints', { params })).data,
  detail: async (id) => (await api.get(`/complaints/${id}`)).data,
  create: async (data, onUploadProgress) => {
    const body = new FormData();
    body.append('title', data.title);
    body.append('description', data.description);
    if (data.attachment) body.append('attachment', data.attachment);

    return (
      await api.post('/complaints', body, {
        // Let the browser set the multipart boundary automatically.
        onUploadProgress: (event) => {
          if (event.total) onUploadProgress?.(Math.round((event.loaded * 100) / event.total));
        },
      })
    ).data;
  },
  transition: async (id, data) => (await api.post(`/complaints/${id}/transitions`, data)).data,
  meta: async () => (await api.get('/complaints/meta')).data,
  timeline: async (id) => (await api.get(`/complaints/${id}/timeline`)).data,
};

export const departmentApi = {
  list: async () => (await api.get('/departments')).data,
  handlers: async (id) => (await api.get(`/departments/${id}/handlers`)).data,
};

export const notificationApi = {
  list: async () => (await api.get('/notifications')).data,
  markRead: async (id) => (await api.patch(`/notifications/${id}/read`)).data,
  markAllRead: async () => (await api.post('/notifications/read-all')).data,
};

export const analyticsApi = {
  overview: async (params) => (await api.get('/analytics/overview', { params })).data,
  escalations: async (params) => (await api.get('/analytics/escalations', { params })).data,
  runSweep: async () => (await api.post('/analytics/escalations/run')).data,
};

export const usersApi = {
  create: async (userData) => (await api.post('/auth/users', userData)).data,
};
