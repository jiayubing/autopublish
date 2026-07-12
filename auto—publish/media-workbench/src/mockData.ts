import { Article, MediaResource, Order } from './types';

type MockArticle = Omit<Article, 'filePath' | 'autoTitle' | 'remark' | 'hasImages' | 'imageCount' | 'ignoreImages'>;

export const INITIAL_RESOURCES: MediaResource[] = [
  {
    resourceId: "RES-001",
    name: "4K 超清智能城市延时摄影视频",
    price: 88.00,
    type: "video",
    duration: "00:45",
    resolution: "3840x2160",
    size: "154 MB",
    createdAt: "2026-05-12"
  },
  {
    resourceId: "RES-002",
    name: "极简科技风概念配图.jpg",
    price: 12.00,
    type: "image",
    resolution: "1920x1080",
    size: "2.4 MB",
    createdAt: "2026-06-01"
  },
  {
    resourceId: "RES-003",
    name: "优雅环境背景伴奏音乐 - AWA.mp3",
    price: 35.00,
    type: "audio",
    duration: "03:15",
    size: "7.8 MB",
    createdAt: "2026-05-20"
  },
  {
    resourceId: "RES-004",
    name: "5G与未来物联网行业深度研究报告.pdf",
    price: 150.00,
    type: "document",
    size: "14.5 MB",
    createdAt: "2026-04-18"
  },
  {
    resourceId: "RES-005",
    name: "赛博朋克风霓虹街景氛围视频",
    price: 99.00,
    type: "video",
    duration: "00:30",
    resolution: "1920x1080",
    size: "82 MB",
    createdAt: "2026-06-10"
  },
  {
    resourceId: "RES-006",
    name: "元宇宙社交虚拟人高清头像包.zip",
    price: 45.00,
    type: "image",
    resolution: "1024x1024",
    size: "18.2 MB",
    createdAt: "2026-06-15"
  },
  {
    resourceId: "RES-007",
    name: "轻快商务风片头音效.wav",
    price: 8.00,
    type: "audio",
    duration: "00:08",
    size: "1.2 MB",
    createdAt: "2026-06-22"
  },
  {
    resourceId: "RES-008",
    name: "自媒体运营爆款标题公式指南.docx",
    price: 19.90,
    type: "document",
    size: "1.1 MB",
    createdAt: "2026-06-25"
  }
];

export const INITIAL_ARTICLES: MockArticle[] = [
  {
    filename: "ai_trend_2026.md",
    title: "2026 智能 AI 发展大趋势分析：从大模型到通用具身智能",
    content: `# 2026 智能 AI 发展大趋势分析

随着计算能力的指数级增长和多模态对齐技术的彻底突破，2026年的AI领域正在迎来新的产业拐点。

## 一、 通用具身智能（Embodied AI）的崛起
具身智能不再局限于学术实验室，已经开始进入汽车、家政、以及复杂高危工业场景。物理引擎与神经网络大模型的结合，使机器人获得了卓越的复杂空间理解和精细操作能力。

## 二、 边缘算力的绝对普及
轻量化模型（SLMs）通过量化与蒸馏技术，在移动设备、智能家居和可穿戴设备上运行得极其流畅。端侧本地智能能够不依赖网络实时完成95%以上的日常助理任务，极大地保障了用户的隐私与极速响应需求。

## 三、 实时多模态深度协同
2026年的AI助理可以同时接收用户的视觉（AR眼镜）、音频（自然语气和呼吸律动）、姿态和环境上下文，进行无缝的毫秒级拟人化互动。交互不再是简单的提问-回答，而是转变为主动的环境感知与伴随式赋能。`,
    words: 1250,
    tags: ["科技", "AI", "行业洞察"],
    selectedResources: [],
    lastModified: "2026-06-27 18:30"
  },
  {
    filename: "minimalism_aesthetic.docx",
    title: "极简主义生活美学：让日常退回原点，寻回内心的松弛感",
    content: `# 极简主义生活美学

在这个信息过载、消费至上的时代，“极简”不仅是一种视觉风格，更是一场深刻的内心革命。

## 什么是生活的“负空间”？
就像一幅中国国画中的留白，极简主义就是有意识地为我们的生活创造“负空间”。减少不必要的物品堆砌、推掉无意义的社交干扰、关闭喋喋不休的消息推送，让生活的底色重新明亮。

## 如何践行极简生活：
1. **物品去中心化**：每年不曾触碰三次的物品，果断地赠送、回收或舍弃。
2. **数字断舍离**：卸载高消耗、低信息密度的APP。设置每周“无屏日”。
3. **专注此刻的体验**：喝一杯咖啡时，不要看手机；走在雨后的街头，专注于泥土与空气的香气。

回归纯粹，并不是克制与贫瘠，而是极度的专注和丰盈。`,
    words: 890,
    tags: ["生活美学", "极简主义", "松弛感"],
    selectedResources: [INITIAL_RESOURCES[1]], // Pre-selected image resource
    lastModified: "2026-06-28 09:15"
  },
  {
    filename: "deep_sea_exploration.txt",
    title: "深海万米探秘：在幽暗寂静的地球极点，生命如何肆意燃烧",
    content: `深海探秘：未知的蓝色世界

地球上最难以触及的角落——马里亚纳海沟一万米深处。在这里，压力是地表的1000倍，温度逼近冰点，阳光更是绝迹亿万年。然而，人类的深潜器却在这里发现了令人震撼的奇景：生命并非在此苟延残喘，而是以一种超乎想象的姿态热烈绽放。

【热泉口附近的生机】
深海热泉喷吐着含有高浓度硫化物、高达400摄氏度的黑色矿物浆液。奇特的是，这里的细菌能够利用化学合成作用制造有机物，成为庞大深海生态系统的根基。盲虾、巨型管虫、白色深海蟹密密麻麻地簇拥着热泉。

【神秘的深海发光生物】
为了在绝对的黑暗中生存、诱捕猎物或寻找配偶，90%以上的深海鱼类和水母演化出了神奇的自发光器官。它们宛如深邃夜空中漂浮的璀璨星河，闪烁着幽蓝、翠绿或粉红的微光。

探索深海，不仅是对地球地理极限的征服，更是对生命力边界的重新定义。`,
    words: 1540,
    tags: ["科普", "自然科学", "探险"],
    selectedResources: [],
    lastModified: "2026-06-25 14:20"
  }
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: "ORD-2026062501",
    articleTitle: "智能自媒体运营全套高效爆款指南",
    filename: "media_guide_2026.md",
    platforms: [
      { name: "今日头条", status: "success" },
      { name: "微信公众号", status: "success" },
      { name: "百家号", status: "success" }
    ],
    totalFee: 32.00,
    mediaCount: 2,
    createdAt: "2026-06-25 16:45:12",
    status: "success",
    logs: [
      "2026-06-25 16:45:12 - [系统] 开始投稿队列处理...",
      "2026-06-25 16:45:13 - [系统] 正在打包文章 media_guide_2026.md 与已绑定的 2 个媒体资源",
      "2026-06-25 16:45:14 - [今日头条] API 握手成功，发布成功，内容ID: TOUTIAO_89432",
      "2026-06-25 16:45:16 - [微信公众号] 开始上传媒体素材...",
      "2026-06-25 16:45:18 - [微信公众号] 文章同步发表成功，群发队列提交完成",
      "2026-06-25 16:45:19 - [百家号] 账号状态正常，同步发布成功",
      "2026-06-25 16:45:20 - [系统] 扣减账户余额 ¥32.00 成功，全部平台分发完毕！"
    ]
  },
  {
    id: "ORD-2026062702",
    articleTitle: "未来五年绿色新能源发展与低碳转型研报",
    filename: "green_energy_future.pdf",
    platforms: [
      { name: "今日头条", status: "success" },
      { name: "知乎专栏", status: "failed", error: "安全校验失败：内容包含外部链接过多" },
      { name: "企鹅号", status: "success" }
    ],
    totalFee: 50.00,
    mediaCount: 1,
    createdAt: "2026-06-27 10:22:45",
    status: "partial",
    logs: [
      "2026-06-27 10:22:45 - [系统] 开始发布 [未来五年绿色新能源发展与低碳转型研报]",
      "2026-06-27 10:22:46 - [今日头条] 同步发布成功",
      "2026-06-27 10:22:48 - [知乎专栏] 网络发布被驳回：[403] 外部链接数量超出平台政策限制",
      "2026-06-27 10:22:49 - [企鹅号] 媒体上传顺利，发布成功",
      "2026-06-27 10:22:50 - [系统] 任务局部完成，结算今日头条与企鹅号成功，知乎失败。已扣除 ¥50.00，退回失败费用 ¥25.00。"
    ]
  }
];

export const AVAILABLE_PLATFORMS = [
  { name: "今日头条", logo: "📰", active: true, price: 10 },
  { name: "微信公众号", logo: "💬", active: true, price: 15 },
  { name: "知乎专栏", logo: "🎓", active: true, price: 12 },
  { name: "百家号", logo: "🦢", active: true, price: 10 },
  { name: "企鹅号", logo: "🐧", active: true, price: 10 },
  { name: "小红书", logo: "📕", active: true, price: 18 }
];
