import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { DuplicateCheckResult } from '@urbanfix/shared';
import { StatusStepper } from '../src/components/ui/StatusStepper';
import { DuplicateReview } from '../src/features/report/DuplicateReview';

// Leaflet needs real layout; the candidate mini-map isn't what these tests are about.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Circle: () => null,
  Polyline: () => null,
}));

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe('StatusStepper', () => {
  it('marks completed steps and the current one', () => {
    render(<StatusStepper status="IN_PROGRESS" />);
    expect(screen.getByRole('list', { name: 'Status: In progress' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('In progress').closest('li')?.getAttribute('aria-current')).toBe('step');
  });

  it('shows a reopened issue on the in-progress step', () => {
    render(<StatusStepper status="REOPENED" />);
    expect(screen.getByText('Reopened')).toBeTruthy();
  });
});

const result: DuplicateCheckResult = {
  radiusM: 50,
  headline: 'There is already an open Garbage issue reported 12 meters away.',
  blocking: true,
  ownRecentIssueId: null,
  candidates: [
    {
      issue: {
        id: 'i1',
        ref: 'UF-000001',
        title: 'Overflowing garbage bin',
        status: 'PENDING',
        priority: 'MEDIUM',
        category: { slug: 'garbage', name: 'Garbage', icon: 'Trash2', color: '#16a34a' },
        lat: 18.52,
        lng: 73.85,
        address: 'FC Road',
        wardName: 'Shivajinagar',
        supportCount: 6,
        reportCount: 2,
        reporterCount: 2,
        coverPhoto: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      },
      score: 0.87,
      level: 'LIKELY',
      reasons: [
        { code: 'SAME_CATEGORY', label: 'Same category: Garbage' },
        { code: 'NEARBY', label: '12 m away' },
      ],
      distanceM: 12,
      headline: 'There is already an open Garbage issue reported 12 meters away.',
      alreadyReported: false,
    },
  ],
};

describe('DuplicateReview', () => {
  it('explains the match and offers join or create', () => {
    const onJoin = vi.fn();
    const onCreateNew = vi.fn();
    wrap(
      <DuplicateReview
        result={result}
        origin={{ lat: 18.52, lng: 73.85 }}
        onJoin={onJoin}
        onCreateNew={onCreateNew}
        joiningId={null}
      />,
    );
    expect(screen.getByText(result.headline!)).toBeTruthy();
    expect(screen.getByText('Likely the same')).toBeTruthy();
    expect(screen.getByText('12 m away')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Join this issue' }));
    expect(onJoin).toHaveBeenCalledWith(result.candidates[0]);
    fireEvent.click(screen.getByRole('button', { name: /create a new issue/ }));
    expect(onCreateNew).toHaveBeenCalled();
  });

  it('points citizens to their own report instead of offering a join', () => {
    const own = { ...result, candidates: [{ ...result.candidates[0]!, alreadyReported: true }] };
    wrap(
      <DuplicateReview
        result={own}
        origin={{ lat: 18.52, lng: 73.85 }}
        onJoin={() => {}}
        onCreateNew={() => {}}
        joiningId={null}
      />,
    );
    expect(screen.getByText(/You reported this/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Join this issue' })).toBeNull();
    expect(screen.queryByRole('button', { name: /create a new issue/ })).toBeNull();
  });
});
