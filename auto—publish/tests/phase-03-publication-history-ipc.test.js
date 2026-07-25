"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");
const { registerPublicationIpc } = require("../desktop/ipc/publication-ipc");

test("production publication history reads committed OperationalStore evidence rather than the JSON ledger", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-history-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const profile = store.createAccountProfile({ platformId: "toutiao", displayName: "fixture" });
    store.reservePublicationTarget({ articleId: "article-1", publicationId: "publication-1", attemptId: "attempt-1", target: { kind: "platform", platformId: "toutiao", accountProfileId: profile.accountProfileId } });
    store.commitRemoteOutcome({ attemptId: "attempt-1", outcome: { status: "published", evidence: { articleId: "article-1", attemptId: "attempt-1", targetKey: `platform:toutiao:account:${profile.accountProfileId}`, accountProfileId: profile.accountProfileId, remoteId: "remote-1" } } });
    const handlers = new Map();
    registerPublicationIpc({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, operationalStore: store });
    const result = await handlers.get("publication:list-for-articles")({}, { clientId: "client-ignored", articleIds: ["article-1"] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.map((item) => [item.publicationId, item.status, item.remoteId]), [["publication-1", "published", "remote-1"]]);
  } finally { store.close(); }
});
