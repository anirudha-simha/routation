import type { RouteMode, RouteStatus, SolverEngineId } from "../core";

const METERS_PER_MILE = 1609.344;

export function formatMiles(meters: number): string {
  return (meters / METERS_PER_MILE).toFixed(1);
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1 && seconds > 0) return "<1 min";
  if (mins < 60) return `~${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `~${hrs}h ${remMins}m` : `~${hrs}h`;
}

export const MODE_OPTIONS: { value: RouteMode; label: string; hint: string }[] =
  [
    {
      value: "ROUND_TRIP_FASTEST",
      label: "Round-Trip: Fastest (Any Direction)",
      hint: "Starts and ends at Home using whichever loop direction the solver finds fastest overall.",
    },
    {
      value: "ROUND_TRIP_END_CLOSEST_TO_HOME",
      label: "Round-Trip: End Closest to Home (Inbound)",
      hint: "Starts and ends at Home. Drives out to your farthest stop first and sweeps progressively back toward Home.",
    },
    {
      value: "ROUND_TRIP_START_CLOSEST_TO_HOME",
      label: "Round-Trip: Start Closest to Home (Outbound)",
      hint: "Starts and ends at Home. Hits your nearest stop first and works outward before returning Home.",
    },
    {
      value: "OPEN_END_START_AT_HOME",
      label: "One-Way: Start at Home → Best Last Stop",
      hint: "One-way outbound sweep: departs from Home and finishes at whichever final stop is optimal (no return leg).",
    },
    {
      value: "OPEN_START_END_AT_HOME",
      label: "One-Way: Best First Stop → End at Home",
      hint: "One-way inbound sweep: starts at the best outer stop in the field and finishes at Home.",
    },
  ];

export interface SolverOptionMeta {
  id: SolverEngineId;
  title: string;
  badge: string;
  hint: string;
}

export const SOLVER_OPTIONS: SolverOptionMeta[] = [
  {
    id: "osrm-trip",
    title: "OSRM Server",
    badge: "Simplest • Keyless",
    hint: "Delegates TSP solving and road-polyline generation to OSRM's /trip API in a single request, then rotates or cuts the loop at Home.",
  },
  {
    id: "no-solver",
    title: "No Solver",
    badge: "As-Is Order • Instant",
    hint: "Keeps your current stop order as-is without reordering, and connects the pins directly on the map.",
  },
  {
    id: "ts-local",
    title: "Local Solver",
    badge: "In-Browser • Keyless",
    hint: "Runs Held-Karp exact DP (≤ 15 stops) + 2-Opt/Or-Opt local search directly in your browser using either OSRM /table road weights or offline Haversine distances.",
  },
  {
    id: "byok-api",
    title: "BYOK API",
    badge: "API Key",
    hint: "Bring your own commercial routing API key (stored only in your browser) for live traffic or provider-specific matrix optimization.",
  },
];

export const BUTTON_LABELS: Record<RouteStatus, string> = {
  unoptimized: "Optimize Route",
  optimizing: "Optimizing Route...",
  optimized: "Optimize Route",
  stale: "Re-Optimize Route (Changes Pending)",
};

export const STATUS_META: Record<
  RouteStatus,
  { label: string; dotClass: string }
> = {
  unoptimized: {
    label: "Draft Pins (Unoptimized)",
    dotClass: "bg-slate-400",
  },
  optimizing: {
    label: "Optimizing...",
    dotClass: "bg-blue-400 animate-pulse",
  },
  optimized: {
    label: "Optimized Route",
    dotClass: "bg-emerald-400",
  },
  stale: {
    label: "Route Out of Date",
    dotClass: "bg-amber-400",
  },
};
