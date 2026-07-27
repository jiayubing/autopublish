import React, { useState, useEffect, useRef } from 'react';
import { Article, Draft, MediaResource } from '../types';
import { 
  FileText, 
  Trash2, 
  Save, 
  X, 
  Check, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Music as MusicIcon, 
  FileSpreadsheet, 
  Sparkles,
  ExternalLink,
  Edit3,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { articleIdentity, createArticleEditorSession } from './article-editor-session';
import { useConfirmation } from '../confirmation';

interface ArticleEditorProps {
  activeArticle: Article | null;
  onSaveDraft: (draft: Draft, article?: Article) => Promise<void>;
  onCloseArticle: () => void;
  onRemoveSelectedResource: (resourceId: string) => void;
  resourceStates?: Record<string, { status?: string; reasonCode?: string }>;
}

interface ArticleEditorSnapshot {
  draft: Draft | null;
  isSaving: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  dirty: boolean;
}

export default function ArticleEditor({
  activeArticle,
  onSaveDraft,
  onCloseArticle,
  onRemoveSelectedResource,
  resourceStates = {}
}: ArticleEditorProps) {
  const { confirm } = useConfirmation();
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [editorState, setEditorState] = useState<ArticleEditorSnapshot>(() => ({ draft: null, isSaving: false, saveSuccess: false, saveError: null, dirty: false }));
  const saveDraftRef = useRef(onSaveDraft);
  saveDraftRef.current = onSaveDraft;
  const editorSession = useRef<ReturnType<typeof createArticleEditorSession> | null>(null);
  if (!editorSession.current) editorSession.current = createArticleEditorSession({ saveDraft: (draft, article) => saveDraftRef.current(draft, article) });

  const draftIsDirty = (): boolean => Boolean(editorSession.current?.snapshot().dirty);

  const stateFromSnapshot = (snapshot: ReturnType<ReturnType<typeof createArticleEditorSession>['snapshot']>): ArticleEditorSnapshot => ({
    draft: snapshot.draft,
    isSaving: snapshot.isSaving,
    saveSuccess: snapshot.saveSuccess,
    saveError: snapshot.saveError,
    dirty: snapshot.dirty,
  });

  const updateDraft = (changes: Partial<Draft>) => {
    const next = editorSession.current?.update(changes);
    if (next) setEditorState(stateFromSnapshot(next));
  };

  useEffect(() => {
    const session = editorSession.current;
    if (!session) return undefined;
    const unsubscribe = session.subscribe(() => setEditorState(stateFromSnapshot(session.snapshot())));
    return () => { unsubscribe(); session.dispose(); };
  }, []);

  const activeArticleId = articleIdentity(activeArticle);
  useEffect(() => {
    const session = editorSession.current;
    if (!session) return;
    const current = session.snapshot();
    const next = current.articleId === activeArticleId
      ? session.mergeExternal(activeArticle)
      : session.open(activeArticle);
    setEditorState(stateFromSnapshot(next));
  }, [activeArticleId, activeArticle]);

  if (!activeArticle) {
    return (
      <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center flex flex-col items-center justify-center h-full min-h-[400px] shadow-2xs">
        <div className="w-16 h-16 rounded-2xl bg-white shadow-xs border border-slate-200/50 flex items-center justify-center text-slate-400 mb-4 animate-pulse">
          <FileText className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-sm font-bold text-slate-700">暂无打开的稿件</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
          点击左侧稿件列表中的【打开】按钮，开始匹配媒体池、编写备注并优化草稿属性。
        </p>
      </div>
    );
  }

  const saveDraft = async () => {
    if (!activeArticle || editorSession.current?.snapshot().articleId !== activeArticleId || !editorSession.current?.snapshot().draft) return { saved: false, stale: false };
    const result = await editorSession.current.save();
    const next = editorSession.current.snapshot();
    setEditorState(stateFromSnapshot(next));
    return result;
  };

  const handleSave = () => {
    void saveDraft().catch(() => undefined);
  };

  const handleClose = async () => {
    if (!activeArticle || editorSession.current?.snapshot().isSaving) return;
    if (!draftIsDirty()) {
      onCloseArticle();
      return;
    }
    if (!(await confirm({
      title: '保存未完成的草稿',
      message: '草稿有未保存修改，是否保存后关闭？',
      confirmLabel: '保存并关闭',
      tone: 'warning',
    }))) return;
    try {
      const result = await saveDraft();
      if (result.saved && !draftIsDirty()) onCloseArticle();
    } catch (_) { /* The session consumes expected save failures; keep the editor open for unexpected errors. */ }
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-4 h-4 text-emerald-500" />;
      case 'video': return <VideoIcon className="w-4 h-4 text-blue-500" />;
      case 'audio': return <MusicIcon className="w-4 h-4 text-purple-500" />;
      default: return <FileSpreadsheet className="w-4 h-4 text-amber-500" />;
    }
  };

  const totalMediaPrice = activeArticle.selectedResources.reduce((sum, item) => {
    const status = resourceStates[item.resourceId]?.status;
    return status && status !== 'available' ? sum : sum + Number(item.price || 0);
  }, 0);

  return (
    <motion.div
      id="articleEditorRoot"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="bg-white border border-slate-200/80 rounded-2xl shadow-sm flex flex-col h-full min-h-[500px]"
    >
      {/* Article Panel Header */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-md border border-indigo-100/50">
              当前编辑
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {activeArticle.filename}
            </span>
          </div>
          <h2 className="text-sm font-bold text-slate-800 line-clamp-1">{activeArticle.title}</h2>
        </div>

        {/* Action button controls */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <button
            onClick={handleSave}
            disabled={editorState.isSaving}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all active:scale-95 ${
              editorState.saveSuccess
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {editorState.isSaving ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : editorState.saveSuccess ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{editorState.saveSuccess ? '已保存草稿' : '保存草稿'}</span>
          </button>

          <button
            onClick={handleClose}
            className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-800 text-xs font-semibold rounded-lg shadow-2xs transition-all"
          >
            <X className="w-3.5 h-3.5" />
            <span>关闭</span>
          </button>
          {editorState.saveError && <span role="alert" className="text-[10px] text-rose-600">{editorState.saveError}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-5 bg-white space-x-6">
        <button
          onClick={() => setActiveTab('editor')}
          className={`py-3 text-xs font-bold transition-all relative ${
            activeTab === 'editor' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          📝 属性配置与草稿
          {activeTab === 'editor' && (
            <motion.div layoutId="active-editor-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`py-3 text-xs font-bold transition-all relative ${
            activeTab === 'preview' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          👁️ 全文预览 ({activeArticle.words} 字)
          {activeTab === 'preview' && (
            <motion.div layoutId="active-editor-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Main Panel Content split into Two Scrollable Columns inside */}
      <div className="flex-1 overflow-y-auto max-h-[600px] p-5">
        <AnimatePresence mode="wait">
          {activeTab === 'editor' ? (
            <motion.div
              key="editor-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              {/* Left Form: Draft info */}
              <div className="space-y-4">
                <div className="bg-slate-50/50 p-4 border border-slate-200/50 rounded-xl space-y-4.5">
                  <h3 className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                    <span>属性重置及元数据</span>
                  </h3>
                  
                  {/* Draft Title */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 flex items-center">
                      投递标题
                      <HelpCircle className="w-3 h-3 ml-1 text-slate-400" title="在各渠道平台展现的内容主标题，建议控制在30字以内" />
                    </label>
                    <input
                      id="draftTitleInput"
                      type="text"
                      value={editorState.draft?.title ?? ''}
                      onChange={(e) => updateDraft({ title: e.target.value })}
                      placeholder="设置文章提交时的标题"
                      className="w-full px-3 py-2 text-xs bg-white text-slate-800 border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-hidden transition-all shadow-2xs"
                    />
                  </div>

                  {/* Draft Remark */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">渠道专属备注 (Remark)</label>
                    <textarea
                      id="draftRemarkInput"
                      value={editorState.draft?.remark ?? ''}
                      onChange={(e) => updateDraft({ remark: e.target.value })}
                      rows={4}
                      placeholder="可填写给审核编辑的留言或渠道定制参数..."
                      className="w-full px-3 py-2 text-xs bg-white text-slate-800 border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-hidden transition-all resize-none shadow-2xs"
                    />
                  </div>

                  {/* Checkbox Options */}
                  <div className="pt-2">
                    <label className="inline-flex items-center space-x-2.5 cursor-pointer text-xs font-medium text-slate-700 select-none group">
                      <input
                        id="ignoreImagesInput"
                        type="checkbox"
                        checked={editorState.draft?.ignoreImages ?? false}
                        onChange={(e) => updateDraft({ ignoreImages: e.target.checked })}
                        className="w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500/20"
                      />
                      <span className="group-hover:text-slate-900 transition-colors">自动忽略文中配图进行纯文本投稿</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right Form: Selected Resources summary */}
              <div className="space-y-4">
                <div className="border border-slate-200/80 rounded-xl p-4 flex flex-col h-full min-h-[250px] bg-slate-50/20">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <div className="space-y-0.5">
                      <h3 className="text-xs font-bold text-slate-700">已绑定的媒体资源</h3>
                      <p className="text-[10px] text-slate-400">来自右侧媒体池。一个稿件可绑定多个媒体进行混排分发</p>
                    </div>
                    {activeArticle.selectedResources.length > 0 && (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-md border border-emerald-100">
                        合规度 100%
                      </span>
                    )}
                  </div>

                  {/* Selected Resources List */}
                  {activeArticle.selectedResources.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                      <Sparkles className="w-7 h-7 text-slate-300 mb-2 animate-bounce" />
                      <p className="text-xs font-medium">尚未选择伴生媒体</p>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                        请在右侧媒体池中点击资源进行“勾选”绑定。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 flex-1 overflow-y-auto max-h-[260px] pr-1">
                      {activeArticle.selectedResources.map((resource) => (
                        (() => {
                          const publicationState = resourceStates[resource.resourceId];
                          const isBlocked = publicationState && publicationState.status && publicationState.status !== 'available';
                          return (
                        <div
                          key={resource.resourceId}
                          className="flex items-center justify-between p-2.5 bg-white border border-slate-100 rounded-lg shadow-2xs hover:border-slate-200 transition-all group"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <span className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                              {getMediaIcon(resource.type)}
                            </span>
                            <div className="min-w-0">
                              <h4 className="text-xs font-semibold text-slate-700 truncate max-w-[140px] md:max-w-[200px]">
                                {resource.name}
                              </h4>
                              <p className="text-[10px] text-slate-400 flex items-center">
                                <span className="font-mono">{resource.resourceId}</span>
                                {resource.duration && (
                                  <>
                                    <span className="mx-1">•</span>
                                    <span>{resource.duration}</span>
                                  </>
                                )}
                                {resource.size && (
                                  <>
                                    <span className="mx-1">•</span>
                                    <span>{resource.size}</span>
                                  </>
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 flex-shrink-0">
                            <span className={`font-mono text-xs font-bold ${isBlocked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                              ¥{Number(resource.price || 0).toFixed(1)}
                            </span>
                            {isBlocked && <span className="text-[10px] font-semibold text-amber-700">{publicationState?.status === 'uncertain' ? '待确认' : '已阻止'}</span>}
                            <button
                              data-remove-selected-resource={resource.resourceId}
                              onClick={() => onRemoveSelectedResource(resource.resourceId)}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                              title="取消绑定"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                          );
                        })()
                      ))}

                      {/* Summary calculations */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs mt-3 bg-slate-50/50 p-2.5 rounded-lg border border-slate-200/40">
                        <span className="text-slate-500 font-medium">伴生媒体附加授权费:</span>
                        <span className="font-bold text-slate-800 font-mono">¥{totalMediaPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-slate-50 rounded-xl p-5 border border-slate-200/40 font-sans max-h-[500px] overflow-y-auto"
            >
              <div className="prose prose-sm max-w-none text-slate-700 prose-headings:text-slate-800 prose-p:leading-relaxed">
                <h3 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200/60">
                  {activeArticle.title}
                </h3>
                <div className="whitespace-pre-wrap text-xs leading-relaxed font-mono select-text text-slate-600 bg-white p-4 rounded-lg border border-slate-200/40 shadow-2xs">
                  {activeArticle.content}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
