import { db } from "./storage";
import { jobs, applications, interviewReviews } from "@shared/schema";

const now = Date.now();
const dayMs = 86400 * 1000;
const d = (daysAgo: number) => now - daysAgo * dayMs;

type Category = "internet" | "ai_startup" | "other";
type Subcategory =
  | "product"
  | "operations"
  | "analytics"
  | "market"
  | "strategy"
  | "other";

type SeedJob = {
  company: string;
  title: string;
  category: Category;
  subcategory: Subcategory;
  location: string;
  salary_range: string;
  description: string;
  source_url?: string;
  source_name?: string;
  posted_days_ago: number;
  tags: string[];
};

const seedJobs: SeedJob[] = [
  // ============================================================
  // 互联网 · 产品 (7)
  // ============================================================
  {
    company: "字节跳动",
    title: "产品经理 - 抖音电商",
    category: "internet",
    subcategory: "product",
    location: "上海 / 闵行",
    salary_range: "25-40K · 14薪",
    description:
      "抖音电商商家服务方向，负责商家入驻、店铺装修、营销工具的产品迭代。1. 调研中小商家在抖音电商生态中的核心诉求，拆解为可落地的产品需求；2. 主导从需求到上线全流程，输出 PRD、原型、验收用例；3. 与运营、设计、研发协同推进版本节奏；4. 通过商家活跃、GMV、店铺评分等指标验证产品价值。要求：1-3 年互联网产品经验，应届优秀同学可投；本科及以上，专业不限，商科背景优先；电商或 SaaS 经验加分；具备较强的用户同理心和文档表达能力。",
    source_name: "小红书",
    posted_days_ago: 1,
    tags: ["电商", "C端", "字节"],
  },
  {
    company: "小红书",
    title: "社区产品经理 - 创作者增长",
    category: "internet",
    subcategory: "product",
    location: "上海 / 静安",
    salary_range: "22-35K · 16薪",
    description:
      "小红书社区创作者业务。1. 负责创作者中心、激励工具、变现链路的产品规划；2. 深度访谈博主，挖掘真实痛点并转化为功能；3. 与运营、算法、数据团队协同推进创作者活跃度、留存、变现 GMV；4. 输出可复用的产品方法论。要求：1-4 年内容/社区产品经验，应届优秀候选人可投；商科或新闻传播背景优先；自己是小红书重度用户、有运营自己账号经验者加分。",
    source_name: "小红书",
    posted_days_ago: 1,
    tags: ["社区", "创作者", "小红书"],
  },
  {
    company: "美团",
    title: "产品经理 - 到店餐饮商家端",
    category: "internet",
    subcategory: "product",
    location: "北京 / 朝阳",
    salary_range: "22-38K · 16薪",
    description:
      "美团到店事业群商家产品。1. 负责团购、套餐、营销工具的商家侧体验优化；2. 走访线下商家，理解经营痛点；3. 与销售、运营、研发协同推进项目；4. 通过商家活跃、订单量、复购率等指标验证。要求：1-3 年产品经验或优秀应届；商科/经管/统计专业优先；对本地生活、餐饮行业有兴趣；具备线下走访意愿。",
    source_name: "小红书",
    posted_days_ago: 2,
    tags: ["本地生活", "B端", "美团"],
  },
  {
    company: "腾讯",
    title: "产品策划 - 微信视频号",
    category: "internet",
    subcategory: "product",
    location: "广州 / 海珠",
    salary_range: "25-40K · 16薪",
    description:
      "视频号商业化产品团队。1. 参与视频号广告位、商品挂载、直播带货等商业化模块的需求拆解和原型设计；2. 与运营、销售协同跟进客户反馈；3. 数据分析驱动版本迭代。要求：本科及以上，1-3 年产品经验或优秀应届；商科/营销/传播背景优先；对短视频生态有自己的观察。",
    source_name: "小红书",
    posted_days_ago: 3,
    tags: ["视频号", "商业化", "腾讯"],
  },
  {
    company: "B站 哔哩哔哩",
    title: "产品经理 - 会员购电商",
    category: "internet",
    subcategory: "product",
    location: "上海 / 杨浦",
    salary_range: "20-32K · 14薪",
    description:
      "会员购二次元周边电商。1. 负责商品详情、购物车、订单链路的产品迭代；2. 与运营、采销、UP 主合作策划主题专场；3. 通过 GMV、转化率、复购率等指标验证。要求：1-3 年产品经验；ACGN/二次元爱好者加分；商科/设计/中文专业不限；具备较强的审美和共情能力。",
    source_name: "小红书",
    posted_days_ago: 4,
    tags: ["电商", "二次元", "B站"],
  },
  {
    company: "携程",
    title: "产品经理 - 国内度假",
    category: "internet",
    subcategory: "product",
    location: "上海 / 长宁",
    salary_range: "22-35K · 14薪",
    description:
      "国内度假产品线。1. 负责国内跟团、自由行、目的地玩乐产品的搜索/详情/下单链路；2. 与采销、运营、客服协同优化用户决策路径；3. 数据驱动持续提升转化与 NPS。要求：1-3 年产品经验或优秀应届；旅游/酒店/航空业经验加分；商科/旅游管理背景优先。",
    source_name: "小红书",
    posted_days_ago: 5,
    tags: ["旅游", "C端", "携程"],
  },
  {
    company: "拼多多",
    title: "产品经理 - 多多买菜",
    category: "internet",
    subcategory: "product",
    location: "上海 / 长宁",
    salary_range: "28-45K · 16薪",
    description:
      "多多买菜履约侧产品。1. 负责团长端、自提点、配送链路的产品体验；2. 走访仓配、团长一线场景；3. 与运营、地推、研发协同推进。要求：1-4 年产品经验；对供应链/履约业务有兴趣；商科或物流管理背景优先；能接受高强度节奏。",
    source_name: "小红书",
    posted_days_ago: 3,
    tags: ["生鲜", "履约", "拼多多"],
  },

  // ============================================================
  // 互联网 · 运营 (7)
  // ============================================================
  {
    company: "小红书",
    title: "电商运营 - 美妆个护行业",
    category: "internet",
    subcategory: "operations",
    location: "上海 / 静安",
    salary_range: "18-28K · 14薪",
    description:
      "小红书电商美妆个护行业运营。1. 对接品牌商家，制定季度经营策略；2. 策划行业大促、专题活动，拉动 GMV；3. 复盘活动数据，沉淀打法。要求：1-3 年电商/品牌/美妆行业运营经验；商科/营销背景优先；爱用小红书、了解美妆品牌矩阵。",
    source_name: "小红书",
    posted_days_ago: 1,
    tags: ["电商运营", "美妆", "小红书"],
  },
  {
    company: "字节跳动",
    title: "用户运营 - 番茄小说",
    category: "internet",
    subcategory: "operations",
    location: "北京 / 海淀",
    salary_range: "18-30K · 14薪",
    description:
      "番茄小说用户增长与活跃运营。1. 通过 push、活动、签到等触点提升 DAU 与留存；2. 设计用户成长体系，提升付费转化；3. 与产品、数据、客户端紧密协作。要求：1-3 年互联网用户运营经验；对内容产品有热情；商科/中文/传播专业不限；熟悉用户分层与活动策划。",
    source_name: "小红书",
    posted_days_ago: 2,
    tags: ["用户运营", "内容", "字节"],
  },
  {
    company: "美团",
    title: "活动运营 - 美团外卖",
    category: "internet",
    subcategory: "operations",
    location: "北京 / 朝阳",
    salary_range: "18-28K · 16薪",
    description:
      "美团外卖大促与节日活动运营。1. 策划神券节、夏日冰饮节等主题活动，从主题、玩法、商家招商到落地；2. 协调商家、市场、产品、研发资源；3. 复盘 ROI、GMV、新客拉新等核心指标。要求：1-3 年活动运营经验；商科/营销/广告专业优先；具备扎实的项目管理能力和数据 sense。",
    source_name: "小红书",
    posted_days_ago: 3,
    tags: ["活动运营", "外卖", "美团"],
  },
  {
    company: "B站 哔哩哔哩",
    title: "内容运营 - 知识区",
    category: "internet",
    subcategory: "operations",
    location: "上海 / 杨浦",
    salary_range: "15-25K · 14薪",
    description:
      "B 站知识区内容运营。1. 挖掘和孵化知识区 UP 主；2. 策划专题、话题、Up 主激励活动；3. 跟踪播放量、互动、关注转化等指标。要求：1-3 年内容运营经验；B 站重度用户；自有视频创作经验加分；商科/中文/新闻传播专业优先。",
    source_name: "小红书",
    posted_days_ago: 2,
    tags: ["内容运营", "UP主", "B站"],
  },
  {
    company: "快手",
    title: "品牌运营 - 快手磁力引擎",
    category: "internet",
    subcategory: "operations",
    location: "北京 / 海淀",
    salary_range: "20-32K · 15薪",
    description:
      "磁力引擎品牌广告主运营。1. 对接快消、3C、美妆等行业头部品牌，制定投放方案；2. 协调销售、产品、行业策划资源落地客户需求；3. 复盘 case，沉淀行业打法。要求：2-4 年广告/品牌/媒介运营经验；4A 广告/媒介代理经验加分；商科/营销专业优先。",
    source_name: "小红书",
    posted_days_ago: 4,
    tags: ["品牌运营", "广告", "快手"],
  },
  {
    company: "携程",
    title: "私域运营 - 高星酒店会员",
    category: "internet",
    subcategory: "operations",
    location: "上海 / 长宁",
    salary_range: "18-28K · 14薪",
    description:
      "携程钻级会员私域运营。1. 通过企微、小程序、短信触达高净值会员；2. 策划会员专享权益、生日礼、专属客服等动作；3. 跟踪会员复购、ARPU、NPS。要求：1-3 年私域/CRM 运营经验；商科/酒店管理专业优先；具备较强的用户分层与文案能力。",
    source_name: "小红书",
    posted_days_ago: 5,
    tags: ["私域", "会员", "携程"],
  },
  {
    company: "网易云音乐",
    title: "社区运营 - 云村",
    category: "internet",
    subcategory: "operations",
    location: "杭州 / 滨江",
    salary_range: "15-25K · 14薪",
    description:
      "云音乐云村社区运营。1. 策划音乐人扶持、UGC 内容征集、主题节日活动；2. 与音乐人、内容审核、产品协同；3. 跟踪社区发帖量、互动率、留存。要求：1-3 年社区/内容运营经验；热爱音乐与文字；商科/中文/新闻传播专业优先。",
    source_name: "小红书",
    posted_days_ago: 6,
    tags: ["社区", "音乐", "网易"],
  },

  // ============================================================
  // 互联网 · 分析 (4)
  // ============================================================
  {
    company: "字节跳动",
    title: "商业分析师 - 抖音商业化",
    category: "internet",
    subcategory: "analytics",
    location: "北京 / 海淀",
    salary_range: "22-38K · 14薪",
    description:
      "抖音商业化业务分析。1. 跟踪广告主结构、ARPU、ROI 等核心指标，定期输出诊断报告；2. 配合销售、行业、产品做客户分层与策略建议；3. 搭建分析看板与指标体系。要求：1-3 年互联网商业分析/数据分析经验，应届顶尖院校经管/统计/金融可投；熟练 SQL + Excel/Tableau；具备结构化思考与表达能力。",
    source_name: "小红书",
    posted_days_ago: 1,
    tags: ["商业分析", "广告", "字节"],
  },
  {
    company: "美团",
    title: "数据分析师 - 美团到家",
    category: "internet",
    subcategory: "analytics",
    location: "上海 / 闵行",
    salary_range: "20-32K · 16薪",
    description:
      "美团到家业务分析团队。1. 围绕履约、骑手、商家、用户多视角输出业务洞察；2. 主导专题分析（如骑手运力调度、用户复购漏斗）；3. 搭建业务监控看板。要求：本科及以上，统计/经济/数学/计算机相关专业；熟练 SQL；有 Python/R 经验加分；1-3 年互联网数分经验或优秀应届。",
    source_name: "小红书",
    posted_days_ago: 2,
    tags: ["数据分析", "本地生活", "美团"],
  },
  {
    company: "小红书",
    title: "策略分析师 - 增长团队",
    category: "internet",
    subcategory: "analytics",
    location: "上海 / 静安",
    salary_range: "25-40K · 16薪",
    description:
      "增长策略分析。1. 拆解新用户从激活到留存的全链路，定位关键节点机会；2. 主导 AB 实验设计、归因与复盘；3. 输出策略建议并推进产品/运营落地。要求：1-3 年增长/策略分析经验；熟练 SQL；具备较强的逻辑与方案 sell-in 能力；咨询/投行/快消管培背景加分。",
    source_name: "小红书",
    posted_days_ago: 3,
    tags: ["策略", "增长", "小红书"],
  },
  {
    company: "京东",
    title: "数据分析师 - 京东超市",
    category: "internet",
    subcategory: "analytics",
    location: "北京 / 亦庄",
    salary_range: "18-28K · 14薪",
    description:
      "京东超市快消品类分析。1. 跟踪品类 GMV、毛利、库存周转等核心指标；2. 配合采销做选品、定价、促销分析；3. 搭建品类经营看板。要求：本科及以上，统计/经济/经管相关专业；熟练 SQL/Excel；快消行业实习或经验加分；1-3 年经验或优秀应届。",
    source_name: "小红书",
    posted_days_ago: 4,
    tags: ["数据分析", "电商", "京东"],
  },

  // ============================================================
  // AI 初创 (7) — 偏产品/运营/商业化
  // ============================================================
  {
    company: "月之暗面 Moonshot AI",
    title: "产品经理 - Kimi C 端",
    category: "ai_startup",
    subcategory: "product",
    location: "北京 / 朝阳",
    salary_range: "30-50K · 14薪",
    description:
      "Kimi 智能助手 C 端产品。1. 主导 Kimi 在搜索、写作、阅读、学习等场景的功能规划；2. 与算法团队定义模型能力边界与产品形态；3. 通过数据驱动持续优化 DAU、留存、付费转化；4. 与运营、增长、市场协同。要求：1-4 年互联网产品经验，应届优秀候选人可投；商科/经管/CS 不限；自己是 Kimi 重度用户、对 LLM 产品有思考者优先。",
    source_name: "小红书",
    posted_days_ago: 1,
    tags: ["AI", "C端", "Kimi"],
  },
  {
    company: "MiniMax",
    title: "用户运营 - 海螺 AI",
    category: "ai_startup",
    subcategory: "operations",
    location: "上海 / 徐汇",
    salary_range: "18-30K · 13薪",
    description:
      "海螺 AI 产品运营。1. 负责海螺 AI 用户增长、活跃、留存运营策略落地；2. 深度参与产品迭代，从运营视角提需求；3. 策划新功能上线、活动、案例征集等动作；4. 跟踪数据复盘，输出可复用方法论。要求：1-3 年互联网/AI 产品运营经验；对 AI 行业有热情；文案能力强；商科/中文/新闻传播专业优先。",
    source_name: "小红书",
    posted_days_ago: 2,
    tags: ["AI", "运营", "海螺"],
  },
  {
    company: "智谱 AI",
    title: "商业化运营 - 开放平台",
    category: "ai_startup",
    subcategory: "operations",
    location: "北京 / 海淀",
    salary_range: "20-32K",
    description:
      "智谱开放平台商业化。1. 跟进 KA 客户的接入、使用、续费全流程；2. 输出行业解决方案与案例；3. 协调销售、产品、研发资源推进客户成功。要求：2-4 年 SaaS/云服务/B 端运营经验；商科背景优先；英语良好可加分。",
    source_name: "小红书",
    posted_days_ago: 3,
    tags: ["B端", "商业化", "智谱"],
  },
  {
    company: "百川智能",
    title: "增长产品经理",
    category: "ai_startup",
    subcategory: "product",
    location: "北京 / 朝阳",
    salary_range: "30-50K",
    description:
      "Baichuan 应用层产品。1. 负责 C 端拉新、激活、留存全链路设计；2. 与算法、运营、市场协同搭建增长循环；3. 通过 AB 实验持续优化漏斗。要求：2-4 年互联网增长产品经验；具备扎实的数据 sense 与实验设计能力；商科或 CS 背景皆可。",
    source_name: "小红书",
    posted_days_ago: 4,
    tags: ["增长", "AI应用", "百川"],
  },
  {
    company: "阶跃星辰 StepFun",
    title: "市场经理 - 内容与 BD",
    category: "ai_startup",
    subcategory: "market",
    location: "上海 / 长宁",
    salary_range: "22-35K",
    description:
      "Step-Video 市场。1. 策划与执行 AIGC 视频产品的发布、内容投放、社交媒体运营；2. 联合外部创作者、IP 方完成 co-marketing；3. 跟踪品牌声量与用户转化。要求：3-5 年 TMT 行业市场/PR 经验；熟悉小红书、抖音、X 等内容生态；具备较强的文案与项目管理能力。",
    source_name: "小红书",
    posted_days_ago: 2,
    tags: ["AIGC", "市场", "阶跃"],
  },
  {
    company: "零一万物 01.AI",
    title: "解决方案经理 - 行业落地",
    category: "ai_startup",
    subcategory: "strategy",
    location: "北京 / 海淀",
    salary_range: "25-40K",
    description:
      "Yi 大模型行业方案团队。1. 与销售一同走访金融、政企、零售客户，定义需求；2. 输出可落地的解决方案 + 商务报价；3. 反哺产品需求。要求：3-5 年 SaaS/咨询/集成商客户经理经验；商科/咨询背景优先；具备扎实的客户沟通和方案撰写能力。",
    source_name: "小红书",
    posted_days_ago: 3,
    tags: ["B端", "解决方案", "零一万物"],
  },
  {
    company: "生数科技 Shengshu",
    title: "产品运营 - Vidu",
    category: "ai_startup",
    subcategory: "operations",
    location: "北京 / 海淀",
    salary_range: "20-30K",
    description:
      "Vidu 图像/视频产品运营。1. 负责 Vidu 在创意设计、营销素材、社交内容方向的运营策略；2. 与创作者社区互动，沉淀优质 case；3. 数据驱动持续优化付费转化。要求：1-3 年内容/工具产品运营经验；对设计/创意有审美与判断；商科/设计/传媒背景优先。",
    source_name: "小红书",
    posted_days_ago: 4,
    tags: ["AIGC", "运营", "Vidu"],
  },

  // ============================================================
  // 其他 (5) — 消费/快消/咨询/MCN/跨境
  // ============================================================
  {
    company: "宝洁 P&G",
    title: "品牌助理 - Olay",
    category: "other",
    subcategory: "market",
    location: "广州 / 黄埔",
    salary_range: "15-22K · 14薪",
    description:
      "Olay 品牌团队。1. 协助品牌经理制定年度 marketing plan、新品上市策略；2. 跟进电商平台（天猫、抖音、京东）日常运营与大促节奏；3. 协调创意代理、媒介、电商团队执行。要求：本科及以上，市场营销/工商管理/传播专业优先；1-3 年快消品牌经验或顶尖院校应届；英语良好；具备扎实的数据 sense 与文案能力。",
    source_name: "小红书",
    posted_days_ago: 1,
    tags: ["快消", "品牌", "宝洁"],
  },
  {
    company: "麦肯锡 McKinsey",
    title: "Business Analyst - 大中华区",
    category: "other",
    subcategory: "strategy",
    location: "上海 / 静安",
    salary_range: "面议 (Top tier)",
    description:
      "麦肯锡大中华区 BA。1. 参与战略、运营、数字化等多类型项目；2. 主导细分模块的研究、建模、客户沟通；3. 在 3-4 人小团队中与 EM / Partner 协作。要求：顶尖院校本硕，GPA 3.6+/85+；商科/经济/工程/数学/物理皆可；优秀的结构化思维、英文表达、PowerPoint/Excel；2-4 年咨询/投行经验或顶尖应届。",
    source_name: "小红书",
    posted_days_ago: 2,
    tags: ["咨询", "战略", "麦肯锡"],
  },
  {
    company: "SHEIN",
    title: "跨境电商运营 - 北美市场",
    category: "other",
    subcategory: "operations",
    location: "广州 / 番禺",
    salary_range: "18-30K · 14薪",
    description:
      "SHEIN 北美站点运营。1. 负责服饰品类在北美站点的选品、上架、定价、广告投放；2. 跟踪转化、退货率、毛利等核心指标；3. 与采销、供应链、客服协同。要求：1-3 年跨境电商/亚马逊/独立站运营经验；英语良好（CET-6 / 雅思 6.5+）；商科/英语/国际贸易专业优先；能接受跨时区沟通。",
    source_name: "小红书",
    posted_days_ago: 3,
    tags: ["跨境", "电商", "SHEIN"],
  },
  {
    company: "无忧传媒",
    title: "MCN 运营 - 达人孵化",
    category: "other",
    subcategory: "operations",
    location: "杭州 / 余杭",
    salary_range: "12-20K + 项目分成",
    description:
      "MCN 达人孵化团队。1. 对接抖音/小红书/B 站签约达人，制定个人 IP 成长路径；2. 协调内容、商务、运营资源完成涨粉与变现目标；3. 参与新人达人面试与签约。要求：1-3 年 MCN/内容/经纪相关经验；自己有运营账号经验加分；具备较强的同理心与抗压能力；专业不限。",
    source_name: "小红书",
    posted_days_ago: 4,
    tags: ["MCN", "达人", "运营"],
  },
  {
    company: "喜茶 HEYTEA",
    title: "门店产品经理 - 数字化运营",
    category: "other",
    subcategory: "product",
    location: "深圳 / 南山",
    salary_range: "18-28K · 14薪",
    description:
      "喜茶门店数字化产品。1. 负责门店 POS、点单小程序、私域会员等系统的产品规划；2. 走访门店一线，理解店员与顾客痛点；3. 与 IT、市场、运营协同推进落地。要求：1-3 年新零售/数字化产品经验；商科/工管/CS 不限；对线下门店运营有兴趣；能接受频繁出差门店。",
    source_name: "小红书",
    posted_days_ago: 5,
    tags: ["新茶饮", "门店", "喜茶"],
  },
];

const seedApplications: Array<{
  company: string;
  title: string;
  applied_days_ago: number;
  status: string;
  notes: string;
  jd_url?: string;
}> = [
  {
    company: "字节跳动",
    title: "产品经理 - 抖音电商",
    applied_days_ago: 14,
    status: "interviewing",
    notes: "二面已过，下周三面，准备一份抖音电商商家侧 case 分析。",
  },
  {
    company: "小红书",
    title: "社区产品经理 - 创作者增长",
    applied_days_ago: 9,
    status: "interviewing",
    notes: "一面 HR 完成，待业务一面通知，预计本周五前。",
  },
  {
    company: "麦肯锡 McKinsey",
    title: "Business Analyst - 大中华区",
    applied_days_ago: 4,
    status: "applied",
    notes: "通过校友内推提交，等待 PST 邀约。",
  },
  {
    company: "宝洁 P&G",
    title: "品牌助理 - Olay",
    applied_days_ago: 18,
    status: "offer",
    notes: "已发 offer，月薪 18K，正在跟字节比较。",
  },
  {
    company: "美团",
    title: "活动运营 - 美团外卖",
    applied_days_ago: 22,
    status: "rejected",
    notes: "终面后两周被告知 hc 取消，留 talent pool。",
  },
];

export function seedIfEmpty() {
  const existingJobs = db.select().from(jobs).all();
  if (existingJobs.length === 0) {
    console.log("[seed] inserting jobs...");
    for (const j of seedJobs) {
      const posted = d(j.posted_days_ago);
      db.insert(jobs)
        .values({
          company: j.company,
          title: j.title,
          category: j.category,
          subcategory: j.subcategory,
          location: j.location,
          salary_range: j.salary_range,
          description: j.description,
          source_url: j.source_url || "",
          source_name: j.source_name || "小红书",
          posted_at: posted,
          scraped_at: now,
          tags: JSON.stringify(j.tags),
        })
        .run();
    }
    console.log(`[seed] inserted ${seedJobs.length} jobs`);
  }

  const existingApps = db.select().from(applications).all();
  if (existingApps.length === 0) {
    console.log("[seed] inserting applications...");
    for (const a of seedApplications) {
      const appliedAt = d(a.applied_days_ago);
      // For seeded apps, synthesize a small history so the timeline feels real.
      const events: any[] = [
        { at: appliedAt, kind: "created", to: "applied" },
      ];
      if (a.status !== "applied") {
        // pretend the status changed roughly halfway between applied_at and now
        events.push({
          at: appliedAt + Math.floor((Date.now() - appliedAt) / 2),
          kind: "status",
          from: "applied",
          to: a.status,
        });
      }
      db.insert(applications)
        .values({
          job_id: null,
          company: a.company,
          title: a.title,
          applied_at: appliedAt,
          status: a.status,
          notes: a.notes,
          jd_url: a.jd_url || "",
          events: JSON.stringify(events),
        })
        .run();
    }
    console.log(`[seed] inserted ${seedApplications.length} applications`);
  }

  // ===== 演示复盘 =====
  const existingReviews = db.select().from(interviewReviews).all();
  const hasDemoReview = existingReviews.some((r) => r.audio_filename === "__demo__");
  if (!hasDemoReview) {
    console.log("[seed] inserting demo interview review...");
    db.insert(interviewReviews)
      .values({
        job_id: null,
        company: "某 FMCG 头部公司【演示】",
        title: "销售管培生 - 初面",
        audio_filename: "__demo__",
        interview_date: d(3),
        duration_sec: 1831,
        transcript: "【演示复盘】此为产品内置的示例复盘，转录文本已隐去，仅保留 AI 复盘报告以展示完整效果。面试包含 6 个问题，涵盖英文自我介绍、简历追问、职业选择、骄傲事件、复赛复盘等销售岗常见考查点，总时长约 30 分钟。",
        report_json: JSON.stringify({
          questions: [
            {
              question: "用英文做自我介绍",
              my_answer: "介绍了教育背景、选择该公司原因、实习经历及离职全职工作的经历",
              score: 3,
              comment: "英文表达基本流畅，但多次出现停顿和「uh」「um」，逻辑线相对完整但缺乏亮点，未能体现销售岗位所需的说服力和感染力",
              improvement: "下次可以这样优化：1）用「3 个关键词」串联自我介绍（如 Analytical, Resilient, Growth-minded），每个词用 1 个具体成果支撑；2）开头用「hook」吸引注意力，如「I thrive in challenging environments — that's why I chose to restart my career」；3）减少停顿，提前录音演练 3 遍以上确保流畅度",
            },
            {
              question: "为什么简历上传的版本没有更新？某券商实习时间线对不上",
              my_answer: "解释是去年秋招上传的简历，后来有更新但附件未重新上传",
              score: 2,
              comment: "回答显得被动且混乱，多次解释时间线仍未能让面试官完全理解，暴露了准备不足和对申请系统不熟悉的问题",
              improvement: "下次遇到简历疑问应主动承担责任：「非常抱歉，我应该在提交前再次检查附件版本。目前最新情况是：25 年 6 月毕业后在国企工作半年，12 月离职，现在全力准备重新求职。我可以会后立即补发最新简历。」——先道歉、再澄清事实、最后给解决方案，不要反复纠缠时间线细节",
            },
            {
              question: "为什么毕业时选择去国企，后来又离开？",
              my_answer: "券商实习未留用，秋招后期投递国企，以为是市场化培养，入职后发现不符合预期",
              score: 3,
              comment: "解释了客观原因但篇幅过长且显得抱怨，未能突出「主动选择」和「快速迭代认知」的积极面，对销售岗需要的 resilience 和 ownership 展现不足",
              improvement: "下次可以用「3 段式」精简回答：1）「券商未留用让我快速调整，抓住了国企 offer」（体现应变）；2）「入职后发现节奏与预期不符，我希望在高强度环境中快速成长」（体现目标清晰）；3）「这段经历让我更确认贵公司这类培养体系完善的快消企业是我的最佳选择」（呼应岗位）。控制在 1 分钟内，不展开细节",
            },
            {
              question: "举例说明你付出很多努力并取得骄傲成果的一件事",
              my_answer: "讲述了参加某银行 Fintech 产品训练营，在零基础、时间紧的情况下完成 PPT 并进入复赛前 200 名",
              score: 4,
              comment: "故事完整且有挑战性，时间管理和框架思维体现较好，但未能突出「销售岗核心能力」（如说服力、客户导向、团队协作），且讲述过程略显冗长",
              improvement: "下次讲这个故事可以增加「影响他人」的元素：比如「我主动联系 3 位往届学员，用 15 分钟电话快速提取他们的核心经验，这让我避免了 XX 弯路」，或「我的 PPT 被导师转发给其他 50 位参赛者作为参考」——销售岗要展现「借力」和「影响力」，不只是「自己苦干」",
            },
            {
              question: "你觉得能进入复赛的最重要三点原因是什么？",
              my_answer: "框架完整、PPT 格式美观、咨询了外部资源",
              score: 3,
              comment: "回答了面试官的问题但缺乏深度，「PPT 漂亮」这类表面原因不足以支撑「骄傲成果」的分量，未能展现对业务本质的洞察",
              improvement: "下次可以这样深挖：1）「需求分析部分我做了 XX 细分人群的痛点对比，这可能是评委看重的差异化」；2）「功能设计虽然原型图简单，但我用数据支撑了优先级排序逻辑」；3）「推广方案我结合了现有渠道资源，可落地性强」——用「内容深度」而非「形式」来解释成功原因",
            },
            {
              question: "复赛面试未通过，你复盘的改进点是什么？如果重来一次会怎么做？",
              my_answer: "认为是产品经验不足，如果重来会提前学习原型图设计和产品框架",
              score: 2,
              comment: "复盘停留在「技能准备」层面，未能识别面试沟通中的真正问题（如如何在无作品讨论的情况下展现产品思维），且承认「自己也满意面试表现」说明缺乏自我反思的深度",
              improvement: "下次遇到类似问题可以这样回答：「我复盘后发现，面试官没问作品可能是在考察我的思维方式而非作品本身。我应该主动用 STAR 结构举例：如何拆解需求→如何做取舍→如何验证假设，而不是等他问。另外我会准备 3 个「产品思维」的小故事，比如观察到某个 APP 的 XX 功能设计很巧妙，我会怎么改进」——展现「从失败中快速迭代认知」的能力",
            },
          ],
          follow_ups: [
            {
              question: "简历版本混乱、时间线对不上的反复追问",
              competency: "细节把控与职业严谨度",
              note: "面试官多次追问说明对准备度存疑。建议：面试前 48 小时再次核对所有提交材料，准备一份「关键事实清单」（时间、公司、职位、成果），避免现场回忆出错。销售岗尤其看重「靠谱」，细节失误会放大信任问题",
            },
            {
              question: "为什么选国企、为什么离开、心路历程的多次深挖",
              competency: "职业规划清晰度与决策逻辑",
              note: "面试官想确认你是否是「盲目试错」还是「有策略调整」。建议：准备「职业选择决策树」，每个关键节点用 1-2 句话说清「当时基于什么信息做的决策」+「获得了什么新认知」+「如何指导下一步」，体现 learning agility 而非被动漂泊",
            },
            {
              question: "骄傲事件的深挖：为什么成功、为什么失败、如何改进",
              competency: "结果导向思维与复盘能力",
              note: "面试官不满足于「做了什么」，更想知道「为什么这样做有效」和「失败后如何迭代」。建议：准备每个故事时，提前写下「成功的 3 个关键动作」和「如果重来会改变的 2 个地方」，展现 owner mindset 和持续改进意识",
            },
          ],
          summary: {
            strengths: [
              "抗压能力强，能在高压、时间紧的情况下完成任务（Fintech 训练营案例）",
              "有主动学习意识，会借助外部资源（购买资料、咨询学姐）",
              "对自身职业发展有清晰认知，能主动做出调整（离开国企寻求更快成长）",
              "英文表达基本达标，能完成自我介绍",
            ],
            weaknesses: [
              "面试准备不足，简历版本混乱导致被反复追问，损害专业形象",
              "故事讲述冗长且缺乏销售岗位相关性，未能突出说服力、客户导向等核心能力",
              "复盘深度不够，停留在表面归因（如「PPT 漂亮」「经验不足」），缺乏对底层逻辑的洞察",
              "回答问题时容易陷入细节解释，未能快速抓住面试官真正关心的点",
            ],
            lessons: [
              "面试前必须再次核对所有提交材料，准备「关键事实清单」应对可能的细节追问，销售岗对「靠谱」的要求极高",
              "准备案例时要「以终为始」，先想清楚这个岗位看重什么能力（销售岗 = 影响力+结果导向+客户思维），再倒推如何讲故事，避免无关细节",
              "每个故事必须准备「3 层回答」：第 1 层是事实（做了什么），第 2 层是洞察（为什么有效），第 3 层是迁移（如何用到新岗位），应对面试官的连续深挖",
              "遇到职业选择类问题，少解释客观困难，多强调「我从中学到了什么」和「这如何让我更适合你们」，把被动经历转化为主动成长",
            ],
          },
        }),
        user_notes: "【演示复盘】这是一份预设示例，展示 OfferGo 的 AI 复盘能力。真实使用中，上传面试录音后会自动生成类似结构的复盘报告。",
        status: "done",
        error_message: "",
        created_at: d(3),
      })
      .run();
    console.log("[seed] inserted demo interview review");
  }
}
