"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/header";
import { LeftPanel } from "@/components/left-panel";
import { InstanceSelector } from "@/components/instance/instance-selector";
import { DesktopDisplay } from "@/components/desktop-display";
import { CreateInstanceModal } from "@/components/instance/instance-creation-modal";
import { Spinner } from "@/components/spinner";
import { Tabs, Skeleton, Message } from "@arco-design/web-react";
import { OSType } from "@/services/sandbox";
import store, { actions } from "@/store";
import { useSnapshot } from "valtio";
import dynamic from "next/dynamic";
import { PromptEditor } from "@/components/prompt-editor";
import { getEnv } from "@/services/env";
import { useEmbedded } from "@/hooks/use-embedded";

const InstanceInfo = dynamic(
  () => import("@/components/instance/instance-info"),
  {
    loading: () => (
      <div className="h-full w-full flex flex-col bg-white rounded-md shadow-sm p-4">
        <Skeleton />
      </div>
    ),
  }
);

const TabPane = Tabs.TabPane;

function Home() {
  const isEmbedded = useEmbedded();
  const { maximized } = useSnapshot(store);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [message, messageHolder] = Message.useMessage();

  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  const handleCreateInstance = async (osType: OSType) => {
    try {
      await actions.createSandbox({
        osType,
        onError: (errorMsg?: string) => {
          message?.error?.(errorMsg || "创建沙箱失败");
        },
        onSuccess: () => {
          message?.success?.("创建沙箱成功");
        },
      });
    } catch (error) {
      console.error("创建沙箱失败", error);
      alert("创建沙箱失败");
    }
  };

  return (
    <div className="page flex flex-col h-[calc(100vh-var(--scrollbar-height))] bg-slate-50 min-w-[1200px] overflow-x-auto">
      {messageHolder}
      {!isEmbedded && <Header />}
      <div className="flex flex-1 overflow-hidden background">
        <div className="bg-[#FFFFFF80] flex w-full">
          {/* 左侧面板 */}
          {maximized ? null : (
            <div className="w-1/5 p-4 pr-0">
              <LeftPanel />
            </div>
          )}

          {/* 主要内容区域 */}
          <div className={`${maximized ? "w-full" : "w-4/5"} flex flex-col`}>
            <div className="flex flex-col flex-1 px-4 py-4">
              <Tabs
                justify
                type="capsule"
                defaultActiveTab="desktop"
                className={`h-full flex flex-col ${
                  maximized ? "tab-header-hide" : ""
                }`}
                extra={
                  <InstanceSelector
                    onCreateNewInstance={handleOpenCreateModal}
                  />
                }
              >
                {/* 桌面标签内容 */}
                <TabPane
                  key="desktop"
                  title="我的桌面"
                  className="flex-1 h-full"
                >
                  <div className="flex h-full">
                    {/* 左侧桌面显示区域 */}
                    <div
                      className={`${
                        maximized ? "w-full" : "w-[78%]"
                      } h-full pr-4`}
                    >
                      <DesktopDisplay onCreateInstance={handleCreateInstance} />
                    </div>

                    {/* 右侧状态信息区域 */}
                    {!maximized && (
                      <div className="w-[22%] h-full min-w-[297px]">
                        <InstanceInfo />
                      </div>
                    )}
                  </div>
                </TabPane>

                {/* 系统提示词标签内容 */}
                <TabPane key="system" title="系统提示词" className="flex-1">
                  <PromptEditor />
                </TabPane>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      {/* 创建沙箱模态框 */}
      <CreateInstanceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateInstance={handleCreateInstance}
      />
    </div>
  );
}

export default function HomePage() {
  useEffect(() => {
    async function getEnvOnStart() {
      const env = await getEnv();
      actions.setEnv(env);
    }
    getEnvOnStart();
  }, []);

  const { envLoaded } = useSnapshot(store);
  return envLoaded ? (
    <Home />
  ) : (
    <div className="flex items-center justify-center h-screen">
      <Spinner />
    </div>
  );
}
