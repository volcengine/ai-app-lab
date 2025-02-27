// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { ErrorString, PhaseMapType, UserConfirmationDataKey, VideoGeneratorTaskPhase } from './types';
import {
  combinationFirstFrameDescription,
  combinationRoleDescription,
  combinationVideoDescription,
  matchFirstFrameDescription,
  matchRoleDescription,
  matchVideoDescription,
} from './utils';

export const PHASE_MAP: Record<VideoGeneratorTaskPhase, PhaseMapType> = {
  [VideoGeneratorTaskPhase.PhaseScript]: {
    userConfirmationDataKey: UserConfirmationDataKey.Script,
  },
  [VideoGeneratorTaskPhase.PhaseStoryBoard]: {
    userConfirmationDataKey: UserConfirmationDataKey.StoryBoards,
  },
  [VideoGeneratorTaskPhase.PhaseRoleDescription]: {
    userConfirmationDataKey: UserConfirmationDataKey.RoleDescriptions,
    matchDescription: matchRoleDescription,
    combinationDescription: combinationRoleDescription,
  },
  [VideoGeneratorTaskPhase.PhaseRoleImage]: {
    userConfirmationDataKey: UserConfirmationDataKey.RoleImage,
    containsErrorMessage: ErrorString.ImageError,
  },
  [VideoGeneratorTaskPhase.PhaseFirstFrameDescription]: {
    userConfirmationDataKey: UserConfirmationDataKey.FirstFrameDescriptions,
    matchDescription: matchFirstFrameDescription,
    combinationDescription: combinationFirstFrameDescription,
  },
  [VideoGeneratorTaskPhase.PhaseFirstFrameImage]: {
    userConfirmationDataKey: UserConfirmationDataKey.FirstFrameImages,
    containsErrorMessage: ErrorString.ImageError,
  },
  [VideoGeneratorTaskPhase.PhaseVideoDescription]: {
    userConfirmationDataKey: UserConfirmationDataKey.VideoDescriptions,
    matchDescription: matchVideoDescription,
    combinationDescription: combinationVideoDescription,
  },
  [VideoGeneratorTaskPhase.PhaseVideo]: {
    userConfirmationDataKey: UserConfirmationDataKey.Videos,
    containsErrorMessage: ErrorString.VideoError,
  },
  [VideoGeneratorTaskPhase.PhaseTone]: {
    userConfirmationDataKey: UserConfirmationDataKey.Tones,
  },
  [VideoGeneratorTaskPhase.PhaseAudio]: {
    userConfirmationDataKey: UserConfirmationDataKey.Audios,
    containsErrorMessage: ErrorString.AudioError,
  },
  [VideoGeneratorTaskPhase.PhaseFilm]: {
    userConfirmationDataKey: UserConfirmationDataKey.Film,
  },
};

export const DEFAULT_EXTRA_INFO = {
  Models: [
    {
      Name: 'Doubao-pro-32k',
      ModelName: 'doubao-pro-32k',
      Used: ['Script', 'StoryBoard'],
    },
    {
      Name: 'Doubao-vision-pro-32k',
      ModelName: 'doubao-vision-pro-32k',
    },
    {
      Name: 'Doubao-文生图',
      ModelName: 'doubao-t2i-drawing',
      Used: ['RoleImage', 'FirstFrameImage'],
    },
    {
      Name: 'Doubao-语音合成',
      ModelName: 've-tts',
      Used: ['Audio'],
    },
    {
      Name: 'Doubao-流式语音识别',
      ModelName: 'seedasr-streaming',
    },
    {
      Name: 'Doubao-视频生成',
      ModelName: 'doubao-seaweed',
      Used: ['Video'],
    },
  ],
  Tones: [
    {
      DisplayName: '灿灿/Shiny',
      Tone: 'zh_female_cancan_mars_bigtts',
    },
    {
      DisplayName: '爽快思思/Skye',
      Tone: 'zh_female_shuangkuaisisi_moon_bigtts',
    },
    {
      DisplayName: '温暖阿虎/Alvin',
      Tone: 'zh_male_wennuanahu_moon_bigtts',
    },
    {
      DisplayName: '少年梓辛/Brayan',
      Tone: 'zh_male_shaonianzixin_moon_bigtts',
    },
    {
      DisplayName: '知性女声',
      Tone: 'zh_female_zhixingnvsheng_mars_bigtts',
    },
    {
      DisplayName: '清爽男大',
      Tone: 'zh_male_qingshuangnanda_mars_bigtts',
    },
    {
      DisplayName: '邻家女孩',
      Tone: 'zh_female_linjianvhai_moon_bigtts',
    },
    {
      DisplayName: '渊博小叔',
      Tone: 'zh_male_yuanboxiaoshu_moon_bigtts',
    },
    {
      DisplayName: '阳光青年',
      Tone: 'zh_male_yangguangqingnian_moon_bigtts',
    },
    {
      DisplayName: '甜美小源',
      Tone: 'zh_female_tianmeixiaoyuan_moon_bigtts',
    },
    {
      DisplayName: '清澈梓梓',
      Tone: 'zh_female_qingchezizi_moon_bigtts',
    },
    {
      DisplayName: '解说小明',
      Tone: 'zh_male_jieshuoxiaoming_moon_bigtts',
    },
    {
      DisplayName: '开朗姐姐',
      Tone: 'zh_female_kailangjiejie_moon_bigtts',
    },
    {
      DisplayName: '邻家男孩',
      Tone: 'zh_male_linjiananhai_moon_bigtts',
    },
    {
      DisplayName: '甜美悦悦',
      Tone: 'zh_female_tianmeiyueyue_moon_bigtts',
    },
    {
      DisplayName: '心灵鸡汤',
      Tone: 'zh_female_xinlingjitang_moon_bigtts',
    },
    {
      DisplayName: '京腔侃爷/Harmony',
      Tone: 'zh_male_jingqiangkanye_moon_bigtts',
    },
    {
      DisplayName: '湾湾小何',
      Tone: 'zh_female_wanwanxiaohe_moon_bigtts',
    },
    {
      DisplayName: '湾区大叔',
      Tone: 'zh_female_wanqudashu_moon_bigtts',
    },
    {
      DisplayName: '呆萌川妹',
      Tone: 'zh_female_daimengchuanmei_moon_bigtts',
    },
    {
      DisplayName: '广州德哥',
      Tone: 'zh_male_guozhoudege_moon_bigtts',
    },
    {
      DisplayName: '北京小爷',
      Tone: 'zh_male_beijingxiaoye_moon_bigtts',
    },
    {
      DisplayName: '浩宇小哥',
      Tone: 'zh_male_haoyuxiaoge_moon_bigtts',
    },
    {
      DisplayName: '广西远舟',
      Tone: 'zh_male_guangxiyuanzhou_moon_bigtts',
    },
    {
      DisplayName: '妹坨洁儿',
      Tone: 'zh_female_meituojieer_moon_bigtts',
    },
    {
      DisplayName: '豫州子轩',
      Tone: 'zh_male_yuzhouzixuan_moon_bigtts',
    },
    {
      DisplayName: '奶气萌娃',
      Tone: 'zh_male_naiqimengwa_mars_bigtts',
    },
    {
      DisplayName: '婆婆',
      Tone: 'zh_female_popo_mars_bigtts',
    },
    {
      DisplayName: '高冷御姐',
      Tone: 'zh_female_gaolengyujie_moon_bigtts',
    },
    {
      DisplayName: '柔美女友',
      Tone: 'zh_female_sajiaonvyou_moon_bigtts',
    },
    {
      DisplayName: '撒娇学妹',
      Tone: 'zh_female_yuanqinvyou_moon_bigtts',
    },
    {
      DisplayName: '东方浩然',
      Tone: 'zh_male_dongfanghaoran_moon_bigtts',
    },
    {
      DisplayName: '温柔小雅',
      Tone: 'zh_female_wenrouxiaoya_moon_bigtts',
    },
    {
      DisplayName: '天才童声',
      Tone: 'zh_male_tiancaitongsheng_mars_bigtts',
    },
    {
      DisplayName: '猴哥',
      Tone: 'zh_male_sunwukong_mars_bigtts',
    },
    {
      DisplayName: '熊二',
      Tone: 'zh_male_xionger_mars_bigtts',
    },
    {
      DisplayName: '佩奇猪',
      Tone: 'zh_female_peiqi_mars_bigtts',
    },
    {
      DisplayName: '樱桃丸子',
      Tone: 'zh_female_yingtaowanzi_mars_bigtts',
    },
    {
      DisplayName: '广告解说',
      Tone: 'zh_male_chunhui_mars_bigtts',
    },
    {
      DisplayName: '少儿故事',
      Tone: 'zh_female_shaoergushi_mars_bigtts',
    },
    {
      DisplayName: '贴心女声/Candy',
      Tone: 'zh_female_tiexinnvsheng_mars_bigtts',
    },
    {
      DisplayName: '俏皮女声',
      Tone: 'zh_female_qiaopinvsheng_mars_bigtts',
    },
  ],
};
