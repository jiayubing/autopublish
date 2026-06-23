#!/usr/bin/env node

import { Command } from "commander";
import { resolveApiKey, maskApiKey, getProjectRoot } from "../src/core/config.js";
import { MediaClient } from "../src/core/media-client.js";
import { convertArticle } from "../src/core/article-converter.js";
import { SubmissionStore } from "../src/core/submission-store.js";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Shared options
// ---------------------------------------------------------------------------

function sharedOptions(cmd) {
  return cmd
    .option("--api-key <key>", "API Key（覆盖环境变量和 .env）")
    .option("--base-url <url>", "API 基础地址");
}

// ---------------------------------------------------------------------------
// Main program
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("media-submit")
  .description("媒体投稿渠道 CLI 工具")
  .version("1.0.0");

// ---------------------------------------------------------------------------
// submit — 文章投稿
// ---------------------------------------------------------------------------

sharedOptions(
  program
    .command("submit")
    .description("提交文章投稿（默认 dry-run，需加 --confirm 才真实投稿）")
    .requiredOption("--resource-id <id>", "目标媒体资源 ID")
    .requiredOption("--title <title>", "文章标题")
    .requiredOption("--content-file <path>", "文章文件路径（.txt 或 .docx）")
    .option("--remark <text>", "投稿备注")
    .option("--third-id <id>", "第三方追踪 ID")
    .option("--confirm", "确认真实投稿（不加此参数为 dry-run）")
    .action(async (options) => {
      try {
        await handleSubmit(options);
      } catch (err) {
        console.error(`\n❌ 投稿失败: ${err.message}`);
        process.exit(1);
      }
    })
);

// ---------------------------------------------------------------------------
// order — 订单查询
// ---------------------------------------------------------------------------

sharedOptions(
  program
    .command("order")
    .description("查询订单详情")
    .requiredOption("--order-nid <id>", "订单号")
    .action(async (options) => {
      try {
        await handleOrder(options);
      } catch (err) {
        console.error(`\n❌ 查询失败: ${err.message}`);
        process.exit(1);
      }
    })
);

// ---------------------------------------------------------------------------
// balance — 余额查询
// ---------------------------------------------------------------------------

sharedOptions(
  program
    .command("balance")
    .description("查询账户余额")
    .action(async (options) => {
      try {
        await handleBalance(options);
      } catch (err) {
        console.error(`\n❌ 余额查询失败: ${err.message}`);
        process.exit(1);
      }
    })
);

program.parse();

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSubmit(options) {
  const dryRun = !options.confirm;

  // 1. Resolve API key
  const apiKey = resolveApiKey(options.apiKey);
  console.log(`🔑 API Key: ${maskApiKey(apiKey)}`);

  // 2. Resolve content file path
  const contentFile = resolve(options.contentFile);
  console.log(`📄 文章文件: ${contentFile}`);

  // 3. Convert article
  console.log(`🔄 正在转换文章...`);
  const article = await convertArticle(contentFile);
  console.log(
    `   → 转换完成，HTML ${article.html.length} 字符，纯文本 ${article.plainText.length} 字符`
  );

  // 4. Dry-run preview
  console.log(`\n${dryRun ? "🔍 [DRY-RUN] 预览模式" : "🚀 [REAL] 真实投稿模式"}`);
  console.log("──────────────────────────────────────────────");
  console.log(`  资源 ID : ${options.resourceId}`);
  console.log(`  标题    : ${options.title}`);
  console.log(`  文件    : ${article.sourceFile}`);
  console.log(`  备注    : ${options.remark || "(无)"}`);
  console.log(`  第三方ID: ${options.thirdId || "(无)"}`);
  console.log(`  内容预览: ${article.plainText.slice(0, 200)}${article.plainText.length > 200 ? "..." : ""}`);
  console.log("──────────────────────────────────────────────");

  if (dryRun) {
    console.log("\n💡 这是 dry-run，未真实调用投稿 API。");
    console.log("   添加 --confirm 参数以执行真实投稿。");

    // Record dry-run
    const store = new SubmissionStore();
    await store.record({
      command: "submit",
      dryRun: true,
      params: {
        api_key: apiKey,
        resource_id: options.resourceId,
        title: options.title,
        content_file: contentFile,
        remark: options.remark,
        third_id: options.thirdId,
      },
      result: { success: true, data: { dry_run: true } },
    });

    return;
  }

  // 5. Real submission
  console.log(`\n📡 正在调用投稿 API...`);
  const client = new MediaClient({
    apiKey,
    baseUrl: options.baseUrl,
  });

  let result;
  try {
    result = await client.sendArticle({
      resourceId: options.resourceId,
      title: options.title,
      content: article.html,
      remark: options.remark,
      thirdId: options.thirdId,
    });
  } catch (err) {
    // Record failed submission
    const store = new SubmissionStore();
    await store.record({
      command: "submit",
      dryRun: false,
      params: {
        api_key: apiKey,
        resource_id: options.resourceId,
        title: options.title,
        content_file: contentFile,
        remark: options.remark,
        third_id: options.thirdId,
      },
      result: { success: false, error: err.message },
    });
    throw err;
  }

  // 6. Display result
  console.log(`\n✅ 投稿请求已提交`);
  console.log(JSON.stringify(result, null, 2));

  // Record successful submission
  const store = new SubmissionStore();
  await store.record({
    command: "submit",
    dryRun: false,
    params: {
      api_key: apiKey,
      resource_id: options.resourceId,
      title: options.title,
      content_file: contentFile,
      remark: options.remark,
      third_id: options.thirdId,
    },
    result: { success: true, data: result },
  });
}

async function handleOrder(options) {
  const apiKey = resolveApiKey(options.apiKey);
  console.log(`🔑 API Key: ${maskApiKey(apiKey)}`);
  console.log(`🔍 查询订单: ${options.orderNid}`);

  const client = new MediaClient({
    apiKey,
    baseUrl: options.baseUrl,
  });

  let result;
  try {
    result = await client.orderInfo(options.orderNid);
  } catch (err) {
    const store = new SubmissionStore();
    await store.record({
      command: "order",
      dryRun: false,
      params: {
        api_key: apiKey,
        order_nids: [options.orderNid],
      },
      result: { success: false, error: err.message },
    });
    throw err;
  }

  console.log(`\n📋 订单详情:`);
  console.log(JSON.stringify(result, null, 2));

  const store = new SubmissionStore();
  await store.record({
    command: "order",
    dryRun: false,
    params: {
      api_key: apiKey,
      order_nids: [options.orderNid],
    },
    result: { success: true, data: result },
  });
}

async function handleBalance(options) {
  const apiKey = resolveApiKey(options.apiKey);
  console.log(`🔑 API Key: ${maskApiKey(apiKey)}`);
  console.log(`💰 查询余额...`);

  const client = new MediaClient({
    apiKey,
    baseUrl: options.baseUrl,
  });

  let result;
  try {
    result = await client.getBalance();
  } catch (err) {
    const store = new SubmissionStore();
    await store.record({
      command: "balance",
      dryRun: false,
      params: { api_key: apiKey },
      result: { success: false, error: err.message },
    });
    throw err;
  }

  console.log(`\n💰 余额信息:`);
  console.log(JSON.stringify(result, null, 2));

  const store = new SubmissionStore();
  await store.record({
    command: "balance",
    dryRun: false,
    params: { api_key: apiKey },
    result: { success: true, data: result },
  });
}
