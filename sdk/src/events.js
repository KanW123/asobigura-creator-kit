import { sendRequest } from './messaging.js';

let eventBuffer = [];
let flushTimer = null;
const BATCH_INTERVAL = 500;

export function reportEvent(eventName, data = {}) {
  eventBuffer.push({
    event: eventName,
    data,
    timestamp: Date.now(),
  });

  if (!flushTimer) {
    flushTimer = setTimeout(flushEvents, BATCH_INTERVAL);
  }
}

async function flushEvents() {
  flushTimer = null;
  if (eventBuffer.length === 0) return;

  const batch = eventBuffer;
  eventBuffer = [];

  try {
    await sendRequest('events.batch', { events: batch });
  } catch {
    // Fire-and-forget: silently drop failed event batches
  }
}

export function destroy() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushEvents();
}
