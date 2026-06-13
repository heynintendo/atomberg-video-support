#!/usr/bin/env node
// Captures the seed runtime media-proof artifact for AtomQuest.
//
// It combines two independent server-side sources:
//   1. LiveKit RoomService (via the backend) — the authoritative list of who is
//      present and which tracks each participant publishes (the "up" side).
//   2. LiveKit node Prometheus metrics — forwarded byte/packet counters proving
//      media volume actually traverses the SFU.
//
// Neither source is reported by the browser. Output is written to proof/.
//
// Usage: node scripts/capture-proof.mjs [room]
//   API_URL              default http://localhost:8080
//   LIVEKIT_METRICS_URL  default http://localhost:6789/metrics

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const room = process.argv[2] ?? 'demo-room';
const apiUrl = process.env.API_URL ?? 'http://localhost:8080';
const metricsUrl = process.env.LIVEKIT_METRICS_URL ?? 'http://localhost:6789/metrics';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function selectMetrics(text) {
  const selected = {};
  let totalSeries = 0;
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    totalSeries += 1;
    if (/byte|packet|participant|track|forward|nack|rtp|room/i.test(line)) {
      const sp = line.lastIndexOf(' ');
      if (sp > 0) selected[line.slice(0, sp)] = Number(line.slice(sp + 1));
    }
  }
  return { selected, totalSeries };
}

async function main() {
  const res = await fetch(`${apiUrl}/api/rooms/${encodeURIComponent(room)}/participants`);
  if (!res.ok) throw new Error(`participants request failed (${res.status})`);
  const serverView = await res.json();

  let livekitMetrics = { source: metricsUrl };
  try {
    const m = await fetch(metricsUrl);
    livekitMetrics = m.ok
      ? { source: metricsUrl, ...selectMetrics(await m.text()) }
      : { source: metricsUrl, error: `HTTP ${m.status}` };
  } catch (err) {
    livekitMetrics = { source: metricsUrl, error: String(err) };
  }

  // Derive the subscription fan-out ("down" side): under autoSubscribe each
  // participant receives every other participant's published tracks via the SFU.
  const subscriptionFanout = serverView.participants.map((p) => ({
    identity: p.identity,
    up: p.publishedTracks.length,
    downFrom: serverView.participants
      .filter((o) => o.sid !== p.sid)
      .flatMap((o) => o.publishedTracks.map((t) => ({ from: o.identity, source: t.source, kind: t.kind }))),
  }));

  const capturedAt = new Date().toISOString();
  const artifact = {
    artifact: 'atomquest-runtime-media-proof',
    phase: 1,
    scope: 'localhost',
    capturedAt,
    room,
    serverView,
    subscriptionFanout,
    livekitMetrics,
    note:
      'serverView is LiveKit RoomService (authoritative). publishedTracks = up side. ' +
      'subscriptionFanout.downFrom = tracks the SFU forwards to each participant (down side). ' +
      'livekitMetrics are node-level counters proving media bytes traverse the server.',
  };

  const outDir = join(repoRoot, 'proof');
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `phase1-localhost-${room}-${capturedAt.replace(/[:.]/g, '-')}.json`);
  await writeFile(outPath, JSON.stringify(artifact, null, 2));

  console.log(`room "${room}" — participants: ${serverView.numParticipants}`);
  for (const p of serverView.participants) {
    const up = p.publishedTracks.map((t) => `${t.source}/${t.kind}`).join(',') || 'none';
    console.log(`  ${p.identity} [${p.state}] up=${up}`);
  }
  if (livekitMetrics.selected) {
    console.log(`livekit metric series captured: ${Object.keys(livekitMetrics.selected).length}`);
  } else if (livekitMetrics.error) {
    console.log(`livekit metrics: ${livekitMetrics.error}`);
  }
  console.log(`written: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
