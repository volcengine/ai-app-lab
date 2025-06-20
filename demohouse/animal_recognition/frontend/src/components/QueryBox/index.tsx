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

import { useContext } from 'react';

import { Welcome } from './components/Welcome';
import { QueryContext } from '../../store/Query/context';
import { Result } from './components/Result';
import { MyGallery } from '../MyGallery';

export const QueryBox = () => {
  const { queryParams } = useContext(QueryContext);
  return (
    <div className="w-full h-full flex rounded-xl">
      <div className="flex-1 min-w-[480px]">{!queryParams ? <Welcome /> : <Result />}</div>
      <div className="min-w-[330px] 2xl:min-w-[480px]">
        <MyGallery />
      </div>
    </div>
  );
};
