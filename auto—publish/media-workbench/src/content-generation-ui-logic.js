export const BATCH_GENERATION_STEPS = Object.freeze(['clients', 'templates', 'sources', 'confirm']);

export function countGenerationTasks(clientCount, templateCount) {
  const clients = Number.isFinite(clientCount) ? Math.max(0, Math.floor(clientCount)) : 0;
  const templates = Number.isFinite(templateCount) ? Math.max(0, Math.floor(templateCount)) : 0;
  return clients * templates;
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
