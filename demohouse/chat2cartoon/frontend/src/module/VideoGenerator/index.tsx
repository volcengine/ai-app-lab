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

import { ChatWindowV2 } from '@/components/ChatWindowV2';
import { Assistant } from '@/types/assistant';

import Conversation from './components/Conversation';
import RenderedMessagesProvider from './store/RenderedMessages/provider';
import { MachineProvider } from '../WatchAndChat/providers/MachineProvider/MachineProvider';
import { WatchAndChatProvider } from '../WatchAndChat/providers/WatchAndChatProvider/WatchAndChatProvider';
import { InjectContext } from './store/Inject/context';
import { DEFAULT_EXTRA_INFO } from './constants';
import { IOptions } from '@/utils/request';

interface ApiRequest {
  GetVideoGenTask?: (params: { Id: string }, opts?: IOptions) => Promise<any>;
  CommonDownloadTosUrls?: (params: { TosObjects: any[] }) => Promise<any>;
}
interface Props {
  assistantInfo: Assistant;
  botUrl: string;
  botChatUrl: string;
  storeUniqueId: string;
  api: ApiRequest;
  slots: Record<string, (props: any) => JSX.Element>;
}

const VideoGenerator = (props: Props) => {
  const { assistantInfo, botUrl, botChatUrl, storeUniqueId, api, slots } = props;
  const assistant = { ...assistantInfo, Extra: { ...DEFAULT_EXTRA_INFO, ...assistantInfo.Extra } };

  return (
    <InjectContext.Provider value={{ api, slots }}>
      <ChatWindowV2 assistant={assistant} url={botUrl}>
        <RenderedMessagesProvider storeUniqueId={storeUniqueId}>
          <WatchAndChatProvider>
            <MachineProvider url={botChatUrl}>
              <Conversation />
            </MachineProvider>
          </WatchAndChatProvider>
        </RenderedMessagesProvider>
      </ChatWindowV2>
    </InjectContext.Provider>
  );
};

export default VideoGenerator;
