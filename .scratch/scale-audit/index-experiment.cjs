"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { DatabaseSync } = require("node:sqlite");
const { performance } = require("node:perf_hooks");
const seed = JSON.parse(fs.readFileSync(path.join(__dirname,"seed-50000-wide.jsonl"),"utf8").trim());
const folder = fs.mkdtempSync(path.join(os.tmpdir(),"autopublish-scale-index-experiment-"));
const filename = path.join(folder,"experiment.db");
fs.copyFileSync(path.join(seed.workspace,".autopublish/operations/operations.db"),filename);
const db = new DatabaseSync(filename);
const measured = fs.readFileSync(path.join(__dirname,"article-50000-regular-all.jsonl"),"utf8").trim().split("\n").map(JSON.parse)
  .find(d=>d.event==="measurement" && d.label==="article-one-client-cold");
const sql = Object.keys(measured.queries).find(s=>s.includes("AS success_evidence"));
const ids = Array.from({length:5000},(_,i)=>`article-${i*10}`);
const run = name => {
  const started=performance.now(); const rows=db.prepare(sql).all(...ids);
  console.log(JSON.stringify({name,ms:performance.now()-started,rows:rows.length,
    identityDigest:require('node:crypto').createHash('sha256').update(JSON.stringify(rows)).digest('hex')}));
};
try {
  run("original-query-no-added-index");
  db.exec("CREATE INDEX audit_only_publication_attempts_by_publication ON publication_attempts(publication_id)");
  for(let i=0;i<3;i++)run("experimental-index-"+i);
  console.log(JSON.stringify({name:"experimental-plan",plan:db.prepare("EXPLAIN QUERY PLAN "+sql).all(...ids)}));
} finally {db.close();}
