"use strict";

function actionReasonMessage(reasonCode) {
  const messages = {
    SUBMISSION_ACTION_STALE: "动作计划已过期，请重新预览。",
    SUBMISSION_IDENTITY_CONFLICT: "本地队列身份不完整或不匹配。",
    SUBMISSION_CONTENT_CHANGED: "队列文件内容已变化。",
    SUBMISSION_QUEUE_CHANGED: "队列文件状态已变化。",
    PUBLICATION_REMOTE_STARTED: "投稿已经开始，不能撤销。",
    ARTICLE_SUBMISSION_ACTIVE: "投稿正在进行，不能撤销。",
    SUBMISSION_ALREADY_CANCELLED: "该项目已经撤销。"
  };
  return messages[reasonCode] || "当前项目不能执行该操作。";
}

module.exports = { actionReasonMessage };
