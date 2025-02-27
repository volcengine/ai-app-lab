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

import { useEffect } from 'react';
import { Helmet } from '@modern-js/runtime/head';
import { v4 as uuidV4 } from 'uuid';
import VideoGenerator from '@/module/VideoGenerator';

import './index.css';
import { GetVideoGenTask } from '@/services/getVideoGenTask';
import { CommonDownloadTosUrls } from '@/services/commonDownloadTosUrls';

const Index = () => {
  const storeKey =
    localStorage.getItem('ark-interactive-video-store-key') || uuidV4();

  useEffect(() => {
    localStorage.setItem('ark-interactive-video-store-key', storeKey);
  }, []);

  return (
    <div>
      <Helmet>
        <link
          rel="icon"
          type="image/x-icon"
          href="https://lf3-static.bytednsdoc.com/obj/eden-cn/uhbfnupenuhf/favicon.ico"
        />
      </Helmet>
      <main>
        <div className="interactive-video" style={{ height: `100vh` }}>
          <VideoGenerator
            assistantInfo={{
              Name: '互动双语视频生成器',
              Description:
                '这是一款专门为内容素材创作打造的创新工具。它能够根据用户输入的主题，快速生成富有寓意的双语视频。为体验者提供丰富多彩、富有教育意义的视听体验，在快乐中学习和成长。提示：若生成的产品/功能面向特定年龄群体，需要注意敏感个人信息收集及合规。',
              OpeningRemarks: {
                OpeningRemark:
                  '你是否在寻找一种独特的内容资源呢？那就别错过我们创新的互动双语视频生成器。只需输入一个主题，就能为你生成引人入胜且富有含义的双语视频。',
                OpeningQuestions: [
                  '讲一个睡前要刷牙的故事',
                  '晚上一直看电视不去睡觉',
                  '按时起床不能赖床',
                ],
              },
            }}
            botUrl="http://0.0.0.0:8888/api/v3/bots/chat/completions"
            botChatUrl="http://0.0.0.0:8888/api/v3/bots/chat/completions"
            storeUniqueId={storeKey}
            api={
              {
                CommonDownloadTosUrls: CommonDownloadTosUrls,
                GetVideoGenTask: GetVideoGenTask,
              }
            }
            slots={{}}
          />
        </div>
      </main>
    </div>
  );
};

export default Index;
