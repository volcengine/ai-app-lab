/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * 项目统一配置文件
 * 从环境变量中读取配置
 */

// API服务基础URL
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

// 各模块API路径
export const API_PATHS = {
    CHAT_COMPLETIONS: '/api/v3/bots/chat/completions',
    UPLOAD_URL: '/api/v3/bots/chat/completions', // 获取上传URL的API路径
    AUDIO_TASK: '/api/v3/bots/chat/completions' // 音频任务API路径
}

export default {
    API_BASE_URL,
    API_PATHS
}
