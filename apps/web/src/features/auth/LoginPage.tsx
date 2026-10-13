import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { loginSchema, MUNICIPAL_ROLES, type LoginInput } from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { AuthShell } from './AuthShell';

const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';
const DEMO = [
  ['Citizen', 'citizen@urbanfix.local'],
  ['Ward official (Shivajinagar)', 'official.shivajinagar@urbanfix.local'],
  ['City-wide official', 'official@urbanfix.local'],
  ['Field staff', 'staff@urbanfix.local'],
  ['Administrator', 'admin@urbanfix.local'],
] as const;

export default function LoginPage() {
  const { login, continueAsGuest } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      navigate(next ?? (MUNICIPAL_ROLES.includes(user.role) ? '/dashboard' : '/'), { replace: true });
    } catch (err) {
      form.setError('root', {
        message: err instanceof ApiError ? err.message : 'Could not sign in. Try again.',
      });
    }
  });

  return (
    <AuthShell title="Sign in" subtitle="Track your reports, verify fixes and earn badges.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          {...form.register('email')}
          error={form.formState.errors.email?.message}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
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
          Sign in
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          await continueAsGuest();
          navigate(next ?? '/report', { replace: true });
        }}
      >
        Continue as guest
      </Button>
      <p className="mt-2 text-center text-xs text-muted">
        Guests can report and verify. Create an account later to keep your history.
      </p>
      <p className="mt-6 text-center text-sm">
        New here?{' '}
        <Link
          to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="font-bold text-signal"
        >
          Create an account
        </Link>
      </p>
      {SHOW_DEMO && (
        <details className="mt-6 rounded-2xl border border-dashed border-line p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Demo accounts</summary>
          <p className="mt-2 text-xs text-muted">
            Password for all: <code className="font-mono">urbanfix123</code>
          </p>
          <ul className="mt-2 space-y-1">
            {DEMO.map(([label, email]) => (
              <li key={email}>
                <button
                  type="button"
                  className="text-left text-signal hover:underline"
                  onClick={() => {
                    form.setValue('email', email);
                    form.setValue('password', 'urbanfix123');
                  }}
                >
                  {label} — <span className="font-mono text-xs">{email}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </AuthShell>
  );
}
