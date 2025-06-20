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


import './style.css';
import { FC } from 'react';

import { v4 as uuidv4 } from 'uuid';
import { UploadTosProvider } from '@/store/UploadTos/provider';
import { QueryProvider } from '@/store/Query/provider';
import { QueryBox } from '@/components/QueryBox';


export interface MultipleQueryProps {
  apiPath?: string;
  getHeader?: () => Record<string, Record<string, string>>;
  auth?: {
    userId?: string;
  };
}

const MultipleQuery: FC<MultipleQueryProps> = ({ auth, apiPath, getHeader }) => {
  const userId = auth?.userId ?? uuidv4();
  return (
    <UploadTosProvider>
      <QueryProvider userId={userId}>
        <div className="h-full w-full" id="multipleQueryContainer">
          <QueryBox />
        </div>
      </QueryProvider>
    </UploadTosProvider>
  );
};



export default MultipleQuery;
