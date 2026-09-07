import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation } from 'react-router';
import { toast } from 'sonner';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { AuthLayout } from '../components/layout/AuthLayout';
import { DemoAccountCard } from '../components/DemoAccountCard';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';

const loginSchema = z.object({
 email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
 password: z.string().min(6, 'Password must be at least 6 characters'),
});

export function LoginPage() {
 const [loading, setLoading] = useState(false);
 const navigate = useNavigate();
 const location = useLocation();
 const setAuth = useAuthStore((state) => state.setAuth);

 const from = location.state?.from?.pathname || '/dashboard';

 const {
 register,
 handleSubmit,
 formState: { errors },
 } = useForm({
 resolver: zodResolver(loginSchema),
 defaultValues: {
 email: '',
 password: '',
 },
 });

 const onSubmit = async (values) => {
 setLoading(true);
 try {
 const data = await api.post('/api/auth/login', values);
 setAuth(data.token, data.merchantId);
 toast.success('Signed in successfully');
 navigate(from, { replace: true });
 } catch (err) {
 toast.error(err.message || 'Login failed. Please verify credentials.');
 } finally {
 setLoading(false);
 }
 };

 return (
 <AuthLayout
 title="Sign in to VerbaTask"
 subtitle="Access your business dashboard, inventory, and live orders."
 >
 <DemoAccountCard />

 <div className="relative flex items-center justify-center my-4">
   <div className="border-t border-hairline w-full" />
   <span className="bg-surface px-3 text-[11px] uppercase tracking-wider text-ink-mute font-medium absolute">
     Or sign in manually
   </span>
 </div>

 <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
 <Input
 label="Email address"
 id="login-email"
 type="email"
 autoComplete="email"
 placeholder="name@business.com"
 leftIcon={<Mail className="w-4 h-4" />}
 error={errors.email?.message}
 required
 {...register('email')}
 />

 <Input
 label="Password"
 id="login-password"
 type="password"
 autoComplete="current-password"
 placeholder="••••••••"
 leftIcon={<Lock className="w-4 h-4" />}
 error={errors.password?.message}
 required
 {...register('password')}
 />

 <div className="flex justify-end -mt-1">
 <Link
 to="/forgot-password"
 className="text-xs text-ink-secondary hover:text-primary transition-colors hover:underline"
 >
 Forgot password?
 </Link>
 </div>

 <div className="pt-2">
 <Button
 type="submit"
 className="w-full"
 loading={loading}
 rightIcon={<ArrowRight className="w-4 h-4" />}
 >
 Sign in
 </Button>
 </div>

 <div className="pt-4 border-t border-hairline flex flex-col items-center gap-2 text-xs text-ink-mute">
 <p>
 Don't have an account?{' '}
 <Link
 to="/signup"
 className="text-primary font-medium hover:underline focus:outline-none"
 >
 Sign up
 </Link>
 </p>
 <p>
 Have a WhatsApp code?{' '}
 <Link
 to="/link-code"
 className="text-ink-secondary hover:text-primary transition-colors hover:underline"
 >
 Confirm link code
 </Link>
 </p>
 </div>
 </form>
 </AuthLayout>
 );
}
