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

/**
 * 通用API响应接口
 */
export interface ApiResponse<T = any> {
  error: string | null;
  data?: T;
  message?: string;
}

/**
 * Chat API响应格式
 */
export interface ChatResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
  }[];
  error?: string | null;
  metadata?: Record<string, any>;
}

/**
 * 聊天消息接口
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 音频任务响应接口
 */
export interface AudioTaskResponse {
  id: string;
  error: string | null;
  metadata: {
    task_id?: string;
    result?: string;
    status?: string;
    upload_url?: string;
  };
}

/**
 * 任务状态类型
 */
export type TaskStatus = 'pending' | 'processing' | 'finished' | 'failed';

/**
 * 音频任务结果接口
 */
export interface AudioTaskResult {
  text: string;
  status: TaskStatus;
}

/**
 * 内容风格类型
 */
export type ContentStyle = 'note' | 'summary' | 'xiaohongshu' | 'wechat' | 'mind';

/**
 * 上传链接响应接口
 */
export interface UploadUrlResponse {
  upload_url: string;
}

/**
 * 任务记录接口
 */
export interface Task {
  id?: number;
  fileName: string;
  md5: string;
  transcriptionText: string;
  markdownContent: string;
  contentStyle: ContentStyle;
  createdAt: string;
}
