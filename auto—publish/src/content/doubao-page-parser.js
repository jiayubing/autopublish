function parserError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return value == null ? "" : String(value);
}

function classifyPage(snapshot) {
  const page = snapshot && typeof snapshot === "object" ? snapshot : {};
  if (page.challenge === true) {
    return { status: "challenge" };
  }
  if (text(page.errorText).trim()) {
    return { status: "page_error", errorText: text(page.errorText).trim() };
  }
  if (page.loginRequired === true) {
    return { status: "login_required" };
  }
  if (page.inputAvailable === false) {
    return { status: "login_required" };
  }
  return { status: "authenticated" };
}

function normalizeReferences(references) {
  if (!Array.isArray(references)) return [];

  const seen = new Set();
  return references.reduce(function(result, reference) {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) return result;

    const url = text(reference.url).trim();
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return result;
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return result;
    if (seen.has(url)) return result;
    seen.add(url);

    const title = text(reference.title).trim() || parsedUrl.hostname;
    result.push({
      title: title,
      url: url,
      snippet: text(reference.snippet)
    });
    return result;
  }, []);
}

function normalizeRole(value) {
  const role = text(value).trim().toLowerCase();
  if (!role) return "";
  if (role === "human" || role === "user") return "user";
  if (role === "bot" || role === "assistant") return "assistant";
  return role;
}

function classTokens(value) {
  return text(value).trim().split(/\s+/).filter(Boolean);
}

function hasJustifyEnd(candidate) {
  const classes = [candidate.className];
  if (Array.isArray(candidate.ancestorClassNames)) {
    classes.push.apply(classes, candidate.ancestorClassNames);
  }
  return classes.some(function(className) {
    return classTokens(className).some(function(token) { return token === "justify-end"; });
  });
}

function normalizeMessageCandidate(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;

  const messageId = text(candidate.messageId || candidate["data-message-id"]).trim();
  const messageText = text(candidate.text).trim();
  if (!messageId || !messageText) return null;

  const explicitRole = normalizeRole(
    candidate.role || candidate.messageRole || candidate.dataRole || candidate["data-role"]
  );
  const role = explicitRole || (hasJustifyEnd(candidate) ? "user" : "assistant");
  return {
    messageId: messageId,
    role: role,
    text: messageText,
    references: normalizeReferences(candidate.references)
  };
}

function normalizePageSnapshot(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const page = Object.assign({}, source);
  if (Array.isArray(source.messageCandidates)) {
    page.messages = source.messageCandidates.map(normalizeMessageCandidate).filter(Boolean);
    delete page.messageCandidates;
  }
  return page;
}

function findAnswerForQuestion(snapshot, question) {
  const page = normalizePageSnapshot(snapshot);
  const messages = Array.isArray(page.messages) ? page.messages : [];
  let questionIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === "user" && message.text === question) {
      questionIndex = index;
      break;
    }
  }
  if (questionIndex === -1) {
    throw parserError("DOUBAO_QUESTION_NOT_FOUND", "Requested Doubao question was not found");
  }

  for (let index = questionIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message && message.role === "user") break;
    if (message && message.role === "assistant") {
      return { page: page, messages: messages, questionIndex: questionIndex, answerIndex: index, question: messages[questionIndex], answer: message };
    }
  }
  throw parserError("DOUBAO_ANSWER_NOT_FOUND", "Assistant answer for the requested Doubao question was not found");
}

function selectAnswerForQuestion(snapshot, question) {
  const found = findAnswerForQuestion(snapshot, question);
  return {
    answerText: text(found.answer.text),
    references: normalizeReferences(found.answer.references)
  };
}

function getAnswerIdentity(snapshot, question) {
  try {
    const found = findAnswerForQuestion(snapshot, question);
    return {
      questionIndex: found.questionIndex,
      answerIndex: found.answerIndex,
      questionMessageId: text(found.question.messageId).trim(),
      answerMessageId: text(found.answer.messageId).trim(),
      answerText: text(found.answer.text)
    };
  } catch (error) {
    if (error.code === "DOUBAO_QUESTION_NOT_FOUND" || error.code === "DOUBAO_ANSWER_NOT_FOUND") return null;
    throw error;
  }
}

function isAnswerComplete(snapshot, question) {
  const page = snapshot && typeof snapshot === "object" ? snapshot : {};
  if (page.generating || page.challenge === true || text(page.errorText).trim()) return false;

  let answer;
  try {
    answer = selectAnswerForQuestion(page, question);
  } catch (error) {
    if (error.code === "DOUBAO_QUESTION_NOT_FOUND" || error.code === "DOUBAO_ANSWER_NOT_FOUND") return false;
    throw error;
  }
  return answer.answerText.trim().length >= 10;
}

module.exports = {
  classifyPage,
  selectAnswerForQuestion,
  getAnswerIdentity,
  isAnswerComplete,
  normalizeReferences,
  normalizePageSnapshot
};
