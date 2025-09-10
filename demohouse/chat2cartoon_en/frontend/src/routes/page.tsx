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

import { useEffect } from "react";
import { Helmet } from "@modern-js/runtime/head";

import { v4 as uuidV4 } from "uuid";
import VideoGenerator from "@/module/VideoGenerator";

import "./index.css";
import { GetVideoGenTask } from "@/services/getVideoGenTask";

const Index = () => {
  const storeKey =
    localStorage.getItem("ark-interactive-video-store-key") || uuidV4();

  useEffect(() => {
    localStorage.setItem("ark-interactive-video-store-key", storeKey);
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
              Name: "Interactive bilingual video generator",
              Description:
                "Designed for content creators, this tool instantly turns your themes into engaging bilingual videos. It delivers a fun, educational experience that's perfect for learning and growth.",
              OpeningRemarks: {
                OpeningRemark:
                  "Stop searching for content ideas. Instantly transform any topic into a captivating bilingual video. Just give us the theme, and watch the magic happen.",
                OpeningQuestions: [
                  "A little boy's unexpected friendship",
                  "The magic of sharing",
                  "The scaredy-cat who became brave",
                ],
              },
            }}
            botUrl="http://0.0.0.0:8080/api/v3/bots/chat/completions"
            botChatUrl="http://0.0.0.0:8080/api/v3/bots/chat/completions"
            storeUniqueId={storeKey}
            api={{
              GetVideoGenTask: GetVideoGenTask,
            }}
            slots={{}}
          />
        </div>
      </main>
    </div>
  );
};

export default Index;
