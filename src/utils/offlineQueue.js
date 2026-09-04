const STORAGE_KEY = 'pendingSales';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full/unavailable — the queued sale just won't survive a page reload.
  }
}

// A checkout that never reached the server (network unreachable, not a
// business rejection) gets parked here and retried later with the same
// idempotency key, so it's safe to replay blindly.
const offlineQueue = {
  enqueue: (saleData) => {
    const queue = readQueue();
    queue.push({ saleData, queuedAt: new Date().toISOString() });
    writeQueue(queue);
  },

  list: () => readQueue(),

  remove: (idempotencyKey) => {
    writeQueue(readQueue().filter((q) => q.saleData.idempotencyKey !== idempotencyKey));
  },
};

export default offlineQueue;
