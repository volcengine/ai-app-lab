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

"use client";

import { FC, useState } from "react";
import { Button, Card, Message, Tag } from "@arco-design/web-react";
import {
  IconDelete,
  IconPauseCircle,
  IconPlayCircle,
} from "@arco-design/web-react/icon";
import { deleteSandbox } from "@/services/sandbox";
import { actions, store, SandboxStatus } from "@/store";
import { useSnapshot } from "valtio";
import { OsTypeLogo } from "../os-type-logo";

const Status: FC<{
  status: SandboxStatus;
}> = ({ status }) => {
  switch (status) {
    case SandboxStatus.RUNNING:
      return <Tag color="green">运行中</Tag>;
    case SandboxStatus.STOPPED:
      return <Tag color="red">已停止</Tag>;
    case SandboxStatus.CREATING:
      return <Tag color="blue">创建中</Tag>;
    case SandboxStatus.STOPPING:
      return <Tag color="orange">暂停中</Tag>;
    case SandboxStatus.DELETING:
      return <Tag color="red">删除中</Tag>;
    default:
      return <Tag color="gray">未知</Tag>;
  }
};

const InstanceInfoItem: FC<{
  label: string;
  value: string | React.ReactNode;
}> = ({ label, value }) => {
  return (
    <p className="flex items-start gap-[20px]">
      <span className="block text-[13px] w-[64px] text-[#737A87] shrink-0">
        {label}
      </span>
      <span className="flex-1 min-w-0 text-[13px] font-[PingFang SC] font-normal text-[#0C0D0E] break-all">
        {value}
      </span>
    </p>
  );
};

const InstanceInfo: FC = () => {
  const { id, sandbox, env = {} } = useSnapshot(store);
  const { MCP_SERVER_URL } = env;
  const [actionLoading, setActionLoading] = useState(false);
  const instance = sandbox;
  const loading = false;

  const [message, messageHolder] = Message.useMessage();

  const handleDeleteInstance = async () => {
    if (!id || !window.confirm("确定要删除此沙箱吗？此操作不可撤销。")) return;

    setActionLoading(true);
    try {
      await deleteSandbox(id);
      actions.setId(undefined);
      actions.fetchSandboxList();
      message?.success?.("删除沙箱成功");
    } catch (error) {
      message?.error?.("删除沙箱失败: " + error?.toString());
    } finally {
      setActionLoading(false);
    }
  };

  // 如果没有沙箱ID，显示提示信息
  if (!id) {
    return (
      <div className="h-full w-full flex flex-col bg-white rounded-md shadow-sm">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 text-slate-300">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="100%"
                height="100%"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </div>
            <p className="text-sm text-slate-500">请选择或创建一个沙箱</p>
            <p className="text-xs text-slate-400 mt-2">
              选择或创建沙箱后在此处查看详情
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full w-full flex flex-col bg-white rounded-md shadow-sm">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-5 h-5 border-t-2 border-indigo-500 rounded-full animate-spin mb-2 mx-auto"></div>
            <p className="text-xs text-slate-500">加载中...</p>
          </div>
        </div>
        {messageHolder}
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="h-full w-full flex flex-col bg-white rounded-md shadow-sm">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-red-500">未找到沙箱信息</p>
            <p className="text-xs text-slate-400 mt-2">
              该沙箱可能已被删除或不存在
            </p>
          </div>
        </div>
        {messageHolder}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-white rounded-lg shadow-sm p-[4px]">
      <div className="flex-1 flex flex-col overflow-auto">
        {/* 系统基本信息 */}
        <Card bordered={false}>
          <div className="flex items-center justify-between mb-[12px]">
            <h3 className="text-sm font-medium text-slate-800">系统信息</h3>
            <Status status={instance.Status} />
          </div>

          <div className="text-slate-600 text-xs space-y-3">
            <InstanceInfoItem label="沙箱ID" value={instance.SandboxId} />
            <InstanceInfoItem label="主机类型" value="火山引擎云主机 (ECS)" />
            {instance.PrimaryIp && (
              <InstanceInfoItem label="网络地址" value={instance.PrimaryIp} />
            )}
            {instance.Eip && (
              <InstanceInfoItem label="EIP" value={instance.Eip} />
            )}
            <InstanceInfoItem
              label="操作系统"
              value={
                <div className="flex items-center gap-2">
                  <OsTypeLogo osType={sandbox?.OsType} />
                  {sandbox?.OsType}
                </div>
              }
            />
            {MCP_SERVER_URL && (
              <InstanceInfoItem label="MCP服务" value={MCP_SERVER_URL} />
            )}
          </div>
        </Card>

        {/* 操作区域 */}
        <Card bordered={false}>
          <div className="flex items-center justify-between mb-[12px]">
            <h3 className="text-sm font-medium text-slate-800">操作</h3>
          </div>

          <div className="grid grid-cols-3 gap-[8px]">
            <Button
              className="px-1.5"
              type="outline"
              disabled
              icon={<IconPlayCircle />}
            >
              启动
            </Button>

            <Button
              className="px-1.5"
              type="outline"
              icon={<IconPauseCircle />}
              disabled
            >
              暂停
            </Button>

            <Button
              className="px-1.5"
              type="outline"
              status="danger"
              onClick={handleDeleteInstance}
              icon={<IconDelete />}
              disabled={actionLoading}
            >
              删除
            </Button>
          </div>
        </Card>
      </div>
      {messageHolder}
    </div>
  );
};

export default InstanceInfo;
