class BoundedWindowLimiter {
  constructor(options) {
    const opts = options || {};
    this.name = typeof opts.name === "string" && opts.name ? opts.name : "limiter";
    this.capacity = positiveInteger(opts.capacity ?? opts.maxEntries ?? opts.maxKeys, 4096);
    this.windowMs = positiveNumber(opts.windowMs, 60 * 1000);
    this.ttlMs = positiveNumber(opts.ttlMs, this.windowMs);
    this.maxAttempts = positiveInteger(opts.maxAttempts, 12);
    this.now = typeof opts.now === "function" ? opts.now : () => Date.now();
    this.entries = new Map();
    this.expiryHeap = [];
    this.sequence = 0;
    this.expired = 0;
    this.evictions = 0;
    this.hits = 0;
    this.misses = 0;
    this.limited = 0;
  }

  consume(key, cost) {
    const normalizedKey = normalizeKey(key);
    const amount = positiveInteger(cost, 1);
    const now = this.now();
    this.cleanup(now);
    let entry = this.entries.get(normalizedKey);
    if (entry && entry.expiresAt <= now) {
      this._delete(normalizedKey, "expired");
      entry = null;
    }

    if (!entry) {
      this.misses += 1;
      this._makeRoom();
      entry = {
        count: Math.min(this.maxAttempts + 1, amount),
        createdAt: now,
        lastAccessAt: now,
        expiresAt: now + this.ttlMs,
        expiryVersion: ++this.sequence,
        version: this.sequence,
      };
      this.entries.set(normalizedKey, entry);
      this._pushExpiry(normalizedKey, entry);
    } else {
      this.hits += 1;
      entry.count = Math.min(this.maxAttempts + 1, entry.count + amount);
      entry.lastAccessAt = now;
      entry.version = ++this.sequence;
      this.entries.delete(normalizedKey);
      this.entries.set(normalizedKey, entry);
    }

    const allowed = entry.count <= this.maxAttempts;
    if (!allowed) this.limited += 1;
    return {
      allowed,
      count: entry.count,
      remaining: Math.max(0, this.maxAttempts - entry.count),
      retryAfterMs: Math.max(0, entry.expiresAt - now),
      key: normalizedKey,
      version: entry.version,
    };
  }

  clear(key, version) {
    const normalizedKey = normalizeKey(key);
    const entry = this.entries.get(normalizedKey);
    if (!entry) return false;
    if (version !== undefined && entry.version !== version) return false;
    this.entries.delete(normalizedKey);
    this._compactExpiryHeap();
    return true;
  }

  clearAll() {
    const count = this.entries.size;
    this.entries.clear();
    this.expiryHeap = [];
    return count;
  }

  cleanup(now) {
    const current = now === undefined ? this.now() : now;
    while (this.expiryHeap.length) {
      const item = this.expiryHeap[0];
      if (item.expiresAt > current) break;
      this._popExpiry();
      const entry = this.entries.get(item.key);
      if (entry && entry.expiryVersion === item.version && entry.expiresAt <= current) this._delete(item.key, "expired");
    }
    return this.entries.size;
  }

  get size() {
    this.cleanup();
    return this.entries.size;
  }

  getStats() {
    this.cleanup();
    return {
      name: this.name,
      entries: this.entries.size,
      expiryEntries: this.expiryHeap.length,
      capacity: this.capacity,
      windowMs: this.windowMs,
      ttlMs: this.ttlMs,
      maxAttempts: this.maxAttempts,
      expired: this.expired,
      evictions: this.evictions,
      hits: this.hits,
      misses: this.misses,
      limited: this.limited,
    };
  }

  _makeRoom() {
    while (this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this._delete(oldest, "evicted");
    }
    this._compactExpiryHeap();
  }

  _compactExpiryHeap() {
    if (this.expiryHeap.length <= this.entries.size * 2 + 32) return;
    this.expiryHeap = [];
    for (const [key, entry] of this.entries) this._pushExpiry(key, entry);
  }

  _delete(key, reason) {
    if (!this.entries.delete(key)) return false;
    if (reason === "expired") this.expired += 1;
    if (reason === "evicted") this.evictions += 1;
    return true;
  }

  _pushExpiry(key, entry) {
    this.expiryHeap.push({ key, expiresAt: entry.expiresAt, version: entry.expiryVersion });
    let index = this.expiryHeap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.expiryHeap[parent].expiresAt <= this.expiryHeap[index].expiresAt) break;
      [this.expiryHeap[parent], this.expiryHeap[index]] = [this.expiryHeap[index], this.expiryHeap[parent]];
      index = parent;
    }
  }

  _popExpiry() {
    const last = this.expiryHeap.pop();
    if (!this.expiryHeap.length || !last) return;
    this.expiryHeap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.expiryHeap.length && this.expiryHeap[left].expiresAt < this.expiryHeap[smallest].expiresAt) smallest = left;
      if (right < this.expiryHeap.length && this.expiryHeap[right].expiresAt < this.expiryHeap[smallest].expiresAt) smallest = right;
      if (smallest === index) break;
      [this.expiryHeap[index], this.expiryHeap[smallest]] = [this.expiryHeap[smallest], this.expiryHeap[index]];
      index = smallest;
    }
  }
}

function normalizeKey(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) throw new TypeError("BoundedWindowLimiter key must be a non-empty string of at most 256 characters");
  return value;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

module.exports = { BoundedWindowLimiter, BoundedLimiter: BoundedWindowLimiter };
