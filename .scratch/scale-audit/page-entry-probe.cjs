// Synthetic, local-only customer directory benchmark. Run from repository root.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { createAiContentService } = require('../../auto—publish/desktop/services/ai-content-service');

(async () => {
  const counts = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [10, 50, 100];
  if (counts.some(count => !Number.isInteger(count) || count < 1 || count > 1000)) throw new Error('Customer count must be 1..1000');
  for (const count of counts) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'page-scale-'));
    try {
      for (let i = 0; i < count; i++) {
        const dir = path.join(root, 'clients', 'c' + i);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'client.json'), JSON.stringify({ id: 'c' + i, name: 'Synthetic ' + i }));
        fs.writeFileSync(path.join(dir, 'facts.md'), 'x'.repeat(16384));
      }
      const service = createAiContentService({ workspaceRoot: root });
      let reads = 0;
      let bytes = 0;
      const original = fs.readFileSync;
      fs.readFileSync = function (...args) {
        const data = original.apply(this, args);
        reads++;
        bytes += Buffer.byteLength(data);
        return data;
      };
      const start = performance.now();
      try {
        const result = await service.listClients();
        console.log(JSON.stringify({ clients: count, returned: result.length, ms: Math.round(performance.now() - start), reads, MiB: Number((bytes / 1048576).toFixed(2)) }));
      } finally {
        fs.readFileSync = original;
        service.dispose();
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
