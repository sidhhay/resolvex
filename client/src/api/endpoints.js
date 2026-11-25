import { api } from './client.js';

export const authApi = {
  login: async (credentials) => (await api.post('/auth/login', credentials)).data,
  register: async (data) => (await api.post('/auth/register', data)).data,
  verifyRegistration: async (email, code) => (await api.post('/auth/register/verify', { email, code })).data,
  me: async () => (await api.get('/auth/me')).data,
  forgotPassword: async (email) => (await api.post('/auth/forgot-password', { email })).data,
  resetPassword: async (token, password) => (await api.post('/auth/reset-password', { token, password })).data,
  requestOtp: async (email) => (await api.post('/auth/otp/request', { email })).data,
  verifyOtp: async (email, code) => (await api.post('/auth/otp/verify', { email, code })).data,
};

export const complaintApi = {
  list: async (params) => (await api.get('/complaints', { params })).data,
  detail: async (id) => (await api.get(`/complaints/${id}`)).data,
  create: async (data) => (await api.post('/complaints', data)).data,
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
  overview: async () => (await api.get('/analytics/overview')).data,
  escalations: async () => (await api.get('/analytics/escalations')).data,
  runSweep: async () => (await api.post('/analytics/escalations/run')).data,
};

export const usersApi = {
  create: async (userData) => (await api.post('/auth/users', userData)).data,
};
