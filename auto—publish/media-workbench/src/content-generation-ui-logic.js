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

export function isUsableMaterial(material) {
  return material?.status !== 'error' && material?.status !== 'converting' && Boolean(material?.content?.trim());
}

export function isUsableResearch(research) {
  return research?.isAnswerComplete !== false && Boolean(research?.answerText?.trim());
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

export function sourceCharacterCount(materials, research) {
  return materials.reduce((total, item) => total + (item.content?.length || 0), 0)
    + research.reduce((total, item) => total + (item.answerText?.length || 0), 0);
}

export function groupTemplatesByPlatform(templates) {
  return templates.reduce((groups, template) => {
    const current = groups[template.platform] || [];
    groups[template.platform] = [...current, template];
    return groups;
  }, {});
}
