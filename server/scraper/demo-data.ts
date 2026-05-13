// 演示模式预置岗位 —— 用于无需扫码、无需访问小红书的演示采集
// 这些数据看起来跟真采集结果一样：含 JD 原文、description、来源 URL、标签等
// 模拟一次「关键词搜索 → 解析 → 入库」的完整流程。

export type DemoJobBundle = {
  // 模拟过滤前的总解析量
  totalParsed: number;
  // 真正入库的岗位
  jobs: Array<{
    company: string;
    title: string;
    location: string;
    salary_range: string;
    description: string;
    jd_raw: string;
    tags: string[];
    source_name: string;
    source_url: string;
    note_author: string;
    category: string;
    subcategory: string;
  }>;
};

export const DEMO_BUNDLES: Record<string, DemoJobBundle> = {
  // 互联网 · 产品
  "internet:product": {
    totalParsed: 28,
    jobs: [
      {
        company: "蚂蚁集团",
        title: "高级产品经理 - 支付宝商家增长",
        location: "杭州",
        salary_range: "35-55K · 16薪",
        description:
          "负责支付宝商家侧增长产品。从商户洞察出发，设计开店引导、运营工具、佣金激励等核心链路，与运营/算法/前后端紧密协作。",
        jd_raw:
          "【岗位】高级产品经理 - 支付宝商家增长\n【部门】支付宝事业群 · 商家平台\n【职责】\n1. 负责商家入驻、首单、复购等核心增长链路的产品设计\n2. 通过数据洞察识别增长机会，设计 A/B 实验验证假设\n3. 与运营、算法、技术团队协作落地，对核心 KPI 负责\n【要求】\n1. 5 年以上 C 端或 B 端产品经验，互联网大厂优先\n2. 数据驱动思维，熟悉增长方法论\n3. 优秀的跨团队协作能力\n【投递】简历发送至 alipay-pm@antgroup.com，标题注明【岗位+姓名】",
        tags: ["大厂", "增长", "B 端"],
        source_name: "小红书",
        source_url: "https://www.xiaohongshu.com/explore/demo-001",
        note_author: "蚂蚁招聘官",
        category: "internet",
        subcategory: "product",
      },
      {
        company: "拼多多",
        title: "产品经理 - Temu 海外履约",
        location: "上海",
        salary_range: "30-50K · 14薪",
        description:
          "Temu 海外业务履约方向，负责跨境物流时效、关务、海外仓产品规划。直面海外用户体验问题，需要快速试错、快速迭代。",
        jd_raw:
          "【岗位】Temu 海外履约产品经理\n【职责】\n1. 跨境物流时效产品规划：链路追踪、异常处理、预估时效\n2. 海外仓与本地配送资源接入与策略产品\n3. 协同业务和供应链落地履约改善项目\n【要求】\n1. 3 年以上产品经验，物流/跨境/B 端方向加分\n2. 接受高强度工作节奏\n3. 英文工作能力\n【内推码】XX8K7P · 简历直发 hr-temu@pinduoduo.com",
        tags: ["跨境", "物流", "高强度"],
        source_name: "小红书",
        source_url: "https://www.xiaohongshu.com/explore/demo-002",
        note_author: "PDD 内推 Jenny",
        category: "internet",
        subcategory: "product",
      },
      {
        company: "美团",
        title: "产品经理 - 优选社区团购供应链",
        location: "北京",
        salary_range: "25-40K · 15薪",
        description:
          "美团优选供应链中后台产品，覆盖商品池、采购、调拨、损耗管理。直接对接业务一线，推动 SOP 与系统改造。",
        jd_raw:
          "【岗位】优选供应链产品经理\n【职责】\n1. 商品池、采购计划、品控等供应链系统设计\n2. 分析业务痛点，输出产品方案并推动落地\n【要求】\n1. 3-5 年 B 端/供应链产品经验\n2. SQL 取数能力\n【投递】jianliu@meituan.com",
        tags: ["B 端", "供应链", "中台"],
        source_name: "小红书",
        source_url: "https://www.xiaohongshu.com/explore/demo-003",
        note_author: "美团内推",
        category: "internet",
        subcategory: "product",
      },
    ],
  },
  // 互联网 · 运营
  "internet:operations": {
    totalParsed: 25,
    jobs: [
      {
        company: "小红书",
        title: "用户运营 - 新用户冷启动",
        location: "上海",
        salary_range: "20-32K · 13薪",
        description:
          "负责小红书新用户首日激活策略，从 push、签到、任务体系切入，提升 D1/D7 留存。需要快速搭实验、用数据决策。",
        jd_raw:
          "【岗位】新用户运营 · 冷启动方向\n【职责】\n1. 新人首日激活产品&运营策略设计与落地\n2. push 文案、签到任务、新手任务体系迭代\n3. AB 实验设计，指标拆解归因\n【要求】\n1. 2-4 年用户运营经验\n2. 喜欢用数据说话\n【投递】lin.zhao@xiaohongshu.com",
        tags: ["用户运营", "增长", "数据驱动"],
        source_name: "小红书",
        source_url: "https://www.xiaohongshu.com/explore/demo-004",
        note_author: "小红书招聘",
        category: "internet",
        subcategory: "operations",
      },
      {
        company: "B 站 哔哩哔哩",
        title: "内容运营 - UP 主孵化",
        location: "上海",
        salary_range: "18-28K · 14薪",
        description:
          "负责中腰部 UP 主孵化策略，对接 PUGV 创作者池。需要懂内容、懂数据、懂创作者心理。",
        jd_raw:
          "【岗位】UP 主内容运营\n【职责】\n1. 中腰部 UP 主孵化体系搭建（赛道选品、流量扶持、商业化引导）\n2. 创作者沟通与活动策划\n【要求】\n1. 3 年以上内容/创作者运营经验\n2. 长期看 B 站，懂二次元/知识区/生活区任一垂类\n【投递】content-hr@bilibili.com",
        tags: ["内容运营", "创作者", "PUGV"],
        source_name: "小红书",
        source_url: "https://www.xiaohongshu.com/explore/demo-005",
        note_author: "B 站 HR",
        category: "internet",
        subcategory: "operations",
      },
    ],
  },
  // 互联网 · 数据分析
  "internet:analytics": {
    totalParsed: 22,
    jobs: [
      {
        company: "字节跳动",
        title: "数据分析师 - 抖音商业化",
        location: "北京",
        salary_range: "28-45K · 14薪",
        description:
          "服务于抖音广告业务，负责广告主诊断、投放策略分析、归因模型迭代。",
        jd_raw:
          "【岗位】数据分析师 - 商业化\n【职责】\n1. 抖音广告核心指标监控与异动分析\n2. 广告主全链路诊断模型建设\n3. 与算法、产品共建增长实验\n【要求】\n1. 3 年以上互联网数据分析经验\n2. SQL/Python 熟练，统计学背景加分\n【投递】data-ads@bytedance.com",
        tags: ["大厂", "商业化", "归因"],
        source_name: "小红书",
        source_url: "https://www.xiaohongshu.com/explore/demo-006",
        note_author: "字节内推老王",
        category: "internet",
        subcategory: "analytics",
      },
      {
        company: "腾讯",
        title: "商业分析师 - 视频号生态",
        location: "深圳",
        salary_range: "25-40K · 16薪",
        description:
          "围绕视频号生态做战略分析与业务诊断，输出洞察与决策建议给业务一号位。",
        jd_raw:
          "【岗位】商业分析师 · 视频号\n【职责】\n1. 视频号关键业务指标体系搭建与持续洞察\n2. 行业 benchmark 研究，输出战略 brief\n3. 与产品/运营/算法共建增长项目\n【要求】\n1. 顶尖咨询/投行/大厂 BA 背景，3-5 年经验\n2. 英文工作语言流利\n【投递】video-ba@tencent.com",
        tags: ["大厂", "战略", "BA"],
        source_name: "小红书",
        source_url: "https://www.xiaohongshu.com/explore/demo-007",
        note_author: "腾讯招聘",
        category: "internet",
        subcategory: "analytics",
      },
    ],
  },
  // AI 初创
  ai_startup: {
    totalParsed: 19,
    jobs: [
      {
        company: "Moonshot AI",
        title: "产品经理 - Kimi C 端体验",
        location: "北京",
        salary_range: "40-70K · 14薪",
        description:
          "Kimi C 端产品方向，主导对话体验、长上下文交互、多模态产品迭代。直面用户、节奏快、放权大。",
        jd_raw:
          "【岗位】产品经理 - Kimi C 端\n【职责】\n1. Kimi 对话与多模态交互体验产品规划\n2. 用户研究 → 产品方案 → 实验验证全链路负责\n3. 与模型、算法、设计紧密协作\n【要求】\n1. 3-5 年 C 端产品经验，做过 AI/Chatbot 加分\n2. 对 LLM 有深度使用与理解\n3. 节奏快，扛得住高强度\n【投递】talent@moonshot.cn · 标题【Kimi PM + 姓名】",
        tags: ["AI 初创", "Kimi", "C 端"],
        source_name: "小红书",
        source_url: "https://www.xiaohongshu.com/explore/demo-008",
        note_author: "月之暗面招聘",
        category: "ai_startup",
        subcategory: "",
      },
      {
        company: "智谱 AI",
        title: "产品经理 - GLM 开发者生态",
        location: "北京",
        salary_range: "35-60K · 13薪",
        description:
          "智谱开放平台产品，面向 B 端开发者，负责模型 API、Agent 平台、企业方案的产品迭代。",
        jd_raw:
          "【岗位】产品经理 - 开发者生态\n【职责】\n1. 智谱开放平台产品规划：API、SDK、Agent 工具链\n2. 与开发者深度沟通，沉淀客户场景\n3. 推动产品在 B 端客户落地\n【要求】\n1. 3 年以上 B 端/PaaS 产品经验\n2. 对 LLM/Agent 有实践理解\n3. 技术背景加分\n【投递】hire@zhipuai.cn",
        tags: ["AI 初创", "B 端", "开发者"],
        source_name: "小红书",
        source_url: "https://www.xiaohongshu.com/explore/demo-009",
        note_author: "智谱 HR",
        category: "ai_startup",
        subcategory: "",
      },
      {
        company: "MiniMax",
        title: "产品经理 - 海螺 AI 出海",
        location: "上海",
        salary_range: "40-65K · 14薪",
        description:
          "海螺 AI 海外版本产品负责人，覆盖语音/视频生成等核心能力的海外用户体验设计。要求英文工作能力。",
        jd_raw:
          "【岗位】PM - 海螺 AI 出海\n【职责】\n1. 海螺海外产品规划与本地化\n2. 主导多模态生成体验在海外用户场景落地\n【要求】\n1. 出海产品经验 2 年以上\n2. 英文工作语言\n3. 对 GenAI 有热情\n【投递】overseas@minimaxi.com",
        tags: ["AI 初创", "出海", "多模态"],
        source_name: "小红书",
        source_url: "https://www.xiaohongshu.com/explore/demo-010",
        note_author: "MiniMax 招聘",
        category: "ai_startup",
        subcategory: "",
      },
    ],
  },
};

export function getDemoBundle(
  category: string,
  subcategory: string,
): DemoJobBundle {
  const key = subcategory ? `${category}:${subcategory}` : category;
  return DEMO_BUNDLES[key] || DEMO_BUNDLES["ai_startup"];
}
