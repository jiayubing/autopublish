"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  runContinuousKnowledge,
  replayContinuousKnowledge,
} = require("../src/content/continuous-knowledge-run");

const root = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "continuous-test-"));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const source = "星河眼镜提供配镜服务。店员耐心，价格清楚。";
const input = () => ({
  clientName: "星河眼镜",
  clientId: "synthetic-star-optical",
  materials: [{ name: "客户资料.txt", content: source, status: "ready" }],
  strategy: {
    global: "保持客观",
    clientPersistent: "重视学生",
    runTemporary: "本次研究",
  },
  knowledgePrompt: "按照九板块写作；资料不足则省略。",
});
const limits = {
  maxPromptCharacters: 300000,
  analysisOutputTokens: 6000,
  finalOutputTokens: 12000,
};
const item = (text, provenance, refs) => ({ text, provenance, refs });

function fakeClient({
  search = false,
  finalError = null,
  beforeFinal = null,
  finalResponse = null,
  inventedExpertise = false,
  materialText = source,
  genericCompetition = false,
} = {}) {
  const calls = [];
  const client = {
    async request(request) {
      const contextText = request.prompt.split("[RUN_CONTEXT]\n")[1];
      const context = contextText ? JSON.parse(contextText) : null;
      calls.push({ request, context });
      if (!context) {
        if (finalError) throw finalError;
        if (beforeFinal) beforeFinal();
        const supplied = JSON.parse(request.prompt.split("[INPUT]\n")[1]);
        assert.equal(request.search, false);
        assert.equal(supplied.materials[0].text, materialText);
        assert.deepEqual(Object.keys(supplied.stages), [
          "customerUnderstanding",
          "customerCharacteristics",
          "coreAdvantages",
          "eeaapAnalysis",
          "competitionAndGaps",
        ]);
        assert.equal(supplied.strategy.runTemporary, "本次研究");
        const answer = {
          webEvidence: [],
          summary: {
            text: "星河眼镜提供配镜服务。",
            inputRefs: ["R1a-businessUnderstanding-1"],
          },
          sections: [
            {
              key: "products_services",
              items: [
                {
                  text: "星河眼镜提供配镜服务。",
                  kind: "direct",
                  inputRefs: ["R1a-businessUnderstanding-1"],
                },
              ],
            },
          ],
          realCases: [],
          customerReviews: [],
          recommendationAngles: [],
          geoThemes: [
            {
              name: "配镜",
              questionRefs: [
                "R5a-geoQuestions-1",
                "R5a-geoQuestions-2",
                "R5a-geoQuestions-3",
              ],
            },
          ],
          missingInformation: [],
          cautions: [],
        };
        return {
          text: finalResponse ? finalResponse(answer) : JSON.stringify(answer),
          citations: [],
        };
      }
      if (context.mode === "search") {
        assert.equal(request.search, true);
        assert.equal(request.allowUncitedSearchResponse, true);
        return {
          text: JSON.stringify({ findings: [], unresolved: [] }),
          citations: [],
        };
      }
      assert.equal(request.search, false);
      const fields = Object.keys(request.jsonSchema.properties).filter(
        (key) => key !== "researchNeed",
      );
      const answer = Object.fromEntries(fields.map((field) => [field, []]));
      const ref =
        context.stage === 0
          ? "M1"
          : context.stage === 1
            ? "R1a-businessUnderstanding-1"
            : context.stage === 2
              ? "R2a-customerCharacteristics-1"
              : "R3a-coreAdvantages-1";
      if (context.stage === 0) {
        answer.businessUnderstanding = [
          item("星河眼镜提供配镜服务。", "client_input", ["M1"]),
        ];
        answer.productsAndServices = [
          item("提供配镜服务。", "client_input", ["M1"]),
        ];
      }
      if (context.stage === 1)
        answer.customerCharacteristics = [
          item(
            inventedExpertise
              ? "星河眼镜有专家团队。"
              : "配镜服务可供学生考虑。",
            "derived",
            [ref],
          ),
        ];
      if (context.stage === 2)
        answer.coreAdvantages = [
          item("就近配镜可减少路程。", "derived", [ref]),
        ];
      if (context.stage === 3) {
        answer.experience = [item("实际体验资料有限。", "derived", [ref])];
        answer.expertise = [item("专业能力资料有限。", "derived", [ref])];
        answer.authority = [item("权威依据资料有限。", "derived", [ref])];
        answer.accuracy = [item("准确性资料有限。", "derived", [ref])];
        answer.purpose = [item("内容目的应帮助用户选择。", "derived", [ref])];
      }
      if (context.stage === 4) {
        if (genericCompetition) {
          answer.competitionContext = [
            item("普通门店多、行业竞争性强", "client_input", ["M1"]),
          ];
          answer.differentiation = [
            item("客户可以根据自身需求比较服务。", "derived", [
              "R5a-competitionContext-1",
            ]),
          ];
        }
        answer.contentGaps = [
          item("缺少竞争证据。", "derived", ["R4a-experience-1"]),
        ];
        answer.geoQuestions = [
          item("附近哪里可以配镜？", "derived", [
            "R1a-businessUnderstanding-1",
          ]),
          item("学生配镜如何选择？", "derived", [
            "R1a-businessUnderstanding-1",
          ]),
          item("配镜服务包含什么？", "derived", [
            "R1a-businessUnderstanding-1",
          ]),
        ];
      }
      answer.researchNeed =
        search && context.stage < 3 && context.mode === "analysis"
          ? {
              needed: true,
              scope: context.stage === 0 ? "entity" : "decision_context",
              query: "合成检索" + context.stage,
              reason: "缺口",
            }
          : { needed: false, scope: "", query: "", reason: "" };
      return { text: JSON.stringify(answer), citations: [] };
    },
  };
  return { client, calls };
}

test("one run passes all five analyses into a single offline knowledge request", async () => {
  const { client, calls } = fakeClient();
  const result = await runContinuousKnowledge({ artifactRoot: root,
    input: input(),
    client,
    limits,
  });
  assert.equal(calls.length, 10); // Missing public identity: one bounded search and one supplemental analysis.
  assert.equal(calls.filter((call) => !call.context).length, 1);
  assert.match(calls.at(-1).request.prompt, /R5 没有可采纳的具体竞对证据/);
  assert.match(
    calls.at(-1).request.prompt,
    /正文板块可以综合引用任一已完成阶段的有效条目及原材料/,
  );
  assert.match(calls.at(-1).request.prompt, /600—1000个非空白Unicode字符/);
  assert.equal(result.budget.count, 10);
  assert.equal(result.knowledge.quality.status, "draft");
  assert.equal(result.knowledge.quality.sectionLengths.products_services, 11);
  assert.ok(
    fs.existsSync(path.join(result.directory, "customer-knowledge.json")),
  );
  assert.ok(
    fs.existsSync(path.join(result.directory, "customer-knowledge.md")),
  );
  assert.ok(!fs.existsSync(path.join(result.directory, "final-research.json")));
});

test("themes with one or two valid questions retain the full draft without another model call", async () => {
  for (const count of [1, 2]) {
    const { client, calls } = fakeClient({ finalResponse(answer) {
      answer.geoThemes[0].questionRefs = answer.geoThemes[0].questionRefs.slice(0, count);
      return JSON.stringify(answer);
    } });
    const result = await runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits });
    assert.equal(result.knowledge.geoThemes[0].questionRefs.length, count);
    assert.match(result.markdown || fs.readFileSync(path.join(result.directory, "customer-knowledge.md"), "utf8"), /星河眼镜提供配镜服务/);
    assert.equal(calls.length, 10);
    assert.equal(calls.filter(call => !call.context).length, 1);
  }
});

test("empty and invented theme questions still fail without a model retry", async () => {
  for (const refs of [[], ["invented-question"]]) {
    const { client, calls } = fakeClient({ finalResponse(answer) {
      answer.geoThemes[0].questionRefs = refs;
      return JSON.stringify(answer);
    } });
    await assert.rejects(runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits }));
    assert.equal(calls.filter(call => !call.context).length, 1);
  }
});

test("a generic client industry statement cannot become specific competition evidence", async () => {
  const value = input();
  value.materials[0].content += "普通门店多、行业竞争性强。";
  const { client, calls } = fakeClient({
    materialText: value.materials[0].content,
    genericCompetition: true,
  });
  const result = await runContinuousKnowledge({ artifactRoot: root, input: value, client, limits });
  assert.deepEqual(result.stages.competitionAndGaps.competitionContext, []);
  assert.deepEqual(result.stages.competitionAndGaps.differentiation, []);
  assert.ok(
    result.knowledge.unresolved.some(
      (entry) =>
        entry.reason === "competition_context_requires_specific_evidence",
    ),
  );
  const finalInput = JSON.parse(
    calls.at(-1).request.prompt.split("[INPUT]\n")[1],
  );
  assert.deepEqual(finalInput.research.competitionContext, []);
  assert.match(calls.at(-1).request.prompt, /R5 没有可采纳的具体竞对证据/);
});

test("three searches stay within twelve requests and preserve stage order", async () => {
  const { client, calls } = fakeClient({ search: true });
  const result = await runContinuousKnowledge({ artifactRoot: root,
    input: input(),
    client,
    limits,
  });
  assert.equal(calls.length, 12);
  assert.equal(result.searches, 3);
  assert.deepEqual(
    result.ledger
      .filter((entry) => entry.mode === "analysis")
      .map((entry) => entry.stage),
    ["R1", "R2", "R3", "R4", "R5"],
  );
  assert.equal(result.ledger.at(-1).stage, "K");
});

test("a supported long section can meet the target while unsupported sections stay omitted", async () => {
  const paragraph = "星河眼镜提供配镜服务。".repeat(60);
  const { client } = fakeClient({
    finalResponse: (answer) => {
      answer.sections[0].items[0] = {
        text: paragraph,
        kind: "derived",
        inputRefs: ["R1a-businessUnderstanding-1"],
      };
      return JSON.stringify(answer);
    },
  });
  const result = await runContinuousKnowledge({ artifactRoot: root,
    input: input(),
    client,
    limits,
  });
  assert.equal(result.knowledge.quality.status, "complete");
  assert.equal(result.knowledge.quality.sectionLengths.products_services, 660);
  assert.ok(
    result.knowledge.quality.omittedSections.includes("customerReviews"),
  );
});

test("the default prompt and saved quality use a 600 character minimum", async () => {
  for (const [length, status] of [
    [599, "draft"],
    [600, "complete"],
  ]) {
    const value = input();
    value.knowledgePrompt = "";
    const { client, calls } = fakeClient({
      finalResponse: (answer) => {
        answer.sections[0].items[0] = {
          text: "星河眼镜提供配镜服务。".repeat(60).slice(0, length),
          kind: "derived",
          inputRefs: ["R1a-businessUnderstanding-1"],
        };
        return JSON.stringify(answer);
      },
    });
    const result = await runContinuousKnowledge({ artifactRoot: root,
      input: value,
      client,
      limits,
    });
    assert.match(calls.at(-1).request.prompt, /600—1000字为参考/);
    const saved = JSON.parse(
      fs.readFileSync(
        path.join(result.directory, "customer-knowledge.json"),
        "utf8",
      ),
    );
    assert.deepEqual(saved.quality.targetCharacters, [600, 1000]);
    assert.equal(saved.quality.sectionLengths.products_services, length);
    assert.equal(saved.quality.status, status);
    assert.equal(
      saved.quality.shortSections.includes("products_services"),
      length < 600,
    );
  }
});

test("an overlong continuous paragraph is delivered in full with a draft length warning", async () => {
  const paragraph = "星河眼镜提供配镜服务。".repeat(100).slice(0, 1001);
  const { client, calls } = fakeClient({
    finalResponse: (answer) => {
      answer.sections[0].items[0] = {
        text: paragraph,
        kind: "derived",
        inputRefs: ["R1a-businessUnderstanding-1"],
      };
      return JSON.stringify(answer);
    },
  });
  const result = await runContinuousKnowledge({ artifactRoot: root,
    input: input(),
    client,
    limits,
  });
  assert.equal(result.knowledge.quality.status, "draft");
  assert.deepEqual(result.knowledge.quality.overlongSections, [
    "products_services",
  ]);
  assert.equal(result.knowledge.quality.sectionLengths.products_services, 1001);
  assert.ok(
    fs
      .readFileSync(
        path.join(result.directory, "customer-knowledge.md"),
        "utf8",
      )
      .includes(paragraph),
  );
  assert.ok(
    fs
      .readFileSync(
        path.join(result.directory, "customer-knowledge-model-draft.md"),
        "utf8",
      )
      .includes(paragraph),
  );
  assert.equal(calls.filter((call) => !call.context).length, 1);
});

test("an invalid very long response still leaves its full unverified model draft", async () => {
  const paragraph = "星河眼镜提供配镜服务。".repeat(300).slice(0, 3001);
  const { client, calls } = fakeClient({
    finalResponse: (answer) => {
      answer.sections[0].items[0] = {
        text: paragraph,
        kind: "derived",
        inputRefs: ["R1a-businessUnderstanding-1"],
      };
      return JSON.stringify(answer);
    },
  });
  let failure;
  try {
    await runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, "KNOWLEDGE_OUTPUT_INVALID");
  const markdown = fs.readFileSync(
    path.join(failure.directory, "customer-knowledge-model-draft.md"),
    "utf8",
  );
  assert.ok(markdown.includes(paragraph));
  assert.match(markdown, /不作为正式知识库/);
  assert.equal(calls.filter((call) => !call.context).length, 1);
  assert.equal(
    fs.existsSync(path.join(failure.directory, "customer-knowledge.json")),
    false,
  );
});

test("readable material can reach final writing when the understanding entries were all rejected", async () => {
  const { client: synthetic, calls } = fakeClient({
    finalResponse: (answer) => {
      answer.summary.inputRefs = ["M1"];
      answer.sections[0].items[0].kind = "derived";
      answer.sections[0].items[0].inputRefs = ["M1"];
      answer.geoThemes = [];
      return JSON.stringify(answer);
    },
  });
  const client = {
    async request(request) {
      const response = await synthetic.request(request);
      const contextText = request.prompt.split("[RUN_CONTEXT]\n")[1];
      if (
        contextText &&
        JSON.parse(contextText).stage === 0 &&
        JSON.parse(contextText).mode !== "search"
      ) {
        const answer = JSON.parse(response.text);
        answer.businessUnderstanding = [];
        answer.productsAndServices = [];
        return { ...response, text: JSON.stringify(answer) };
      }
      return response;
    },
  };
  const result = await runContinuousKnowledge({ artifactRoot: root,
    input: input(),
    client,
    limits,
  });
  assert.deepEqual(
    result.stages.customerUnderstanding.businessUnderstanding,
    [],
  );
  assert.deepEqual(result.stages.customerUnderstanding.productsAndServices, []);
  const finalInput = JSON.parse(
    calls.at(-1).request.prompt.split("[INPUT]\n")[1],
  );
  assert.equal(finalInput.summaryEvidence.id, "M1");
  assert.equal(finalInput.materials[0].text, source);
  assert.deepEqual(result.knowledge.client.summary.inputRefs, ["M1"]);
  assert.equal(calls.filter((call) => !call.context).length, 1);
  assert.ok(
    fs.existsSync(path.join(result.directory, "customer-knowledge.md")),
  );
});

test("a partially unreadable material is named in the local result and marks input incomplete", async () => {
  const value = input();
  value.materials.push({
    name: "无法读取.doc",
    status: "error",
    content: "",
    error: { code: "MATERIAL_DOC_ENCRYPTED" },
  });
  const { client } = fakeClient();
  const result = await runContinuousKnowledge({ artifactRoot: root, input: value, client, limits });
  assert.equal(result.knowledge.quality.inputComplete, false);
  assert.deepEqual(result.knowledge.quality.excludedMaterials, [
    { material: "无法读取.doc", code: "MATERIAL_DOC_ENCRYPTED" },
  ]);
  assert.equal(result.knowledge.quality.status, "draft");
});

test("same run identity cannot send a second request", async () => {
  const { client, calls } = fakeClient();
  const runId = randomUUID();
  await runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits, runId });
  await assert.rejects(
    runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits, runId }),
    { code: "EEXIST" },
  );
  assert.equal(calls.length, 10);
});

test("concurrent runs for the same client cannot both dispatch", async () => {
  const { client, calls } = fakeClient();
  let release;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const guarded = {
    request: async (request) => {
      if (calls.length === 0) {
        entered();
        await gate;
      }
      return client.request(request);
    },
  };
  const first = runContinuousKnowledge({ artifactRoot: root,
    input: input(),
    client: guarded,
    limits,
  });
  await started;
  await assert.rejects(
    runContinuousKnowledge({ artifactRoot: root, input: input(), client: guarded, limits }),
    { code: "EEXIST" },
  );
  release();
  await first;
  assert.equal(calls.length, 10);
});

test("capacity refusal happens before dispatch and keeps the run for inspection", async () => {
  const { client, calls } = fakeClient();
  let failure;
  try {
    await runContinuousKnowledge({ artifactRoot: root,
      input: input(),
      client,
      limits: { ...limits, maxPromptCharacters: 1000 },
    });
  } catch (cause) {
    failure = cause;
  }
  assert.equal(failure.code, "RESEARCH_CONTEXT_LIMIT_EXCEEDED");
  assert.equal(calls.length, 0);
  assert.ok(fs.existsSync(path.join(failure.directory, "run-report.md")));
});

test("uncertain final request is recorded and never retried", async () => {
  const { client, calls } = fakeClient({
    finalError: new Error("socket closed"),
  });
  let failure;
  try {
    await runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits });
  } catch (cause) {
    failure = cause;
  }
  assert.equal(failure.code, "GEO_REQUEST_UNCERTAIN");
  assert.equal(calls.filter((call) => !call.context).length, 1);
  const outcome = JSON.parse(
    fs.readFileSync(path.join(failure.directory, "request-10-outcome.json")),
  );
  assert.equal(outcome.outcome, "uncertain");
  assert.ok(
    !fs.existsSync(path.join(failure.directory, "customer-knowledge.json")),
  );
});

test("an incomplete R4 response retains its safe reason and stops before R5 or K", async () => {
  const { createDoubaoGeoClient } = require("../src/content/doubao-geo-client");
  const { client: synthetic, calls } = fakeClient();
  let incompleteCalls = 0;
  const transport = createDoubaoGeoClient({
    getConfig: () => ({
      apiKey: "synthetic",
      model: "synthetic-model",
      baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
    }),
    fetch: async () => {
      incompleteCalls++;
      return {
        ok: true,
        json: async () => ({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
        }),
      };
    },
  });
  const client = {
    request(request) {
      const context = JSON.parse(request.prompt.split("[RUN_CONTEXT]\n")[1]);
      return context.stage === 3
        ? transport.request(request)
        : synthetic.request(request);
    },
  };
  let failure;
  try {
    await runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits });
  } catch (cause) {
    failure = cause;
  }
  assert.equal(failure.code, "GEO_RESPONSE_INCOMPLETE");
  assert.equal(incompleteCalls, 1);
  assert.equal(
    calls.some((call) => !call.context || call.context.stage >= 3),
    false,
  );
  const outcome = JSON.parse(
    fs.readFileSync(path.join(failure.directory, "request-8-outcome.json")),
  );
  assert.equal(outcome.outcome, "confirmed_response_unusable");
  assert.equal(outcome.incompleteReason, "max_output_tokens");
  assert.equal(
    fs.existsSync(path.join(failure.directory, "customer-knowledge.json")),
    false,
  );
  assert.match(
    fs.readFileSync(path.join(failure.directory, "run-report.md"), "utf8"),
    /Status: failed/,
  );
});

test("a confirmed response can be revalidated offline after a local write failure", async () => {
  const runId = randomUUID();
  const directory = path.join(root, `run-${runId}`);
  const blocker = path.join(directory, "customer-knowledge-model-draft.md");
  const { client, calls } = fakeClient({
    beforeFinal: () => fs.mkdirSync(blocker),
  });
  await assert.rejects(
    runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits, runId }),
    {
      code: "RESEARCH_ARTIFACT_OR_RUN_FAILED",
    },
  );
  assert.ok(fs.existsSync(path.join(directory, "request-10-response.json")));
  fs.rmdirSync(blocker);
  const knowledge = replayContinuousKnowledge({ artifactRoot: root, runDirectory: directory });
  assert.equal(knowledge.client.name, "星河眼镜");
  assert.equal(calls.length, 10);
  assert.ok(fs.existsSync(path.join(directory, "customer-knowledge.json")));
  assert.ok(fs.existsSync(path.join(directory, "customer-knowledge.md")));
});

test("a response persistence failure never triggers another remote request", async () => {
  const runId = randomUUID();
  const directory = path.join(root, `run-${runId}`);
  const { client, calls } = fakeClient({
    beforeFinal: () =>
      fs.mkdirSync(path.join(directory, "request-10-response.json")),
  });
  await assert.rejects(
    runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits, runId }),
    { code: "RESEARCH_RESPONSE_PERSIST_FAILED" },
  );
  assert.equal(calls.length, 10);
  assert.match(
    fs.readFileSync(path.join(directory, "run-report.md"), "utf8"),
    /Status: uncertain/,
  );
});

test("offline replay restores a missing report without another request", async () => {
  const { client, calls } = fakeClient();
  const result = await runContinuousKnowledge({ artifactRoot: root,
    input: input(),
    client,
    limits,
  });
  const report = path.join(result.directory, "knowledge-synthesis-report.md");
  fs.unlinkSync(report);
  const recovered = replayContinuousKnowledge({ artifactRoot: root,
    runDirectory: result.directory,
  });
  assert.deepEqual(recovered, result.knowledge);
  assert.match(fs.readFileSync(report, "utf8"), /Remote requests added: 0/);
  assert.equal(calls.length, 10);
});

test("offline replay rejects a changed knowledge JSON", async () => {
  const { client } = fakeClient();
  const result = await runContinuousKnowledge({ artifactRoot: root,
    input: input(),
    client,
    limits,
  });
  const jsonPath = path.join(result.directory, "customer-knowledge.json");
  const changed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  changed.sections[0].items[0].text = "被篡改的业务事实。";
  fs.writeFileSync(jsonPath, JSON.stringify(changed));
  fs.unlinkSync(path.join(result.directory, "knowledge-synthesis-report.md"));
  assert.throws(
    () => replayContinuousKnowledge({ artifactRoot: root, runDirectory: result.directory }),
    { code: "KNOWLEDGE_RECOVERY_INVALID" },
  );
});

test("malformed final JSON and unknown refs retain the response without publishing a product", async () => {
  for (const finalResponse of [
    () => "{broken",
    (answer) => {
      answer.sections[0].items[0].inputRefs = ["unknown-ref"];
      return JSON.stringify(answer);
    },
  ]) {
    const { client, calls } = fakeClient({ finalResponse });
    let failure;
    try {
      await runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits });
    } catch (cause) {
      failure = cause;
    }
    assert.ok(
      [
        "KNOWLEDGE_RESPONSE_INVALID",
        "KNOWLEDGE_SYNTHESIS_INVALID_REF",
      ].includes(failure.code),
    );
    assert.ok(
      fs.existsSync(path.join(failure.directory, "request-10-response.json")),
    );
    assert.ok(
      !fs.existsSync(path.join(failure.directory, "customer-knowledge.json")),
    );
    assert.equal(calls.filter((call) => !call.context).length, 1);
  }
});

test("a trust paragraph can cite supported analysis from the advantage stage", async () => {
  const { client, calls } = fakeClient({
    finalResponse: (answer) => {
      answer.sections.push({
        key: "trust",
        items: [
          {
            text: "就近配镜可减少路程，方便学生安排到店服务。",
            kind: "derived",
            inputRefs: ["R3a-coreAdvantages-1"],
          },
        ],
      });
      return JSON.stringify(answer);
    },
  });
  const result = await runContinuousKnowledge({ artifactRoot: root,
    input: input(),
    client,
    limits,
  });
  assert.equal(calls.filter((call) => !call.context).length, 1);
  assert.deepEqual(
    result.knowledge.sections.find((section) => section.key === "trust")
      .items[0].inputRefs,
    ["R3a-coreAdvantages-1"],
  );
  assert.ok(
    fs.existsSync(path.join(result.directory, "customer-knowledge.json")),
  );
});

test("ordinary qualitative value can be inferred without copying source comparison words", async () => {
  const { client } = fakeClient({
    finalResponse: (answer) => {
      answer.sections[0].items[0] = {
        text: "店员耐心，便于学生更好地沟通配镜需求，让咨询交流更高效。",
        kind: "derived",
        inputRefs: ["M1", "R3a-coreAdvantages-1"],
      };
      return JSON.stringify(answer);
    },
  });
  const result = await runContinuousKnowledge({ artifactRoot: root,
    input: input(),
    client,
    limits,
  });
  assert.equal(result.knowledge.sections[0].items[0].kind, "derived");
  assert.equal(result.knowledge.quality.status, "draft");
});

test("relaxed narrative references still reject invented credentials, precision, numbers, cases and reviews", async () => {
  for (const [text, code, destination] of [
    ["星河眼镜获国家级认证。", "KNOWLEDGE_CLAIM_STRENGTH_ESCALATION", "trust"],
    ["星河眼镜验光精准。", "KNOWLEDGE_CLAIM_STRENGTH_ESCALATION", "trust"],
    ["星河眼镜有80名技师。", "KNOWLEDGE_UNSUPPORTED_NUMBER", "trust"],
    [
      "星河眼镜为某学校完成配镜案例。",
      "KNOWLEDGE_SYNTHESIS_INVALID_REF",
      "realCases",
    ],
    [
      "某客户评价配镜很好。",
      "KNOWLEDGE_SYNTHESIS_INVALID_REF",
      "customerReviews",
    ],
  ]) {
    const { client, calls } = fakeClient({
      finalResponse: (answer) => {
        const value = { text, inputRefs: ["R3a-coreAdvantages-1"] };
        if (destination === "trust")
          answer.sections.push({
            key: "trust",
            items: [{ ...value, kind: "derived" }],
          });
        else answer[destination].push(value);
        return JSON.stringify(answer);
      },
    });
    await assert.rejects(
      runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits }),
      { code },
    );
    assert.equal(calls.filter((call) => !call.context).length, 1);
  }
});

test("a hard fact invented in an earlier analysis cannot become final knowledge", async () => {
  const { client } = fakeClient({
    inventedExpertise: true,
    finalResponse: (answer) => {
      answer.sections[0].items[0] = {
        text: "星河眼镜有专家团队。",
        kind: "derived",
        inputRefs: ["R2a-customerCharacteristics-1"],
      };
      return JSON.stringify(answer);
    },
  });
  let failure;
  try {
    await runContinuousKnowledge({ artifactRoot: root, input: input(), client, limits });
  } catch (cause) {
    failure = cause;
  }
  assert.equal(failure.code, "KNOWLEDGE_UNSUPPORTED_HARD_FACT");
  assert.ok(
    !fs.existsSync(path.join(failure.directory, "customer-knowledge.json")),
  );
});

test("conflicting custom sections stop before any request", async () => {
  const value = input();
  value.knowledgePrompt = "不按九个板块，改为十五个板块。";
  const { client, calls } = fakeClient();
  await assert.rejects(
    runContinuousKnowledge({ artifactRoot: root, input: value, client, limits }),
    { code: "KNOWLEDGE_PROMPT_CONFLICT" },
  );
  assert.equal(calls.length, 0);
});

test("editing the caller input during a run cannot change frozen context", async () => {
  const original = input();
  const { client, calls } = fakeClient();
  const guarded = {
    request: async (request) => {
      if (calls.length === 0) {
        original.materials[0].content = "被修改";
        original.strategy.global = "被修改";
        original.knowledgePrompt = "被修改";
      }
      return client.request(request);
    },
  };
  const result = await runContinuousKnowledge({ artifactRoot: root,
    input: original,
    client: guarded,
    limits,
  });
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(result.directory, "input/materials.json")),
    )[0].text,
    source,
  );
  assert.match(
    fs.readFileSync(
      path.join(result.directory, "input/final-knowledge-prompt.txt"),
      "utf8",
    ),
    /九板块/,
  );
  assert.equal(calls.at(-1).request.search, false);
});


test("weak input attempts background research after a confirmed search failure and still saves prose", async () => {
  const fake = fakeClient();
  const searches = [];
  const result = await runContinuousKnowledge({ artifactRoot: root, input: input(), limits,
    client: { request: async request => {
      if (request.search) {
        const context = JSON.parse(request.prompt.split("[RUN_CONTEXT]\n")[1]);
        searches.push(context.searchNeed);
        throw Object.assign(new Error("synthetic confirmed failure"), { code: "GEO_CAPABILITY_REJECTED" });
      }
      return fake.client.request(request);
    } },
  });
  assert.deepEqual(searches.map(item => item.scope), ["entity", "decision_context"]);
  assert.equal(new Set(searches.map(item => item.query)).size, 2);
  assert.match(result.markdown, /星河眼镜提供配镜服务/);
  assert.match(result.researchNotes, /search_failed/);
  assert.equal(result.budget.count, 10);
});
