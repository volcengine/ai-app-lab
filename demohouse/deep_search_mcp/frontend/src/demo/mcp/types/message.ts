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

import { Event } from './event';

export interface SearchReferences {
  site: string;
  title: string;
  url: string;
  content: string;
}

export interface SearchResult {
  query: string;
  summaryContent: string;
  searchReferences: SearchReferences[];
}

export interface Search {
  searchRounds: number;
  searchState: 'searching' | 'searched' | 'finished'; // finished 表示全部搜索结束，无需搜索
  searchKeywords: string[];
  searchResults?: SearchResult[];
}

export interface Message {
  id: string;
  role: 'assistant' | 'user';
  type: 'error' | 'text' | 'mcp' | 'pre-mcp' | 'manual-pause';
  finish: boolean;
  content: string;
  logId?: string;
  requestId?: string;
  events?: Event[];
  sessionId?: string;
  sessionQuery?: string;
  references?: Reference[];
  usage?: any;
}

interface CoverImage {
  url: string;
  width: number;
  height: number;
}

interface Extra {
  rel_info: string;
  freshness_info: string;
  auth_info: string;
  final_ref: string;
}

export interface Reference {
  url: string;
  doc_name?: string;
  logo_url: string;
  site_name?: string;
  title?: string;
  summary: string;
  publish_time: string;
  cover_image?: CoverImage; // 可选属性,因为不是每个 reference 都有封面图
  extra: Extra;
}
