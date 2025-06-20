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

import { createContext } from 'react';

import { ImageTosPathItem } from '../../types/ImageTosPathList';
export interface ImageType{
  objectKey:string;
  disPlayUrl:string
}
export interface QueryParamsType {
  text: string;
  image: ImageType| null;
}
export interface QueryContextType {
  userId: string;
  handleSendQuery: (query: QueryParamsType) => void;
  clearQueryParams: () => void;
  queryParams: QueryParamsType | null;
  loading: boolean;
  imageList: ImageTosPathItem[];
}
export const QueryContext = createContext<QueryContextType>({} as unknown as never);
