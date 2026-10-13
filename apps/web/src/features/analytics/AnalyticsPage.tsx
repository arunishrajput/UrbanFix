import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AnalyticsOverview,
  CategoryStat,
  DailyPoint,
  HeatPoint,
  ParticipationPoint,
  ResolutionBucket,
  WardStat,
} from '@urbanfix/shared';
import { HeatLayer } from '../../components/map/HeatLayer';
import { MapView } from '../../components/map/MapView';
import { WardLayer } from '../../components/map/WardLayer';
import { CountUp, Segmented, Skeleton } from '../../components/ui/misc';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { hours, pct } from '../../lib/format';
import { qk } from '../../lib/query';
import { useCategories, useConfig, useWards } from '../../lib/reference';
import { ChartCard, DataTable, TooltipBox, axisTick, compact, useChartColors } from './chart-kit';

type Range = '30' | '90' | '180' | '365';

function useAnalytics<T>(name: string, params: Record<string, string | undefined>) {
  return useQuery({
    queryKey: qk.analytics(name, params),
    queryFn: () => api<T>(`/analytics/${name}`, { query: params }),
    placeholderData: keepPreviousData,
  });
}

function Kpis({ data }: { data?: AnalyticsOverview }) {
  const tiles = data
    ? [
        {
          label: 'Issues reported',
          value: <CountUp value={data.totalIssues} />,
          note: `${data.openIssues} still open`,
        },
        {
          label: 'Median time to resolve',
          value: hours(data.medianResolutionHours),
          note: `mean ${hours(data.avgResolutionHours)}`,
        },
        {
          label: 'Resolved within SLA',
          value: pct(data.slaCompliance),
          note: `${data.resolvedIssues} resolved`,
        },
        {
          label: 'Duplicates avoided',
          value: <CountUp value={data.joinedReports} />,
          note: `${pct(data.joinRate)} of reports joined an existing issue`,
        },
        {
          label: 'Citizens participating',
          value: <CountUp value={data.activeCitizens} />,
          note: `${data.totalReports} reports filed`,
        },
        {
          label: 'Reopened after “resolved”',
          value: pct(data.reopenRate),
          note: `${data.verifiedIssues} verified by citizens`,
        },
      ]
    : [];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {!data && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}
      {tiles.map((t) => (
        <div key={t.label} className="card p-4">
          <p className="text-xs font-semibold text-muted">{t.label}</p>
          <p className="mt-1 font-display text-3xl font-black tracking-tight">{t.value}</p>
          <p className="mt-1 text-[0.7rem] text-muted">{t.note}</p>
        </div>
      ))}
    </div>
  );
}

/** Daily for short ranges; weekly (week starting Monday) for longer ones so sparse days don't read as noise. */
function bucket(points: DailyPoint[]): { data: DailyPoint[]; weekly: boolean } {
  if (points.length <= 45) return { data: points, weekly: false };
  const weeks = new Map<string, DailyPoint>();
  for (const p of points) {
    const d = new Date(`${p.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = d.toISOString().slice(0, 10);
    const w = weeks.get(key) ?? { date: key, created: 0, resolved: 0 };
    w.created += p.created;
    w.resolved += p.resolved;
    weeks.set(key, w);
  }
  return { data: [...weeks.values()], weekly: true };
}

function ReportsPerDay({ data: raw }: { data?: DailyPoint[] }) {
  const c = useChartColors();
  if (!raw) return <Skeleton className="h-80" />;
  const { data, weekly } = bucket(raw);
  return (
    <ChartCard
      title={weekly ? 'Reports per week' : 'Reports per day'}
      subtitle="New issues reported vs issues resolved"
      legend={[
        { label: 'Reported', color: c.s1 },
        { label: 'Resolved', color: c.s2 },
      ]}
      table={
        <DataTable
          head={[weekly ? 'Week of' : 'Date', 'Reported', 'Resolved']}
          rows={data.map((d) => [d.date, d.created, d.resolved])}
        />
      }
    >
      <div className="h-72">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tick={axisTick(c.muted)}
              tickFormatter={(d: string) => format(new Date(d), 'd MMM')}
              minTickGap={36}
              axisLine={{ stroke: c.line }}
              tickLine={false}
            />
            <YAxis
              tick={axisTick(c.muted)}
              tickFormatter={compact}
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={
                <TooltipBox
                  formatLabel={(l) =>
                    weekly
                      ? `Week of ${format(new Date(String(l)), 'd MMM yyyy')}`
                      : format(new Date(String(l)), 'EEE d MMM yyyy')
                  }
                />
              }
              cursor={{ stroke: c.muted, strokeWidth: 1 }}
            />
            <Line
              type="linear"
              dataKey="created"
              name="Reported"
              stroke={c.s1}
              strokeWidth={2}
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }}
            />
            <Line
              type="linear"
              dataKey="resolved"
              name="Resolved"
              stroke={c.s2}
              strokeWidth={2}
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function ResolutionTime({ data }: { data?: { buckets: ResolutionBucket[] } }) {
  const c = useChartColors();
  if (!data) return <Skeleton className="h-80" />;
  return (
    <ChartCard
      title="Time to resolve"
      subtitle="Resolved issues by how long they took"
      table={
        <DataTable head={['Time to resolve', 'Issues']} rows={data.buckets.map((b) => [b.label, b.count])} />
      }
    >
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart data={data.buckets} margin={{ top: 20, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="label" tick={axisTick(c.muted)} axisLine={{ stroke: c.line }} tickLine={false} />
            <YAxis tick={axisTick(c.muted)} allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip content={<TooltipBox />} cursor={{ fill: c.grid, opacity: 0.6 }} />
            <Bar dataKey="count" name="Issues" fill={c.s1} radius={[4, 4, 0, 0]} maxBarSize={24}>
              <LabelList dataKey="count" position="top" fill={c.ink} fontSize={11} fontWeight={600} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function Categories({ data }: { data?: CategoryStat[] }) {
  const c = useChartColors();
  if (!data) return <Skeleton className="h-80" />;
  return (
    <ChartCard
      title="Most common issues"
      subtitle="Issues reported per category"
      table={
        <DataTable
          head={['Category', 'Total', 'Open', 'Avg. time to resolve']}
          rows={data.map((d) => [d.name, d.total, d.open, hours(d.avgResolutionHours)])}
        />
      }
    >
      <div style={{ height: Math.max(220, data.length * 34) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: c.ink, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<TooltipBox />} cursor={{ fill: c.grid, opacity: 0.6 }} />
            <Bar dataKey="total" name="Issues" fill={c.s1} radius={[0, 4, 4, 0]} maxBarSize={18}>
              <LabelList dataKey="total" position="right" fill={c.ink} fontSize={11} fontWeight={600} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function Participation({ data }: { data?: ParticipationPoint[] }) {
  const c = useChartColors();
  if (!data) return <Skeleton className="h-80" />;
  return (
    <ChartCard
      title="Citizen participation"
      subtitle="Reports per week: new issues and reports that joined an existing issue"
      legend={[
        { label: 'New issue', color: c.s1 },
        { label: 'Joined existing', color: c.s2 },
      ]}
      table={
        <DataTable
          head={['Week of', 'Active citizens', 'New issues', 'Joined existing', 'Verifications']}
          rows={data.map((d) => [d.week, d.activeReporters, d.newIssues, d.joins, d.verifications])}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="week"
              tick={axisTick(c.muted)}
              tickFormatter={(d: string) => format(new Date(d), 'd MMM')}
              axisLine={{ stroke: c.line }}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis tick={axisTick(c.muted)} allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip
              content={<TooltipBox formatLabel={(l) => `Week of ${format(new Date(String(l)), 'd MMM')}`} />}
              cursor={{ fill: c.grid, opacity: 0.6 }}
            />
            <Bar
              dataKey="newIssues"
              name="New issue"
              stackId="r"
              fill={c.s1}
              stroke={c.surface}
              strokeWidth={2}
              maxBarSize={24}
            />
            <Bar
              dataKey="joins"
              name="Joined existing"
              stackId="r"
              fill={c.s2}
              stroke={c.surface}
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function WardTable({ data }: { data?: WardStat[] }) {
  if (!data) return <Skeleton className="h-80" />;
  const maxTotal = Math.max(1, ...data.map((w) => w.total));
  return (
    <section className="card overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-lg font-black">Ward performance</h2>
        <p className="text-xs text-muted">Volume, speed and quality of resolution per ward</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-surface-2 text-left text-[0.7rem] uppercase tracking-wider text-muted">
            <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:font-display [&>th]:font-extrabold">
              <th>Ward</th>
              <th>Issues</th>
              <th className="text-right">Open</th>
              <th className="text-right">Median time</th>
              <th>Within SLA</th>
              <th className="text-right">Reopened</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.map((w) => (
              <tr key={w.wardId} className="[&>td]:px-4 [&>td]:py-2.5">
                <td className="whitespace-nowrap font-semibold">
                  <span className="font-mono text-xs text-muted">{w.code}</span> {w.name}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-[var(--series-1)]"
                        style={{ width: `${(w.total / maxTotal) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs">{w.total}</span>
                  </div>
                </td>
                <td className="text-right font-mono">{w.open}</td>
                <td className="text-right font-mono">{hours(w.medianResolutionHours)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-[var(--series-2)]"
                        style={{ width: `${(w.slaCompliance ?? 0) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs">{pct(w.slaCompliance)}</span>
                  </div>
                </td>
                <td className="text-right font-mono">{pct(w.reopenRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Heat({ params }: { params: Record<string, string | undefined> }) {
  const { data: config } = useConfig();
  const { data: wards } = useWards();
  const bbox = config
    ? [
        config.city.center.lng - 0.3,
        config.city.center.lat - 0.25,
        config.city.center.lng + 0.3,
        config.city.center.lat + 0.25,
      ]
        .map((n) => n.toFixed(4))
        .join(',')
    : '';
  const { data } = useQuery({
    queryKey: qk.heat({ analytics: true, bbox, ...params }),
    queryFn: () => api<{ points: HeatPoint[] }>('/issues/heatmap', { query: { bbox, ...params } }),
    enabled: Boolean(bbox),
  });
  if (!config) return <Skeleton className="h-96" />;
  return (
    <section className="card overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-lg font-black">Complaint heatmap</h2>
        <p className="text-xs text-muted">Where issues concentrate; intensity grows with community support</p>
      </div>
      <MapView
        center={[config.city.center.lat, config.city.center.lng]}
        zoom={12}
        className="h-96"
        scrollWheelZoom={false}
        label="Heatmap of complaints"
      >
        {wards && <WardLayer wards={wards} />}
        {data && <HeatLayer points={data.points} />}
      </MapView>
    </section>
  );
}

export default function AnalyticsPage() {
  const user = useAuth((s) => s.user);
  const { data: wards } = useWards();
  const { data: categories } = useCategories();
  const [range, setRange] = useState<Range>('90');
  const [wardId, setWardId] = useState('');
  const [category, setCategory] = useState('');
  const params = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(range) * 86_400_000);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      wardId: wardId || undefined,
      category: category || undefined,
    };
  }, [range, wardId, category]);
  const heatParams = { from: params.from, to: params.to, wardId: params.wardId, category: params.category };

  const overview = useAnalytics<AnalyticsOverview>('overview', params);
  const perDay = useAnalytics<{ items: DailyPoint[] }>('reports-per-day', params);
  const resolution = useAnalytics<{ buckets: ResolutionBucket[]; byCategory: CategoryStat[] }>(
    'resolution-time',
    params,
  );
  const cats = useAnalytics<{ items: CategoryStat[] }>('categories', params);
  const wardStats = useAnalytics<{ items: WardStat[] }>('wards', params);
  const participation = useAnalytics<{ items: ParticipationPoint[] }>('participation', params);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sign-label">{user?.wardId && user.role !== 'ADMIN' ? 'Your ward' : 'City-wide'}</p>
          <h1 className="text-3xl font-black">Analytics</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Date range"
            value={range}
            onChange={setRange}
            options={[
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
              { value: '180', label: '6 months' },
              { value: '365', label: '1 year' },
            ]}
          />
          {(user?.role === 'ADMIN' || !user?.wardId) && (
            <select
              aria-label="Ward"
              className="field w-auto"
              value={wardId}
              onChange={(e) => setWardId(e.target.value)}
            >
              <option value="">All wards</option>
              {wards?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Category"
            className="field w-auto"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories?.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Kpis data={overview.data} />
      <ReportsPerDay data={perDay.data?.items} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Categories data={cats.data?.items} />
        <ResolutionTime data={resolution.data} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Participation data={participation.data?.items} />
        <Heat params={heatParams} />
      </div>
      <WardTable data={wardStats.data?.items} />
    </div>
  );
}
