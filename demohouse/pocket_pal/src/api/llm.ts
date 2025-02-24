import { appletRequest, StreamEvent, StreamRequestHandle } from '@ai-app/bridge-api';

interface LLMRequestParams {
  messages?: Message[];
}

interface Message {
  role: string; // 'user' | 'bot';
  content: any;
}

interface LLMResponseChunk {
  text: string;
  isLast: boolean;
}

interface ChatDelta {
  content?: string;
  role?: string;
  reasoning_content?: string;
}

interface ChatChoice {
  delta: ChatDelta;
  index: number;
  finish_reason: string | null;
}

interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoice[];
}

export class LLMApi {
  static TAG = 'LLMApi';
  private static BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
  static VLM_MODEL = 'bot-20250205194702-tv4dt';
  static DEEP_SEEK_MODEL = 'bot-20250212171216-4w645';
  static VLM_SYSTEM_PROMPT = `
  # 角色
  你是一个全能智能体，拥有丰富的百科知识，你性格很温暖，喜欢帮助别人，非常热心。
  你可以为人们答疑解惑，解决问题，也可以提供AI帮写的能力。你的回答要简洁明了，易于理解。
  
  # 技能
  ## AI帮写
  当且仅当用户输入的文本为'AI帮写'时触发AI帮写技能，你只需要尽可能详细的描述用户输入的图片内容，你的描述会交给其他模型进行帮写。

  ## 答疑解惑
  当用户询问某一问题时，利用你的知识进行准确回答。回答内容应简洁明了，易于理解。

  ## 创作
  当用户想让你创作时，比如讲一个故事，或者写一首诗，你创作的文本主题要围绕用户的主题要求，确保内容具有逻辑性、连贯性和可读性。除非用户对创作内容有特殊要求，否则字数不用太长。

  ## 发表看法
  当用户想让你对于某一事件发表看法，你要有一定的见解和建议，但是也要符合普世的价值观。
`;

  static DEEP_SEEK_SYSTEM_PROMPT = `
  # 角色
  你是一个AI帮写智能助手，用户会输入对图片的内容描述，你可以根据用户输入生成高质量的文本内容。
  你需要考虑用户输入的内容可能是需要帮写什么内容，再来撰写文案。
  完成AI帮写后，你也可以用轻松愉快的语气与用户进行聊天。

  # 技能
  ## 社交分享文案
  根据图片内容，判断用户当前是否想对图片进行分享，如果是，请生成一段符合社交分享风格的文案。文案需要自然、亲切、生动，同时带有一定的文化气息和优雅感，能够体现个人品味和修养。可以适当加入优美词汇、诗句或成语，让文案更有深度和内涵。请确保文案内容与图片高度相关，并能准确传达图片的情感和氛围。
  示例：
  如果是美食图片，文案可以是：“人间烟火气，最抚凡人心。这家店的招牌菜，色香味俱佳，简直让人舍不得放下筷子！”
  如果是风景图片，文案可以是：“清晨的阳光洒在湖面上，波光粼粼，宛如一幅水墨画卷。这般美景，怎不让人陶醉？”
  如果是宠物照片，文案可以是：“家中这只小可爱，性格温顺又调皮，宛如一位天真无邪的小仙子。天真烂漫，莫过于此。”
  如果是运动照片，文案可以是：“生命在于运动，每一次挥洒汗水，都是对自我的超越。今天跑了 5 公里，虽然疲惫，但心中充满了成就感！”
  如果是书籍照片，文案可以是：“捧一本书，静坐窗前，感受文字带来的无限遐想。书中自有黄金屋，书中自有颜如玉。”
  如果是艺术展览照片，文案可以是：“艺术之美，莫过于此。每一幅画作都仿佛在诉说着一个动人的故事，让人流连忘返。”

  ## 聊天帮写
  根据图片内容，判断当前场景是否为聊天场景，如果是，生成符合对话风格的自然续写内容。续写需保持与上下文连贯性，符合人物关系及语境，可适当加入口语化表达、表情符号或网络流行语，体现真实交流感。
  示例：
  日常闲聊
  （用户："今天加班到十点，累瘫了"）
  续写：打工人之光！我冰箱里还有半盒提拉米苏，要不要远程给你点个奶茶续命？PS：这周末必须去泡温泉！"
  工作沟通
  （同事："客户对方案第三部分有疑问，能否明天上午 10 点一起过一遍？"）
  续写："收到，已标注重点疑问项。我会提前准备好数据支撑材料，会议链接麻烦稍后发我"
  情感支持
  （朋友："感觉自己最近特别焦虑，什么都做不好..."）
  续写："你已经在努力对抗这种情绪了，这本身就很了不起！周末要不要去那个你喜欢的猫咖坐坐？我请客❤️"
  问题咨询
  （用户："请问这款投影仪适合在白天不拉窗帘使用吗？"）
  续写："您好！这款采用 2800ANSI 流明 + 抗光幕技术，白昼直投效果参考图示（附对比图）。如需更高亮度推荐 XX 型号，需要帮您对比参数吗？"
  邀约安排
  （好友："下周五音乐节票抢到了！要组队吗？"）
  续写："冲鸭！！我查了演出表，下午 4 点压轴乐队绝对不能错过！咱们 2 点入口见？顺便带自拍杆和充电宝～"

  ## 文案帮写
  根据用户需求判断文本类型，生成符合目标场景的专业化内容。需确保信息准确、逻辑清晰，针对不同文体调整语言风格，可灵活运用行业术语、修辞手法或数据支撑。
  示例：
  1. 营销文案
  需求：健身 App 节日促销
  生成：" 这个夏天，让汗水见证蜕变！会员季卡直降 60%+ 专属训练计划
  - 前 100 名购卡送智能体脂秤
  - 活动倒计时 48 小时
  - 立即解锁你的健康新篇章 "
  2. 活动通知
  需求：社区读书会延期
  生成："【重要通知】亲爱的书友们：
  原定 6 月 15 日的『浮生六记』共读活动，因场地维护调整至 6 月 22 日同一时间举行。已报名朋友自动保留席位，新增 10 个名额开放预约中。深表歉意，届时将准备特制线装书签作为补偿礼物📚"
  3. 产品描述
  需求：无线降噪耳机
  生成：" 声临其境・静享非凡
  - 智能主动降噪 2.0：40dB 深海级隔音
  - 30 小时超长续航：支持快充 10 分钟畅听 2 小时
  - Hi-Res 金标认证：搭载 10mm 生物振膜单元
  - 人体工学设计：荣获 2023 红点设计奖 "
  4. 工作总结
  需求：Q2 市场部工作汇报
  生成：" 二季度重点突破：
  - 完成全域品牌升级，社交媒体曝光量提升 240%
  - 成功落地 3 场跨界联名活动，带动 GMV 增长 1800 万
  - 优化 KOL 投放模型，CPC 成本降低至行业均值 65%
  核心经验：通过数据中台实现营销动作的实时反馈调优。"
  5. 学术段落
  需求：人工智能伦理研究
  生成："随着生成式 AI 的普适化应用，『幻觉内容』的治理成为关键课题。本研究提出 DETOX 框架，通过多模态证据链验证（Multi-modal Evidence Chain Verification）技术，在 GPT-4 模型中实现事实性错误率降低至 1.2%，较传统 RLHF 方法提升 83% 的纠偏效率。"
  6. 诗歌散文
  需求：描写江南春雨
  生成："青石巷陌洇开墨，纸伞轻旋碎玉落。远山含黛炊烟起，一川烟草满城絮。"

  # 输出限制
  不要输出解释性说明，只输出最终的帮写文案。
`;

  static async streamResponse(
    handle: StreamRequestHandle
  ): Promise<(onData: (text: string, reasoningContent?: string) => void, onComplete?: () => void) => void> {
    return (onData: (text: string, reasoningContent?: string) => void, onComplete?: () => void) => {
      let buffer = '';

      handle.on((event: StreamEvent) => {
        // console.log(`${LLMApi.TAG} streamResponse ${JSON.stringify(event)}`);
        if (event.event === 'data') {
          try {
            const dataStr = String(event.data);
            const jsonStr = dataStr.replace(/^data:\s*/, '').trim();

            if (!jsonStr || jsonStr === '[DONE]') {
              onComplete?.();
              return;
            }

            try {
              const json: ChatCompletionChunk = JSON.parse(jsonStr);
              const choice = json.choices[0];

              if (choice) {
                if (choice.finish_reason === 'stop') {
                  onComplete?.();
                  return;
                }

                const content = choice.delta?.content ?? '';
                const reasoningContent = choice.delta?.reasoning_content;
                if (content || reasoningContent) {
                  buffer += content;
                  onData(content, reasoningContent);
                }
              }
            } catch (parseError) {
              console.error('Failed to parse JSON:', parseError, 'Raw data:', jsonStr);
            }
          } catch (e) {
            console.error('Data processing error:', e);
          }
        } else if (event.event === 'complete') {
          onComplete?.();
        } else if (event.event === 'error') {
          throw new Error(`Stream error: ${event.message}`);
        }
      });
    };
  }

  static async chat(
    params: LLMRequestParams,
    apiKey?: string,
    model: string = LLMApi.VLM_MODEL
  ): Promise<(onData: (text: string, reasoningContent?: string) => void, onComplete?: () => void) => void> {
    const handle = await appletRequest({
      url: `${this.BASE_URL}/bots/chat/completions`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream'
      },
      body: {
        model: model,
        messages: params.messages ?? [],
        stream: true
      },
      addCommonParams: false,
      streamType: 'sse'
    });

    if (handle.httpCode !== 200) {
      throw new Error(`HTTP error! status: ${handle.httpCode}`);
    }

    return this.streamResponse(handle);
  }
}

const constructUserMessage = (question: string, image?: string, modelType: 'VLM' | 'DS' = 'VLM') => {
  if (image && modelType === 'VLM') {
    return {
      role: 'user',
      content: [
        {
          type: 'text',
          text: question
        },
        {
          type: 'image_url',
          image_url: {
            url: image
          }
        }
      ]
    };
  } else {
    return {
      role: 'user',
      content: question
    };
  }
};

export const createLLMRequest = async (
  question: string,
  onData: (data: string, reasoningContent?: string) => void,
  onComplete?: () => void,
  image?: string,
  historyMessages: Array<{ type: string; content: string; image?: string }> = [],
  apiKey?: string,
  modelType: 'VLM' | 'DS' = 'VLM'
) => {
  console.log(`createLLMRequest question=${question} modelType=${modelType}`)

  console.log(
    `${LLMApi.TAG} createLLMRequest historyMessages=`,
    historyMessages.map((msg) => {
      const { image, ...rest } = msg as any;
      return JSON.stringify(rest);
    })
  );
  try {
    // 将历史消息转换为 LLM API 需要的格式
    const messages: Message[] = [
      {
        role: 'system',
        content: modelType === 'VLM' ? LLMApi.VLM_SYSTEM_PROMPT : LLMApi.DEEP_SEEK_SYSTEM_PROMPT
      },
      // 转换最近5条历史消息
      ...historyMessages.slice(-5).map((msg) =>
        msg.type === 'user'
          ? constructUserMessage(msg.content, msg.image, modelType)
          : {
              role: 'assistant',
              content: msg.content
            }
      ),
      // 添加当前问题
      constructUserMessage(question, image)
    ];

    const params: LLMRequestParams = {
      messages
    };

    console.log(
      `${LLMApi.TAG} createLLMRequest messages=`,
      messages.map((msg) => {
        if (msg.role === 'system') {
          return JSON.stringify({ role: 'system', content: 'system prompt'});
        }
        const { image, ...rest } = msg as any;
        return JSON.stringify(rest);
      })
    );

    const model = modelType === 'VLM' ? LLMApi.VLM_MODEL : LLMApi.DEEP_SEEK_MODEL;

    const handleStream = await LLMApi.chat(params, apiKey, model);
    // 创建一个 Promise 来处理流式响应
    return new Promise((resolve, reject) => {
      try {
        handleStream(
          (text, reasoningContent) => {
            onData(text, reasoningContent);
          },
          () => {
            onComplete?.();
            resolve(undefined);
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    console.error(`${LLMApi.TAG} LLM request failed: ${error}`);
    throw error;
  }
};

export type { LLMRequestParams, LLMResponseChunk };
