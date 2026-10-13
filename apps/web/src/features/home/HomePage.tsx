import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Camera, CircleCheck, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import type { IssueSummary, Paginated, PendingVerification, PublicStats } from '@urbanfix/shared';
import { LaneLine } from '../../components/ui/LaneLine';
import { CountUp, Skeleton } from '../../components/ui/misc';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { pct, timeAgo } from '../../lib/format';
import { useGeolocation } from '../../lib/geo';
import { qk } from '../../lib/query';
import { useConfig } from '../../lib/reference';
import { IssueCard, IssueRow } from '../issues/IssueCard';

function Hero({ cityName }: { cityName: string }) {
  const { data } = useQuery({
    queryKey: qk.issues({ status: 'VERIFIED', limit: 3, sort: 'updated' }),
    queryFn: () =>
      api<Paginated<IssueSummary>>('/issues', { query: { status: 'VERIFIED', limit: 3, sort: 'updated' } }),
  });
  const fixed = data?.items ?? [];
  return (
    <section className="asphalt relative overflow-hidden rounded-b-[2rem] md:mx-4 md:mt-4 md:rounded-[2rem]">
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-14 pt-10 md:grid-cols-[1.25fr_1fr] md:px-10 md:pb-16 md:pt-14">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-lane">
            {cityName} Municipal Corporation
          </p>
          <h1 className="mt-4 text-[2.6rem] font-black leading-[0.95] tracking-[-0.035em] sm:text-6xl">
            Broken road?
            <br />
            Overflowing bin?
            <br />
            <span className="text-lane">Report it in a minute.</span>
          </h1>
          <p className="mt-5 max-w-md text-[1.05rem] text-white/75">
            Take a photo. We pin the location, sort it to the right department, and check whether a neighbour
            already reported it. Then follow it until it is fixed.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/report"
              className="inline-flex h-14 items-center gap-2.5 rounded-2xl bg-lane px-6 font-display text-base font-extrabold text-lane-ink transition hover:brightness-105"
            >
              <Camera className="size-5" strokeWidth={2.5} /> Report an issue
            </Link>
            <Link
              to="/map"
              className="inline-flex h-14 items-center gap-2 rounded-2xl border border-white/25 px-5 font-display font-bold text-white hover:bg-white/10"
            >
              <MapPin className="size-5" /> Issues near me
            </Link>
          </div>
        </div>
        <div className="self-end" aria-label="Recently fixed">
          <p className="sign-label !text-white/60">Recently fixed and verified</p>
          <ul className="mt-3 space-y-2">
            {fixed.length === 0 &&
              [0, 1, 2].map((i) => <li key={i} className="h-16 rounded-2xl bg-white/5" aria-hidden />)}
            {fixed.map((issue, i) => (
              <motion.li
                key={issue.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.12 }}
              >
                <Link
                  to={`/issues/${issue.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3 hover:bg-white/[0.12]"
                >
                  <CircleCheck className="size-6 shrink-0 text-[#4fd1a1]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-bold">{issue.title}</span>
                    <span className="block truncate text-xs text-white/60">
                      {issue.wardName ?? issue.address} · fixed {timeAgo(issue.lastActivityAt)}
                    </span>
                  </span>
                </Link>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
      <LaneLine
        orientation="horizontal"
        state="moving"
        className="absolute bottom-5 left-0 right-0 h-1.5 opacity-80"
      />
    </section>
  );
}

function PendingChecks() {
  const user = useAuth((s) => s.user);
  const { data } = useQuery({
    queryKey: qk.pendingVerifications,
    queryFn: () => api<{ items: PendingVerification[] }>('/me/verifications/pending'),
    enabled: Boolean(user),
  });
  if (!data?.items.length) return null;
  const first = data.items[0]!;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-6 max-w-6xl px-4"
    >
      <Link
        to={`/verify/${first.issue.id}`}
        className="flex items-center gap-4 rounded-2xl border-2 border-lane bg-[#fff8db] p-4 dark:bg-[#2c2610]"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lane text-lane-ink">
          <CircleCheck className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-extrabold">
            {data.items.length === 1
              ? 'An issue you reported was marked fixed'
              : `${data.items.length} issues you reported were marked fixed`}
          </span>
          <span className="block truncate text-sm text-muted">
            Is “{first.issue.title}” really fixed? Your answer decides.
          </span>
        </span>
        <ArrowRight className="size-5 shrink-0" />
      </Link>
    </motion.div>
  );
}

function CityPulse() {
  const { data } = useQuery({
    queryKey: ['stats', 'public'],
    queryFn: () => api<PublicStats>('/stats/public'),
  });
  const tiles = data
    ? [
        { value: data.reportedLast30Days, label: 'issues reported in the last 30 days' },
        { value: data.fixedLast30Days, label: 'fixed in the last 30 days' },
        {
          value: data.duplicatesAvoided,
          label: 'duplicate complaints avoided by joining',
          note: `${pct(data.joinRate)} of reports`,
        },
        { value: data.activeCitizens, label: 'citizens reporting this month' },
      ]
    : [];
  return (
    <section className="mx-auto mt-12 max-w-6xl px-4" aria-labelledby="pulse">
      <h2 id="pulse" className="sign-label">
        City pulse
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line md:grid-cols-4">
        {!data &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-surface p-5">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          ))}
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface p-5">
            <p className="font-display text-4xl font-black tracking-tight">
              <CountUp value={t.value} />
            </p>
            <p className="mt-1 text-sm text-muted">{t.label}</p>
            {t.note && <p className="mt-1 font-mono text-xs text-signal">{t.note}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function NearYou() {
  const { data: config } = useConfig();
  const geo = useGeolocation({ auto: true, targetAccuracy: 200, timeoutMs: 6000 });
  const center = geo.fix ?? (geo.status === 'error' ? config?.city.center : null);
  const { data, isLoading } = useQuery({
    queryKey: qk.nearby({ lat: center?.lat.toFixed(3), lng: center?.lng.toFixed(3) }),
    queryFn: () =>
      api<{ items: IssueSummary[] }>('/issues/nearby', {
        query: { lat: center!.lat, lng: center!.lng, radiusM: 3000, limit: 8 },
      }),
    enabled: Boolean(center),
  });
  return (
    <section className="mx-auto mt-12 max-w-6xl" aria-labelledby="near">
      <div className="flex items-end justify-between px-4">
        <div>
          <h2 id="near" className="text-2xl font-black">
            {geo.fix ? 'Near you' : `Around ${config?.city.name ?? 'the city'}`}
          </h2>
          <p className="text-sm text-muted">
            Support an issue to raise its priority, or add your photo as evidence.
          </p>
        </div>
        <Link to="/map" className="hidden items-center gap-1 text-sm font-bold text-signal sm:inline-flex">
          Open map <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none]">
        {(isLoading || !center) &&
          [0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 w-72 shrink-0 rounded-[var(--radius-card)]" />
          ))}
        {data?.items.map((issue, i) => (
          <motion.div
            key={issue.id}
            className="w-72 shrink-0 snap-start"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: Math.min(i, 4) * 0.06 }}
          >
            <IssueCard issue={issue} />
          </motion.div>
        ))}
        {data && !data.items.length && (
          <p className="px-1 py-8 text-sm text-muted">No reported issues within 3 km. Nice street.</p>
        )}
      </div>
    </section>
  );
}

function Journey() {
  const steps = [
    ['Snap and pin', 'Your photo, GPS location and the address are captured automatically.'],
    [
      'We look for duplicates',
      'If a neighbour already reported it, you join their issue and add weight to it.',
    ],
    [
      'A crew is assigned',
      'Officials prioritise by severity and support, and post photos of the finished work.',
    ],
    [
      'You confirm the fix',
      'Everyone who reported it is asked. If it is not fixed, it goes straight back on the list.',
    ],
  ];
  return (
    <section className="mx-auto mt-14 max-w-6xl px-4" aria-labelledby="journey">
      <h2 id="journey" className="text-2xl font-black">
        From photo to fixed
      </h2>
      <ol className="relative mt-6 grid gap-6 md:grid-cols-4 md:gap-4">
        <LaneLine orientation="vertical" className="absolute bottom-6 left-[1.05rem] top-6 md:hidden" />
        <LaneLine
          orientation="horizontal"
          className="absolute left-6 right-6 top-[1.05rem] hidden md:block"
        />
        {steps.map(([title, body], i) => (
          <li key={title} className="relative flex gap-4 md:flex-col md:gap-3">
            <span className="z-10 grid size-9 shrink-0 place-items-center rounded-full bg-asphalt font-mono text-sm font-bold text-lane ring-4 ring-bg">
              {i + 1}
            </span>
            <div>
              <h3 className="font-extrabold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MyRecent() {
  const user = useAuth((s) => s.user);
  const { data } = useQuery({
    queryKey: qk.myReports('all'),
    queryFn: () => api<Paginated<IssueSummary>>('/me/reports', { query: { type: 'all', limit: 3 } }),
    enabled: Boolean(user),
  });
  if (!data?.items.length) return null;
  return (
    <section className="mx-auto mt-12 max-w-6xl px-4" aria-labelledby="mine">
      <div className="flex items-end justify-between">
        <h2 id="mine" className="text-2xl font-black">
          Your reports
        </h2>
        <Link to="/me" className="text-sm font-bold text-signal">
          See all
        </Link>
      </div>
      <div className="card mt-3 divide-y divide-line p-2">
        {data.items.map((i) => (
          <IssueRow key={i.id} issue={i} />
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { data: config } = useConfig();
  return (
    <>
      <Hero cityName={config?.city.name ?? 'City'} />
      <PendingChecks />
      <MyRecent />
      <NearYou />
      <CityPulse />
      <Journey />
    </>
  );
}
