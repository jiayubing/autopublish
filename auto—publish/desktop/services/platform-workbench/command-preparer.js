"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mammoth = require("mammoth");

const {
  resolveArticleIdentity,
} = require("../../../src/publication/article-identity");
const { reportDiagnostic } = require("../../../src/diagnostics/diagnostic-producer");
const { isSafeToken, submissionInputError } = require("./queue-reader");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mediaBodyHtml(value) {
  return String(value || "")
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const heading = /^(#{1,6})\s+([\s\S]*)$/.exec(block);
      if (heading) {
        const level = heading[1].length;
        return `<h${level}>${escapeHtml(heading[2].trim())}</h${level}>`;
      }
      return `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");
}

function diagnoseArticleRead() {
  reportDiagnostic({
    code: "SUBMISSION_ARTICLE_STATE_UNAVAILABLE",
    module: "platform-command-preparer",
    category: "storage",
    operationId: "platform-command-preparer",
    metadata: { action: "article-read" },
  });
}

function createPlatformCommandPreparer(options) {
  const value = options || {};
  const adapters = value.adapters || {};
  const reader = value.reader;
  const contentStore = value.contentStore || null;
  if (!reader) throw new Error("Platform queue reader is required");

  async function fallbackParseArticle(sourceArticle, filePath) {
    const article = {
      sourceFile: filePath,
      file: filePath,
      filePath,
      filename: sourceArticle.filename,
      title:
        sourceArticle.title ||
        sourceArticle.fileBaseName ||
        path.basename(filePath, path.extname(filePath)),
    };
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".txt" || ext === ".md") {
      const raw = fs.readFileSync(filePath, "utf8");
      const lines = raw.split(/\n/);
      let first = 0;
      for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].replace(/^#+\s*/, "").trim()) {
          first = index;
          break;
        }
      }
      article.title =
        article.title || lines[first].replace(/^#+\s*/, "").trim();
      article.body = lines
        .slice(first + 1)
        .join("\n")
        .trim();
    } else if (ext === ".docx") {
      const result = await mammoth.extractRawText({
        buffer: fs.readFileSync(filePath),
      });
      const fullText = String((result && result.value) || "");
      const breakAt = fullText.indexOf("\n\n");
      article.body =
        breakAt > 0 ? fullText.substring(breakAt + 2).trim() : fullText;
      const titleLines = fullText.split(/\n/);
      article.title =
        article.title ||
        titleLines.map((line) => line.trim()).find(Boolean) ||
        article.title;
    }
    return article;
  }

  function articleIdentity(metadata) {
    const sidecar = metadata.data || {};
    const clientId = sidecar.clientId;
    const generatedArticleId = sidecar.generatedArticleId;
    if (!isSafeToken(clientId) || !isSafeToken(generatedArticleId))
      throw submissionInputError(
        "SUBMISSION_SIDECAR_IDENTITY_INVALID",
        "The queued publication has no safe article identity",
      );
    return resolveArticleIdentity({
      clientId,
      articleId: generatedArticleId,
    });
  }

  async function preparePublicationCommand(rawTask) {
    const task = reader.safeTask(rawTask);
    if (typeof task.accountProfileId !== "string" || !task.accountProfileId)
      throw submissionInputError(
        "ACCOUNT_PROFILE_REQUIRED",
        "A platform account profile is required",
      );
    const adapter = adapters[task.targetPlatformId];
    if (!adapter)
      throw submissionInputError(
        "SUBMISSION_ADAPTER_MISSING",
        "Missing adapter",
      );
    const filePath = reader.resolveSelectedFilePath(task, true);
    const metadata = reader.readSubmissionMetadata(
      task.sourcePlatformId,
      task.filename,
    );
    const durableAccountProfileId =
      metadata && metadata.data && metadata.data.accountProfileId;
    if (typeof durableAccountProfileId !== "string" || !durableAccountProfileId)
      throw submissionInputError(
        "LEGACY_UNKNOWN_ACCOUNT",
        "The queued publication must be manually bound to an account profile",
      );
    if (durableAccountProfileId !== task.accountProfileId)
      throw submissionInputError(
        "ACCOUNT_PROFILE_MISMATCH",
        "The selected account does not match the queued publication",
      );
    const durableTargetPlatformId =
      metadata &&
      metadata.data &&
      metadata.data.targetPlatformId;
    if (
      typeof durableTargetPlatformId === "string" &&
      durableTargetPlatformId &&
      durableTargetPlatformId !== task.targetPlatformId
    )
      throw submissionInputError(
        "PUBLICATION_TARGET_MISMATCH",
        "The selected target does not match the queued publication",
      );
    const source = {
      file: filePath,
      filePath,
      sourceFile: filePath,
      filename: task.filename,
      fileBaseName: path.basename(task.filename, path.extname(task.filename)),
    };
    const parsed = adapter.parse
      ? await adapter.parse([source])
      : [await fallbackParseArticle(source, filePath)];
    if (!parsed.length)
      throw submissionInputError(
        "ARTICLE_PARSE_FAILED",
        "Article parse returned no publishable article",
      );
    const article = parsed[0];
    const identity = articleIdentity(metadata);
    const submissionBatchId =
      metadata && metadata.data && metadata.data.submissionBatchId;
    if (typeof submissionBatchId !== "string" || !submissionBatchId)
      throw submissionInputError(
        "SUBMISSION_BATCH_MISSING",
        "The queued publication has no durable batch identity",
      );
    let body = typeof article.body === "string" ? article.body : "";
    if (!body.trim()) {
      try {
        const fallback = await fallbackParseArticle(source, filePath);
        if (fallback && typeof fallback.body === "string") body = fallback.body;
      } catch (_) {
        body = "";
      }
    }
    if (!body.trim())
      throw submissionInputError(
        "ARTICLE_BODY_REQUIRED",
        "The queued article has no publishable body",
      );
    const postProcessingPayload = {
      sourcePlatformId: task.sourcePlatformId,
      filename: task.filename,
      batchId: submissionBatchId,
    };
    let articleRef = null;
    if (
      metadata &&
      metadata.data &&
      isSafeToken(metadata.data.clientId) &&
      isSafeToken(identity.articleId)
    ) {
      postProcessingPayload.clientId = metadata.data.clientId;
      postProcessingPayload.articleId = identity.articleId;
      articleRef = {
        clientId: metadata.data.clientId,
        articleId: identity.articleId,
      };
      if (contentStore && typeof contentStore.getArticle === "function") {
        try {
          const persisted = contentStore.getArticle(articleRef.clientId, articleRef.articleId);
          if (!persisted)
            throw submissionInputError(
              "SUBMISSION_ARTICLE_NOT_FOUND",
              "The queued article is no longer available",
            );
          if (
            persisted.clientId !== articleRef.clientId ||
            persisted.id !== articleRef.articleId
          )
            throw submissionInputError(
              "SUBMISSION_ARTICLE_IDENTITY_MISMATCH",
              "The queued article identity does not match the content store",
            );
        } catch (error) {
          if (
            error &&
            [
              "SUBMISSION_ARTICLE_NOT_FOUND",
              "SUBMISSION_ARTICLE_IDENTITY_MISMATCH",
            ].includes(error.code)
          )
            throw error;
          diagnoseArticleRead();
          throw submissionInputError(
            "SUBMISSION_ARTICLE_STATE_UNAVAILABLE",
            "The queued article state is unavailable",
          );
        }
      }
    }
    return Object.freeze({
      articleId: identity.articleId,
      ...(articleRef ? { articleRef } : {}),
      target: {
        kind: "platform",
        platformId: task.targetPlatformId,
        accountProfileId: task.accountProfileId,
      },
      title:
        article.title ||
        path.basename(task.filename, path.extname(task.filename)),
      body,
      postProcessingPayload,
      workerTask: task,
    });
  }

  async function prepareMediaPublicationCommands(articles) {
    const commands = [];
    for (const article of articles || []) {
      const filePath = reader.resolveSelectedFilePath(
        { sourcePlatformId: "media", filename: article.filename },
        false,
      );
      const parsed = await fallbackParseArticle(
        {
          filename: article.filename,
          title: article.title,
          fileBaseName: path.basename(
            article.filename,
            path.extname(article.filename),
          ),
        },
        filePath,
      );
      const sourceBody =
        typeof parsed.body === "string" && parsed.body.trim()
          ? parsed.body
          : "媒体稿件内容";
      const body = mediaBodyHtml(sourceBody);
      const articleId =
        "media-" +
        crypto
          .createHash("sha256")
          .update(String(parsed.title || article.filename) + "\u0000" + body)
          .digest("hex")
          .slice(0, 48);
      for (const resource of article.selectedResources || []) {
        if (
          !resource ||
          typeof resource.resourceId !== "string" ||
          !resource.resourceId
        )
          throw submissionInputError();
        commands.push(
          Object.freeze({
            articleId,
            target: { kind: "media", mediaResourceId: resource.resourceId },
            title: parsed.title || article.filename,
            body,
            postProcessingPayload: {
              sourcePlatformId: "media",
              filename: article.filename,
            },
          }),
        );
      }
    }
    return commands;
  }

  return Object.freeze({
    preparePublicationCommand,
    prepareMediaPublicationCommands,
  });
}

module.exports = { createPlatformCommandPreparer, mediaBodyHtml };
