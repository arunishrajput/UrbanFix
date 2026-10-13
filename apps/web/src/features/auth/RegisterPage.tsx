import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { registerSchema, upgradeGuestSchema, type RegisterInput } from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { AuthShell } from './AuthShell';

export default function RegisterPage() {
  const { register: signUp, upgrade, user } = useAuth();
  const isGuest = Boolean(user?.isGuest);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(isGuest ? upgradeGuestSchema : registerSchema),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isGuest) {
        await upgrade({ name: values.name, email: values.email, password: values.password });
        toast.success('Account created. Your reports are saved to it.');
      } else {
        await signUp(values);
        toast.success('Welcome to UrbanFix');
      }
      navigate(params.get('next') ?? '/me', { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create the account. Try again.';
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') form.setError('email', { message });
      else form.setError('root', { message });
    }
  });

  return (
    <AuthShell
      title={isGuest ? 'Save your reports' : 'Create an account'}
      subtitle={
        isGuest
          ? 'Keep the reports you made as a guest, on any device.'
          : 'Report issues, follow fixes and build your civic reputation.'
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Full name"
          autoComplete="name"
          {...form.register('name')}
          error={form.formState.errors.name?.message}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          {...form.register('email')}
          error={form.formState.errors.email?.message}
        />
        {!isGuest && (
          <Input
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            {...form.register('phone')}
            error={form.formState.errors.phone?.message}
          />
        )}
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
          {...form.register('password')}
          error={form.formState.errors.password?.message}
        />
        {form.formState.errors.root && (
          <p
            className="rounded-xl bg-[#ffe6da] px-3 py-2 text-sm font-medium text-cone-ink dark:bg-[#40210f]"
            role="alert"
          >
            {form.formState.errors.root.message}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          {isGuest ? 'Save my reports' : 'Create account'}
        </Button>
      </form>
      {!isGuest && (
        <p className="mt-6 text-center text-sm">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-signal">
            Sign in
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
