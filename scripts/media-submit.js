#!/usr/bin/env node

import { Command } from "commander";
import { resolveApiKey, maskApiKey, getProjectRoot } from "../src/core/config.js";
import { MediaClient } from "../src/core/media-client.js";
import { convertArticle } from "../src/core/article-converter.js";
import { SubmissionStore } from "../src/core/submission-store.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

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

// ---------------------------------------------------------------------------
// list — 网站媒体列表
// ---------------------------------------------------------------------------

sharedOptions(
  program
    .command("list")
    .description("查看可用的网站媒体列表")
    .option("--page <n>", "页码（1 开始，每页 20 条）", "1")
    .option("--all", "获取全部媒体（会发起多次请求）")
    .option("--keyword <text>", "按媒体名称/备注关键词筛选")
    .option("--min-price <n>", "最低价格筛选")
    .option("--max-price <n>", "最高价格筛选")
    .option("--save <path>", "保存媒体列表到文件（.json 或 .csv）")
    .option("--format <type>", "保存格式：json 或 csv（默认按文件扩展名判断）")
    .action(async (options) => {
      try {
        await handleList(options);
      } catch (err) {
        console.error(`\n❌ 查询媒体列表失败: ${err.message}`);
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

async function handleList(options) {
  const apiKey = resolveApiKey(options.apiKey);
  console.log(`🔑 API Key: ${maskApiKey(apiKey)}`);

  const client = new MediaClient({
    apiKey,
    baseUrl: options.baseUrl,
  });

  if (options.all) {
    await handleListAll(client, apiKey, options);
    return;
  }

  const page = parseInt(options.page, 10) || 1;
  console.log(`📋 正在获取网站媒体列表（第 ${page} 页）...`);

  const result = await client.mediaList({ page });
  const items = filterMediaItems(extractMediaItems(result), options);
  printMediaItems(items, `第 ${page} 页`);

  if (options.save) {
    await saveMediaItems(items, options.save, options.format);
  }

  const store = new SubmissionStore();
  await store.record({
    command: "list",
    dryRun: false,
    params: { api_key: apiKey, page },
    result: { success: true, count: items.length, data: result },
  });
}

async function handleListAll(client, apiKey, options) {
  console.log(`📋 正在获取全部网站媒体列表...`);

  const allItems = [];
  let page = 1;

  while (true) {
    const result = await client.mediaList({ page });
    const data = extractMediaItems(result);

    if (!Array.isArray(data) || data.length === 0) break;

    allItems.push(...data);

    process.stdout.write(`\r   已获取 ${allItems.length} 条 (第 ${page} 页)...`);
    page++;

    // Safety limit
    if (page > 1000) break;
  }

  const filtered = filterMediaItems(allItems, options);
  console.log("");
  printMediaItems(filtered, `全部媒体，共 ${allItems.length} 条，筛选后 ${filtered.length} 条`);

  if (options.save) {
    await saveMediaItems(filtered, options.save, options.format);
  }

  const store = new SubmissionStore();
  await store.record({
    command: "list",
    dryRun: false,
    params: {
      api_key: apiKey,
      all: true,
      keyword: options.keyword,
      min_price: options.minPrice,
      max_price: options.maxPrice,
      save: options.save,
    },
    result: { success: true, count: filtered.length, total: allItems.length },
  });
}

function extractMediaItems(result) {
  const candidates = [
    result,
    result?.data,
    result?.data?.data,
    result?.data?.list,
    result?.data?.items,
    result?.data?.rows,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) {
      return value.map(normalizeMediaItem);
    }
  }

  return [];
}

function normalizeMediaItem(item) {
  return {
    resource_id: item.resource_id ?? item.id ?? "",
    title: item.title ?? item.name ?? item.media_name ?? "",
    price: item.price ?? item.money ?? item.amount ?? "",
    media_type: item.media_type ?? item.type ?? "",
    success_rate: item.success_rate ?? item.successRate ?? item.rate ?? "",
    remark: item.remark ?? item.note ?? item.desc ?? "",
    raw: item,
  };
}

function filterMediaItems(items, options) {
  const keyword = options.keyword?.trim().toLowerCase();
  const minPrice = options.minPrice == null ? null : Number(options.minPrice);
  const maxPrice = options.maxPrice == null ? null : Number(options.maxPrice);

  return items.filter((item) => {
    if (keyword) {
      const haystack = [
        item.resource_id,
        item.title,
        item.media_type,
        item.remark,
      ].join(" ").toLowerCase();

      if (!haystack.includes(keyword)) {
        return false;
      }
    }

    const price = parsePrice(item.price);
    if (minPrice != null && Number.isFinite(minPrice) && price < minPrice) {
      return false;
    }
    if (maxPrice != null && Number.isFinite(maxPrice) && price > maxPrice) {
      return false;
    }

    return true;
  });
}

function parsePrice(value) {
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function printMediaItems(items, label) {
  console.log(`\n📋 ${label}，${items.length} 个媒体:\n`);
  for (const item of items) {
    console.log(`  ID: ${item.resource_id || "?"}`);
    if (item.title) console.log(`  名称: ${item.title}`);
    if (item.price !== "") console.log(`  价格: ${item.price}`);
    if (item.media_type) console.log(`  类型: ${item.media_type}`);
    if (item.success_rate) console.log(`  成功率: ${item.success_rate}`);
    if (item.remark) console.log(`  备注: ${item.remark}`);
    console.log("");
  }
}

async function saveMediaItems(items, outputPath, requestedFormat) {
  const target = resolve(outputPath);
  const format = (requestedFormat || extname(target).slice(1) || "json").toLowerCase();
  await mkdir(dirname(target), { recursive: true });

  if (format === "json") {
    await writeFile(target, JSON.stringify(items, null, 2), "utf-8");
  } else if (format === "csv") {
    await writeFile(target, toCsv(items), "utf-8");
  } else {
    throw new Error(`不支持的保存格式: ${format}。请使用 json 或 csv。`);
  }

  console.log(`✅ 已保存 ${items.length} 条媒体到: ${target}`);
}

function toCsv(items) {
  const headers = ["resource_id", "title", "price", "media_type", "success_rate", "remark"];
  const lines = [headers.join(",")];
  for (const item of items) {
    lines.push(headers.map((key) => csvEscape(item[key])).join(","));
  }
  return lines.join("\n") + "\n";
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
