export const BATCH_GENERATION_STEPS = Object.freeze(['clients', 'templates', 'sources', 'confirm']);
export const GENERATION_BATCH_RISK_THRESHOLD = 10;

export function countGenerationTasks(clientCount, templateCount) {
  const clients = Number.isFinite(clientCount) ? Math.max(0, Math.floor(clientCount)) : 0;
  const templates = Number.isFinite(templateCount) ? Math.max(0, Math.floor(templateCount)) : 0;
  return clients * templates;
}

export function preserveSelection(current, available, touched, getKey = (item) => item) {
  const currentItems = Array.isArray(current) ? current : [];
  const availableItems = Array.isArray(available) ? available : [];
  if (!touched) return [];
  const availableSet = new Set(availableItems.map(getKey));
  return currentItems.filter((item) => availableSet.has(getKey(item)));
}

export function visibleGenerationTemplates(catalog, showBuiltin = false) {
  const templates = Array.isArray(catalog?.templates)
    ? catalog.templates.filter((template) => template && template.enabled !== false)
    : [];
  const customTemplates = templates.filter((template) => template.source === 'custom');
  if (customTemplates.length && !showBuiltin) return customTemplates;
  return templates;
}

export function templatePlatformDisplayName(catalog, platformId) {
  const platform = Array.isArray(catalog?.platforms)
    ? catalog.platforms.find((item) => item.id === platformId)
    : null;
  return platform?.displayName || platformId;
}

export function templateTitle(template) {
  return template?.displayName || template?.name || template?.scenario || template?.id || '';
}

export function templateScenarioLabel(template) {
  const title = templateTitle(template);
  return template?.scenario && template.scenario !== title ? template.scenario : '';
}

export function templateSourceLabel(template) {
  if (template?.source === 'builtin') return '内置模板 · 只读';
  if (template?.readOnly) return '历史模板快照 · 只读';
  return '自定义模板';
}

export function formatGenerationPreflightError(value, selections = []) {
  const code = value?.code || value?.error?.code || '';
  const rawMessage = String(value?.message || value?.error?.message || '').toLowerCase();
  const selectedLabel = selections.length
    ? `（${selections.map((item) => `${item.platform}:${item.templateId}`).join('、')}）`
    : '';
  if (code === 'GENERATION_TEMPLATE_STALE') return '模板目录已发生变化，请点击刷新后重新选择模板。';
  if (code === 'GENERATION_TEMPLATE_NOT_FOUND' || rawMessage.includes('writing template was not found') || rawMessage.includes('template was not found')) {
    return `所选写作模板不存在，请重新选择模板${selectedLabel}。`;
  }
  if (code.includes('TEMPLATE') || rawMessage.includes('template')) {
    return `所选写作模板不可用，请检查模板内容后重试${selectedLabel}。`;
  }
  if (code === 'CLIENT_MATERIAL_REQUIRED' || code === 'CLIENT_MATERIAL_INVALID') return '所选客户没有有效资料，请返回上一步调整客户或资料。';
  if (code === 'GEO_RESEARCH_REQUIRED' || code === 'GEO_RESEARCH_INVALID') return '所选客户没有有效 GEO 调研回答，请返回上一步调整客户或回答。';
  if (rawMessage.includes('writing') || rawMessage.includes('preflight')) return `批量生成预检失败，请检查所选客户和模板${selectedLabel}。`;
  return value instanceof Error && value.message ? value.message : '批量生成预检失败，请检查所选客户和模板。';
}

export function getMaterialId(material) {
  return material.id || material.name;
}

export function normalizeGenerationMaterial(material) {
  const value = material && typeof material === 'object' ? { ...material } : {};
  value.id = value.id || value.name;
  value.status = value.status || (typeof value.content === 'string' && value.content.trim() ? 'ready' : 'error');
  if (!Number.isFinite(value.characterCount) && typeof value.content === 'string') {
    value.characterCount = value.content.length;
  }
  return value;
}

export function isUsableMaterial(material) {
  if (!material || material.status === 'error' || material.status === 'converting') return false;
  if (Object.prototype.hasOwnProperty.call(material, 'content')) return Boolean(material.content?.trim());
  if (Number.isFinite(material.characterCount)) return material.characterCount > 0;
  // The initial batch read model intentionally omits bodies. A ready material
  // in that projection is selectable; the service performs the authoritative
  // content validation during preview/start.
  return material.status === 'ready';
}

export function isUsableResearch(research) {
  if (!research || research.isAnswerComplete === false) return false;
  if (Object.prototype.hasOwnProperty.call(research, 'answerText')) return Boolean(research.answerText?.trim());
  if (Number.isFinite(research.answerLength)) return research.answerLength > 0;
  return research.isAnswerComplete === true;
}

export function reconcileSourceSelection(materials, research, source) {
  const materialItems = Array.isArray(materials) ? materials : [];
  const researchItems = Array.isArray(research) ? research : [];
  const materialIds = Array.isArray(source?.materialIds) ? source.materialIds : [];
  const researchQueryIds = Array.isArray(source?.researchQueryIds) ? source.researchQueryIds : [];
  return {
    materialIds: [...new Set(materialIds)].filter((id) => isUsableMaterial(materialItems.find((item) => getMaterialId(item) === id))),
    researchQueryIds: [...new Set(researchQueryIds)].filter((id) => isUsableResearch(researchItems.find((item) => item.id === id))),
  };
}

export function isExecutableSource(materials, research, source) {
  if (!source?.materialIds?.length || !source?.researchQueryIds?.length) return false;
  const selected = reconcileSourceSelection(materials, research, source);
  return selected.materialIds.length === source.materialIds.length
    && selected.researchQueryIds.length === source.researchQueryIds.length;
}

export function shouldAutoSelectCurrentClient(clients, currentClientId, researchByClient, selectedClientIds = [], touched = false) {
  if (touched || !currentClientId || !Array.isArray(clients) || selectedClientIds.length) return false;
  const client = clients.find((item) => item?.id === currentClientId);
  if (!client) return false;
  const materials = Array.isArray(client.knowledgeFiles) ? client.knowledgeFiles : [];
  const research = researchByClient?.[currentClientId] || [];
  const source = {
    materialIds: materials.filter(isUsableMaterial).map(getMaterialId),
    researchQueryIds: research.filter(isUsableResearch).map((item) => item.id),
  };
  return isExecutableSource(materials, research, source);
}

export function sourceCharacterCount(materials, research) {
  return materials.reduce((total, item) => total + (typeof item.content === 'string' ? item.content.length : item.characterCount || 0), 0)
    + research.reduce((total, item) => total + (typeof item.answerText === 'string' ? item.answerText.length : item.answerLength || 0), 0);
}

export function groupTemplatesByPlatform(templates) {
  return templates.reduce((groups, template) => {
    const current = groups[template.platform] || [];
    groups[template.platform] = [...current, template];
    return groups;
  }, {});
}
