import { LaneLine } from '../../components/ui/LaneLine';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-[1fr_1.1fr] md:py-14">
      <div className="asphalt relative hidden overflow-hidden rounded-[2rem] p-8 md:block">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-lane">UrbanFix</p>
        <p className="mt-6 font-display text-4xl font-black leading-[1.02] tracking-tight">
          Every report is a stop on the way to a fixed street.
        </p>
        <LaneLine orientation="vertical" state="moving" className="absolute bottom-0 right-12 top-0 w-1.5" />
      </div>
      <div className="card p-6 sm:p-8">
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
