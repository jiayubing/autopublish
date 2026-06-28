import React, { useState } from 'react';
import { MediaResource, MediaType } from '../types';
import { 
  Search, 
  Plus, 
  FolderOpen, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Music as MusicIcon, 
  FileText, 
  Check, 
  HelpCircle,
  FileCode,
  Tag,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ResourceLibraryProps {
  resources: MediaResource[];
  selectedResourceIds: string[];
  mode: 'management' | 'picker';
  activeArticleLabel: string;
  onPickResource: (resource: MediaResource) => void;
  onAddResource: (resource: Omit<MediaResource, 'createdAt'>) => void;
}

export default function ResourceLibrary({
  resources,
  selectedResourceIds,
  mode,
  activeArticleLabel,
  onPickResource,
  onAddResource
}: ResourceLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<MediaType | 'all'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Form states for adding new media
  const [newMediaName, setNewMediaName] = useState('');
  const [newMediaType, setNewMediaType] = useState<MediaType>('image');
  const [newMediaPrice, setNewMediaPrice] = useState('10');
  const [newMediaSize, setNewMediaSize] = useState('2.5 MB');

  // Filter items
  const filteredResources = resources.filter((resource) => {
    const matchesSearch = resource.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          resource.resourceId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'all' || resource.type === activeFilter;
    return matchesSearch && matchesFilter;
  });

  // Paginated items
  const totalPages = Math.ceil(filteredResources.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedResources = filteredResources.slice(startIndex, startIndex + itemsPerPage);

  const getMediaIcon = (type: MediaType) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />;
      case 'video': return <VideoIcon className="w-3.5 h-3.5 text-blue-500" />;
      case 'audio': return <MusicIcon className="w-3.5 h-3.5 text-purple-500" />;
      default: return <FileText className="w-3.5 h-3.5 text-amber-500" />;
    }
  };

  const getMediaTypeLabel = (type: MediaType) => {
    switch (type) {
      case 'image': return '图片';
      case 'video': return '视频';
      case 'audio': return '音频';
      default: return '文档';
    }
  };

  const handleAddMedia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMediaName.trim()) return;

    const randId = `RES-${Math.floor(100 + Math.random() * 900)}`;
    onAddResource({
      resourceId: randId,
      name: newMediaName,
      type: newMediaType,
      price: parseFloat(newMediaPrice) || 0,
      size: newMediaSize || '1.0 MB'
    });

    // Reset states
    setNewMediaName('');
    setNewMediaType('image');
    setNewMediaPrice('10');
    setNewMediaSize('2.5 MB');
    setShowAddForm(false);
  };

  return (
    <div id="mediaResourceLibraryRoot" className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full sticky top-6">
      {/* Header and selection indicator */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold text-slate-800">公共媒体资源池</h2>
          </div>
          
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100/80 rounded-lg text-xs font-semibold flex items-center space-x-1 border border-blue-200/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加媒体</span>
          </button>
        </div>

        {/* Dynamic Hint according to mode */}
        {mode === 'picker' ? (
          <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 text-[11px] text-blue-800 leading-normal flex items-start space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              正在为 <b>{activeArticleLabel}</b> 挑选媒体。在列表中点击资源即可完成一键绑定/解除。
            </div>
          </div>
        ) : (
          <div className="p-2.5 rounded-lg bg-slate-100/80 border border-slate-200/30 text-[11px] text-slate-500 leading-normal flex items-start space-x-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              当前为 <b>管理模式</b>。如需绑定媒体，请先在左侧双击打开对应稿件启用工作流。
            </div>
          </div>
        )}
      </div>

      {/* Add Media Panel overlay */}
      <AnimatePresence>
        {showAddForm && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleAddMedia}
            className="p-4 border-b border-slate-100 bg-blue-50/10 space-y-3 overflow-hidden text-xs"
          >
            <h3 className="font-bold text-slate-700">录入新媒体资源</h3>
            
            <div className="space-y-1.5">
              <label className="font-medium text-slate-600">资源名称</label>
              <input
                type="text"
                placeholder="例如：行业深度图表.png"
                value={newMediaName}
                onChange={(e) => setNewMediaName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:border-blue-500 outline-hidden"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="font-medium text-slate-600">资源类型</label>
                <select
                  value={newMediaType}
                  onChange={(e) => setNewMediaType(e.target.value as MediaType)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:border-blue-500 outline-hidden"
                >
                  <option value="image">JPEG/PNG 图片</option>
                  <option value="video">MP4/AVI 视频</option>
                  <option value="audio">MP3/WAV 音频</option>
                  <option value="document">PDF/DOCX 附件</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-medium text-slate-600">授权单价 (元)</label>
                <input
                  type="number"
                  placeholder="10"
                  value={newMediaPrice}
                  onChange={(e) => setNewMediaPrice(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:border-blue-500 outline-hidden"
                  min="0"
                  step="0.1"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-slate-600">文件大小</label>
              <input
                type="text"
                placeholder="2.5 MB"
                value={newMediaSize}
                onChange={(e) => setNewMediaSize(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:border-blue-500 outline-hidden"
              />
            </div>

            <div className="flex space-x-2 pt-1.5">
              <button
                type="submit"
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-2xs transition-all"
              >
                保存并导入
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-md transition-all"
              >
                取消
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Search and filter tags */}
      <div className="p-3 border-b border-slate-100 space-y-2">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3" />
          <input
            type="text"
            placeholder="搜索资源名称、编码..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="media-search w-full pl-8 pr-3 py-1.5 bg-slate-50 focus:bg-white text-xs text-slate-700 placeholder-slate-400 border border-slate-200 rounded-lg outline-hidden focus:border-blue-400 transition-all"
          />
        </div>

        {/* Categories tags filter */}
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'image', 'video', 'audio', 'document'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => { setActiveFilter(filter); setCurrentPage(1); }}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${
                activeFilter === filter
                  ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200/60 text-slate-500 hover:text-slate-700'
              }`}
            >
              {filter === 'all' ? '全部' : getMediaTypeLabel(filter)}
            </button>
          ))}
        </div>
      </div>

      {/* Resources List */}
      <div className="resource-list divide-y divide-slate-100 overflow-y-auto max-h-[300px]">
        {paginatedResources.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            暂无匹配的资源
          </div>
        ) : (
          paginatedResources.map((resource) => {
            const isSelected = selectedResourceIds.includes(resource.resourceId);
            
            return (
              <div
                key={resource.resourceId}
                onClick={() => onPickResource(resource)}
                className={`p-3 hover:bg-slate-50/80 cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                  isSelected && mode === 'picker' ? 'bg-blue-50/20' : ''
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  {/* Select indicator checkbox or type icon */}
                  {mode === 'picker' ? (
                    <div className={`w-4.5 h-4.5 rounded flex items-center justify-center border transition-all ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-slate-300 bg-white group-hover:border-slate-400'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3px]" />}
                    </div>
                  ) : (
                    <span className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                      {getMediaIcon(resource.type)}
                    </span>
                  )}

                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-slate-700 truncate max-w-[130px]">
                      {resource.name}
                    </h4>
                    <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 mt-0.5">
                      <span className="font-mono bg-slate-100 px-1 py-0.2 rounded">{resource.resourceId}</span>
                      <span>•</span>
                      <span>{resource.size}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200/50 px-1.5 py-0.5 rounded-full">
                    ¥{resource.price.toFixed(1)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination component */}
      {totalPages > 1 && (
        <div className="pagination p-3.5 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50/40">
          <span className="page-info text-slate-500">
            第 <b>{currentPage}</b> / <b>{totalPages}</b> 页 (共 {filteredResources.length} 项)
          </span>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:text-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:text-slate-800 disabled:opacity-40"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
