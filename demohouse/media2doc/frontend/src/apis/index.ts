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

import * as audioService from './asrService'
import * as markdownService from './markdownService'
import * as uploadService from './uploadService'
import * as chatService from './chatService'
import httpService from './http'

// 从各个服务中导出常用函数
export const { submitAudioTask, pollAsrTask: pollAudioTask, queryAudioTask } = audioService
export const { generateMarkdownText } = markdownService
export const { getAudioUploadUrl, uploadFile } = uploadService
export const { sendChatMessage } = chatService

// 导出所有服务
export {
  audioService,
  markdownService,
  uploadService,
  chatService,
  httpService
}

// 导出类型
export * from './types'

// 默认导出所有服务的集合
export default {
  audio: audioService,
  markdown: markdownService,
  upload: uploadService,
  chat: chatService,
  http: httpService
}
