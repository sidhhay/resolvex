import { useState, useEffect } from 'react';
import { ShieldAlert, UserPlus, Check, Building2, Eye, EyeOff } from 'lucide-react';
import { usersApi, departmentApi } from '../../api/endpoints.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Card, Field, inputClasses, Spinner } from '../../components/ui/index.jsx';

export function UserManagementPage() {
  const { user } = useAuth();
  
  const [departments, setDepartments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'handler',
    departmentId: ''
  });

  useEffect(() => {
    departmentApi.list().then(res => setDepartments(res.departments)).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(false);
    try {
      await usersApi.create(formData);
      setSuccess(true);
      setFormData({ name: '', email: '', password: '', role: 'handler', departmentId: '' });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Only superadmins or global admins can see this
  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <ShieldAlert size={48} className="text-critical mb-4" />
        <h2 className="text-xl font-bold text-ink">Access Denied</h2>
        <p className="text-ink-secondary">You do not have Superadmin privileges to view this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
          <UserPlus className="text-series-1" /> User Management
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          Superadmin portal to provision new handlers and administrators.
        </p>
      </div>

      <Card className="p-6">
        <div className="mb-6 flex items-start gap-3 p-4 bg-series-1/10 border border-series-1/20 rounded-xl">
          <ShieldAlert className="text-series-1 shrink-0 mt-0.5" size={20} />
          <p className="text-sm text-ink font-medium">
            Users created here bypass normal registration and immediately gain privileged access. Please ensure emails are correct.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field label="Full Name" htmlFor="name" required>
            <input
              id="name"
              type="text"
              required
              className={inputClasses}
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. John Smith"
            />
          </Field>

          <Field label="Institutional Email" htmlFor="email" required>
            <input
              id="email"
              type="email"
              required
              className={inputClasses}
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="admin@resolvex.edu"
            />
          </Field>

          <Field label="Temporary Password" htmlFor="password" required>
            <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              className={`${inputClasses} pr-12`}
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder="e.g. TempPass123"
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            </div>
            <p className="text-xs text-ink-muted mt-1">Must be at least 8 chars with a letter and a number.</p>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Role" htmlFor="role" required>
              <select
                id="role"
                className={inputClasses}
                value={formData.role}
                onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value, departmentId: e.target.value === 'admin' ? '' : prev.departmentId }))}
              >
                <option value="handler">Department Handler</option>
                <option value="admin">Superadmin</option>
              </select>
            </Field>

            {formData.role === 'handler' && (
              <Field label="Assigned Department" htmlFor="department" required>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" size={16} />
                  <select
                    id="department"
                    required
                    className={`${inputClasses} pl-10`}
                    value={formData.departmentId}
                    onChange={(e) => setFormData(prev => ({ ...prev, departmentId: e.target.value }))}
                  >
                    <option value="">Select a department...</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              </Field>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-line flex items-center justify-between">
            <div>
              {success && (
                <span className="flex items-center gap-1.5 text-good text-sm font-medium animate-in fade-in">
                  <Check size={16} /> User created successfully
                </span>
              )}
            </div>
            <Button type="submit" loading={submitting}>
              Provision User
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
