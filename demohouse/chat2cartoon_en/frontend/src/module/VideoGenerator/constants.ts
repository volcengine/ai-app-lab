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

import {
  ErrorString,
  PhaseMapType,
  UserConfirmationDataKey,
  VideoGeneratorTaskPhase,
} from "./types";
import {
  combinationFirstFrameDescription,
  combinationRoleDescription,
  combinationVideoDescription,
  matchFirstFrameDescription,
  matchRoleDescription,
  matchVideoDescription,
} from "./utils";

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
      Name: "ByteDance-Seed-1.6",
      ModelName: "seed-1-6",
      ModelVersion: "250615",
      Used: ["Script", "StoryBoard"],
    },
    {
      Name: "Bytedance-Seedream",
      ModelName: "seedream-3-0-t2i",
      Used: ["RoleImage", "FirstFrameImage"],
    },
    {
      Name: "Seed Speech",
      ModelName: "ve-tts",
      Used: ["Audio"],
    },
    {
      Name: "ByteDance-Seedance",
      ModelName: "seedance-1-0-lite-t2v",
      Used: ["Video"],
    },
  ],
  Tones: [
    {
      DisplayName: "Ethan",
      Tone: "zh_male_shaonianzixin_moon_bigtts",
    },
    {
      DisplayName: "Thomas",
      Tone: "zh_male_jingqiangkanye_moon_bigtts",
    },
    {
      DisplayName: "Adam",
      Tone: "en_male_adam_mars_bigtts",
    },
    {
      DisplayName: "Mark",
      Tone: "zh_male_wennuanahu_moon_bigtts",
    },
    {
      DisplayName: "James",
      Tone: "zh_male_jieshuonansheng_mars_bigtts",
    },
    {
      DisplayName: "William",
      Tone: "zh_male_silang_mars_bigtts",
    },
    {
      DisplayName: "Smith",
      Tone: "en_male_smith_mars_bigtts",
    },
    {
      DisplayName: "Dryw",
      Tone: "en_male_dryw_mars_bigtts",
    },
    {
      DisplayName: "Ava",
      Tone: "zh_female_mengyatou_mars_bigtts",
    },
    {
      DisplayName: "Mia",
      Tone: "zh_female_qiaopinvsheng_mars_bigtts",
    },
    {
      DisplayName: "Lily",
      Tone: "zh_female_linjia_mars_bigtts",
    },
    {
      DisplayName: "Aria",
      Tone: "zh_female_shuangkuaisisi_moon_bigtts",
    },
    {
      DisplayName: "Luna",
      Tone: "zh_female_cancan_mars_bigtts",
    },
    {
      DisplayName: "Sophia",
      Tone: "zh_female_tiexinnvsheng_mars_bigtts",
    },
    {
      DisplayName: "Grace",
      Tone: "zh_female_jitangmeimei_mars_bigtts",
    },
    {
      DisplayName: "Anna",
      Tone: "en_female_anna_mars_bigtts",
    },
    {
      DisplayName: "Sarah",
      Tone: "en_female_sarah_mars_bigtts",
    },
    {
      DisplayName: "Tina",
      Tone: "zh_female_shaoergushi_mars_bigtts",
    },
  ],
};
