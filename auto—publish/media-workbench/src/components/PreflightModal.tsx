import React, { useState, useEffect } from 'react';
import { Article, Order, OrderPlatform, OrderStatus } from '../types';
import { AVAILABLE_PLATFORMS } from '../mockData';
import { 
  X, 
  ShieldCheck, 
  AlertTriangle, 
  Play, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  ArrowRight,
  Sparkles,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PreflightModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: Article[];
  balance: number;
  onSubmissionComplete: (newOrder: Order) => void;
}

export default function PreflightModal({
  isOpen,
  onClose,
  articles,
  balance,
  onSubmissionComplete
}: PreflightModalProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    AVAILABLE_PLATFORMS.filter(p => p.active).map(p => p.name)
  );
  
  const [step, setStep] = useState<'review' | 'submitting' | 'complete'>('review');
  const [progress, setProgress] = useState(0);
  const [currentLogs, setCurrentLogs] = useState<string[]>([]);
  const [submissionStatus, setSubmissionStatus] = useState<OrderStatus>('pending');
  const [finalOrder, setFinalOrder] = useState<Order | null>(null);

  // Validation Warnings
  const warnings = articles.filter(a => a.selectedResources.length === 0);

  // Platform Price calculations
  const totalArticlesCount = articles.length;
  const singlePlatformFee = AVAILABLE_PLATFORMS.reduce((acc, p) => 
    selectedPlatforms.includes(p.name) ? acc + p.price : acc
  , 0);
  const totalSubmissionFee = singlePlatformFee * totalArticlesCount;
  const isBalanceSufficient = balance >= totalSubmissionFee;

  const handlePlatformToggle = (platformName: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(platformName)
        ? prev.filter(name => name !== platformName)
        : [...prev, platformName]
    );
  };

  const startSubmission = () => {
    if (!isBalanceSufficient || selectedPlatforms.length === 0) return;
    setStep('submitting');
    setProgress(0);
    setCurrentLogs(['[系统] 初始化分发队列，开始预检...']);

    // Log streaming simulation
    const logTimeline = [
      { progress: 10, log: '[系统] 构建稿件加密沙箱...' },
      { progress: 20, log: `[系统] 已打包 ${totalArticlesCount} 篇待发布内容...` },
      { progress: 35, log: '[系统] 开始调用各大平台云接口 API 握手协议...' },
      ...selectedPlatforms.flatMap((platform, idx) => {
        const startP = 40 + idx * 10;
        const endP = startP + 5;
        const isSuccess = platform !== '知乎专栏' || Math.random() > 0.4; // Simulate occasional failure for zhihu to look extremely real!
        return [
          { progress: startP, log: `[${platform}] 建立服务器通道，校验安全令牌及发布参数...` },
          { progress: endP, log: isSuccess 
            ? `[${platform}] 稿件推送发布成功！内容ID: ${platform.substring(0,2)}_${Math.floor(10000 + Math.random() * 90000)}` 
            : `[${platform}] 发布被退回。异常：[403] 渠道政策限制或接口校验未通过。` }
        ];
      }),
      { progress: 95, log: '[系统] 清算完成，核销账户授信额度与消费总额...' },
      { progress: 100, log: '[系统] 自媒体分发任务队列执行完毕！' }
    ];

    let currentLogIndex = 0;
    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev + 4;
        
        // Push logs aligned with progress
        if (currentLogIndex < logTimeline.length && next >= logTimeline[currentLogIndex].progress) {
          setCurrentLogs(logs => [...logs, logTimeline[currentLogIndex].log]);
          currentLogIndex++;
        }

        if (next >= 100) {
          clearInterval(interval);
          completeSubmission();
          return 100;
        }
        return next;
      });
    }, 150);
  };

  const completeSubmission = () => {
    // Generate Order Platforms state
    const orderPlatforms: OrderPlatform[] = selectedPlatforms.map(p => {
      const isFailed = p === '知乎专栏' && Math.random() > 0.3; // Match log output
      return {
        name: p,
        status: isFailed ? 'failed' : 'success',
        error: isFailed ? '外部链接过多或格式验证失败' : undefined
      };
    });

    const isAllSuccess = orderPlatforms.every(p => p.status === 'success');
    const isAllFailed = orderPlatforms.every(p => p.status === 'failed');
    const status: OrderStatus = isAllSuccess ? 'success' : isAllFailed ? 'failed' : 'partial';

    // Total media bound count
    const totalMedia = articles.reduce((sum, a) => sum + a.selectedResources.length, 0);

    const newOrder: Order = {
      id: `ORD-2026${Math.floor(10000000 + Math.random() * 90000000)}`,
      articleTitle: articles[0]?.title || '批量媒体发布',
      filename: articles.map(a => a.filename).join(', '),
      platforms: orderPlatforms,
      totalFee: totalSubmissionFee,
      mediaCount: totalMedia,
      createdAt: new Date().toISOString(),
      status: status,
      logs: currentLogs
    };

    setFinalOrder(newOrder);
    setSubmissionStatus(status);
    setStep('complete');
    onSubmissionComplete(newOrder);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-white border border-slate-200/80 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <ShieldCheck className="w-5.5 h-5.5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-800">一键投稿预检与通道清算</h2>
              <p className="text-xs text-slate-400 mt-0.5">多渠道智能分发、权限安全校验、余额结算</p>
            </div>
          </div>
          {step !== 'submitting' && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scrollable Main body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <AnimatePresence mode="wait">
            {step === 'review' && (
              <motion.div
                key="review-step"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                {/* Warnings banner */}
                {warnings.length > 0 && (
                  <div className="p-3.5 bg-amber-50 text-amber-800 rounded-xl border border-amber-200/60 text-xs flex items-start space-x-2.5">
                    <AlertTriangle className="w-4.5 h-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">有 {warnings.length} 篇稿件尚未绑定任何媒体资源</p>
                      <p className="text-[11px] text-amber-700 mt-1 leading-normal">
                        包含：{warnings.map(w => w.filename).join(', ')}。未绑定媒体会默认进行纯文本投稿，这可能会降低推荐流量权重。
                      </p>
                    </div>
                  </div>
                )}

                {/* Selected documents checklist */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">第一步：确认待分发的稿件列表 ({articles.length} 篇)</h3>
                  <div className="max-h-[140px] overflow-y-auto border border-slate-200/50 rounded-xl divide-y divide-slate-100 px-3 bg-slate-50/20">
                    {articles.map(article => (
                      <div key={article.filename} className="py-2.5 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 truncate max-w-[400px]">{article.title}</span>
                        <span className="font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{article.filename}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Target channels */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">第二步：选择目标发布渠道及计费单价</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {AVAILABLE_PLATFORMS.map(platform => {
                      const isSelected = selectedPlatforms.includes(platform.name);
                      return (
                        <div
                          key={platform.name}
                          onClick={() => handlePlatformToggle(platform.name)}
                          className={`p-3 border rounded-xl cursor-pointer flex items-center justify-between transition-all select-none ${
                            isSelected
                              ? 'bg-blue-50/40 border-blue-400 text-blue-900 font-semibold'
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            <span className="text-lg">{platform.logo}</span>
                            <span className="text-xs truncate">{platform.name}</span>
                          </div>
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            ¥{platform.price}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Account Settlement block */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <h3 className="text-xs font-bold text-slate-700">第三步：服务清算与资金核减</h3>
                  <div className="grid grid-cols-3 gap-4 text-center divide-x divide-slate-200/60 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">单篇投稿渠道费</span>
                      <span className="font-bold text-slate-700 font-mono">¥{singlePlatformFee}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">合并计费总额</span>
                      <span className="font-bold text-blue-600 text-sm font-mono">¥{totalSubmissionFee.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">当前资金余额</span>
                      <span className={`font-bold font-mono ${isBalanceSufficient ? 'text-slate-700' : 'text-rose-600'}`}>
                        ¥{balance.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {!isBalanceSufficient && (
                    <div className="pt-2 text-[11px] text-rose-600 font-semibold flex items-center justify-center space-x-1.5 border-t border-slate-200/60">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>资金余额不足！请缩减分发渠道，或在配置中心对账户进行充值后方能继续。</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 'submitting' && (
              <motion.div
                key="submitting-step"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 py-4"
              >
                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700 flex items-center">
                      <Loader2 className="w-4 h-4 mr-2 text-blue-500 animate-spin" />
                      自媒体云分发队列处理中...
                    </span>
                    <span className="font-mono text-blue-600 font-bold">{progress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                </div>

                {/* Real-time server-side streams log */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">接口网关实时流日志 (Gateway Logs)</span>
                  <div className="h-[240px] bg-slate-950 font-mono text-[11px] leading-relaxed p-4 rounded-xl border border-slate-800 text-slate-300 overflow-y-auto space-y-1 select-text scrollbar-thin">
                    {currentLogs.map((log, index) => (
                      <div key={index} className="fade-in">
                        {log.includes('成功') || log.includes('正常') ? (
                          <span className="text-emerald-400">{log}</span>
                        ) : log.includes('退回') || log.includes('失败') || log.includes('异常') ? (
                          <span className="text-rose-400">{log}</span>
                        ) : (
                          <span>{log}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'complete' && (
              <motion.div
                key="complete-step"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5 text-center py-6"
              >
                {/* Big status icon */}
                <div className="flex flex-col items-center justify-center space-y-2.5">
                  {submissionStatus === 'success' ? (
                    <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center shadow-lg shadow-amber-200">
                      <AlertTriangle className="w-8 h-8" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-base font-bold text-slate-800">
                      {submissionStatus === 'success' ? '批量分发任务圆满完成！' : '分发完成，部分渠道产生异常'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">资金流与云网关交互已终止，计费账单已入账。</p>
                  </div>
                </div>

                {/* Simple Receipt card */}
                {finalOrder && (
                  <div className="max-w-md mx-auto p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-left text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">结算交易订单:</span>
                      <span className="font-mono font-bold text-slate-700">{finalOrder.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">处理稿件总量:</span>
                      <span className="font-bold text-slate-700">{totalArticlesCount} 篇</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">分发核准平台:</span>
                      <span className="font-bold text-slate-700">{selectedPlatforms.join(', ')}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/60 pt-2 font-medium">
                      <span className="text-slate-400">扣减账户授信总额:</span>
                      <span className="font-mono font-bold text-indigo-600 text-sm">¥{finalOrder.totalFee.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="text-xs text-slate-400 max-w-sm mx-auto leading-normal">
                  您可以在主菜单的【投稿订单记录】选项卡中查看已执行完毕的所有历史订单和具体的平台反馈令牌。
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer actions */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex justify-end space-x-2">
          {step === 'review' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-all active:scale-95"
              >
                取消
              </button>
              <button
                onClick={startSubmission}
                disabled={selectedPlatforms.length === 0 || !isBalanceSufficient}
                className="flex items-center space-x-1.5 px-4.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 disabled:pointer-events-none"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>立即启动分发</span>
              </button>
            </>
          )}

          {step === 'complete' && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95"
            >
              完成并返回
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
