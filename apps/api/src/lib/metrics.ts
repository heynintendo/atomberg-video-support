import { prisma } from '../db';

// Cheap in-process counters. bump() is synchronous, touches only an in-memory
// Map, and never throws into a request path. Values are flushed to the
// MetricCounter table on an interval (and on shutdown) and loaded back on
// startup, so counts survive restarts without adding DB work to hot requests.
const counters = new Map<string, number>();

export function bump(name: string, by = 1): void {
  try {
    counters.set(name, (counters.get(name) ?? 0) + by);
  } catch {
    // never let metrics break the caller
  }
}

export function snapshot(): Record<string, number> {
  return Object.fromEntries([...counters.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export async function loadCounters(): Promise<void> {
  const rows = await prisma.metricCounter.findMany();
  for (const r of rows) if (!counters.has(r.name)) counters.set(r.name, r.value);
}

export async function flushCounters(): Promise<void> {
  for (const [name, value] of counters) {
    await prisma.metricCounter
      .upsert({ where: { name }, update: { value }, create: { name, value } })
      .catch(() => {});
  }
}
