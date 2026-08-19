const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createPublicationLinkService,
} = require("../desktop/services/publication-link-service");

function serviceFor(record, opened) {
  return createPublicationLinkService({
    operationalStore: {
      listPublicationRecords(input) {
        assert.deepEqual(input, { publicationIds: ["publication-1"] });
        return record ? [record] : [];
      },
    },
    openExternal: async (url) => opened.push(url),
  });
}

test("publication link service opens only the URL persisted for the publication id", async () => {
  const opened = [];
  const service = serviceFor(
    {
      publicationId: "publication-1",
      attempts: [
        {
          attemptId: "attempt-1",
          remoteUrl: "https://publisher.example/article/1?ref=archive",
        },
      ],
    },
    opened,
  );

  const result = await service.openPublicationUrl({
    publicationId: "publication-1",
  });

  assert.deepEqual(result, { completed: true });
  assert.deepEqual(opened, [
    "https://publisher.example/article/1?ref=archive",
  ]);
});

test("publication link service rejects unsafe persisted URLs instead of forwarding them", async () => {
  for (const remoteUrl of [
    "http://publisher.example/article/1",
    "https://user:pass@publisher.example/article/1",
    "https://publisher.example/article/1#fragment",
    "https://publisher.example/article/1?token=secret",
  ]) {
    const opened = [];
    const service = serviceFor(
      {
        publicationId: "publication-1",
        attempts: [{ attemptId: "attempt-1", remoteUrl }],
      },
      opened,
    );
    await assert.rejects(
      () => service.openPublicationUrl({ publicationId: "publication-1" }),
      { code: "PUBLICATION_LINK_URL_UNAVAILABLE" },
    );
    assert.deepEqual(opened, []);
  }
});

test("publication link service fails closed for missing records and invalid ids", async () => {
  const opened = [];
  const service = serviceFor(null, opened);
  await assert.rejects(
    () => service.openPublicationUrl({ publicationId: "publication-1" }),
    { code: "PUBLICATION_LINK_NOT_FOUND" },
  );
  await assert.rejects(
    () => service.openPublicationUrl({ publicationId: "../publication" }),
    { code: "PUBLICATION_LINK_INPUT_INVALID" },
  );
  assert.deepEqual(opened, []);
});
