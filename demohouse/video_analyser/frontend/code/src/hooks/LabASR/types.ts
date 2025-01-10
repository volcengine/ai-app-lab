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

export interface IClientRequestData {
  app: {
    appid: string;
    token: string;
    auth_method: string;
    cluster: string;
  };
  user: {
    uid: string;
  };
  audio: {
    format: string;
    rate: number;
    bits: number;
    channel: number;
  };
  request: {
    reqid: string;
    workflow: string;
    sequence: number;
    show_utterances?: boolean;
    show_volume_v2?: boolean;
    show_speech_rate?: boolean;
  };
}

export interface Word {
  blank_duration: number;
  end_time: number;
  start_time: number;
  text: string;
}

export interface Utterance {
  definite: boolean;
  end_time: number;
  start_time: number;
  text: string;
  words: Word[];
}

export interface Result {
  text: string;
  utterances: Utterance[];
}

export interface AudioInfo {
  duration: number;
}

export interface ASRResponseData {
  audio_info: AudioInfo;
  result: Result;
  isError: boolean;
}