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
import { RemainingTimeAlert } from "../remaining-time-alert";
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

const InstanceInfo: FC = () => {
  const { ip, sandbox } = useSnapshot(store);
  const [actionLoading, setActionLoading] = useState(false);
  const instance = sandbox;
  const instanceId = sandbox?.SandboxId;
  const loading = false;

  const [message, messageHolder] = Message.useMessage();

  const handleDeleteInstance = async () => {
    if (!instanceId || !window.confirm("确定要删除此实例吗？此操作不可撤销。"))
      return;

    setActionLoading(true);
    try {
      await deleteSandbox(instanceId);
      actions.setIp(undefined);
      actions.fetchSandboxList();
      message?.success?.("删除实例成功");
    } catch (error) {
      message?.error?.("删除实例失败: " + error?.toString());
    } finally {
      setActionLoading(false);
    }
  };

  // 如果没有实例ID或者没有IP，显示提示信息
  if (!instanceId || !ip) {
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
            <p className="text-sm text-slate-500">请选择或创建一个实例</p>
            <p className="text-xs text-slate-400 mt-2">
              选择或创建实例后在此处查看详情
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
            <p className="text-sm text-red-500">未找到实例信息</p>
            <p className="text-xs text-slate-400 mt-2">
              该实例可能已被删除或不存在
            </p>
          </div>
        </div>
        {messageHolder}
      </div>
    );
  }

  const getStatusColor = (status: SandboxStatus) => {
    switch (status) {
      case SandboxStatus.RUNNING:
        return "text-green-600 bg-green-50";
      case SandboxStatus.STOPPED:
        return "text-amber-600 bg-amber-50";
      case SandboxStatus.CREATING:
        return "text-blue-600 bg-blue-50";
      case SandboxStatus.STOPPING:
        return "text-orange-600 bg-orange-50";
      case SandboxStatus.DELETING:
        return "text-gray-600 bg-gray-50";
      case SandboxStatus.DELETED:
        return "text-gray-600 bg-gray-50";
      default:
        return "text-slate-600 bg-slate-50";
    }
  };

  const getStatusText = (status: SandboxStatus) => {
    switch (status) {
      case SandboxStatus.RUNNING:
        return "运行中";
      case SandboxStatus.STOPPED:
        return "已停止";
      case SandboxStatus.CREATING:
        return "创建中";
      case SandboxStatus.STOPPING:
        return "暂停中";
      case SandboxStatus.DELETING:
        return "删除中";
      case SandboxStatus.DELETED:
        return "已删除";
      default:
        return "未知";
    }
  };

  const formatTimeDiff = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();

    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor(
      (diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
    );
    const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));

    if (days > 0) {
      return `${days}天 ${hours}小时`;
    } else if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    } else {
      return `${minutes}分钟`;
    }
  };

  const StatusMap = {
    RUNNING: {
      status: "running",
      text: "运行中",
    },
    STOPPED: {
      status: "warning",
      text: "已停止",
    },
    CREATING: {
      status: "loading",
      text: "创建中",
    },
    STOPPING: {
      status: "wait",
      text: "暂停中",
    },
    DELETING: {
      status: "loading",
      text: "删除中",
    },
    DELETED: {
      status: "error",
      text: "已删除",
    },
  };
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
            <p className="flex items-center h-[22px] gap-[20px]">
              <span className="block text-[13px] w-[64px] text-[#737A87]">
                实例ID
              </span>
              <span className="text-[13px] font-[PingFang SC] font-normal text-[#0C0D0E]">
                {instance.SandboxId}
              </span>
            </p>
            <p className="flex items-center h-[22px] gap-[20px]">
              <span className="block text-[13px] w-[64px] text-[#737A87]">
                主机类型
              </span>
              <span className="text-[13px] font-[PingFang SC] font-normal text-[#0C0D0E]">
                火山引擎云主机 (ECS)
              </span>
            </p>
            {instance.PrimaryIp && (
              <p className="flex items-center h-[22px] gap-[20px]">
                <span className="block text-[13px] w-[64px] text-[#737A87]">
                  网络地址
                </span>
                <span className="text-[13px] font-[PingFang SC] font-normal text-[#0C0D0E]">
                  {instance.PrimaryIp || "-"}
                </span>
              </p>
            )}
            {instance.Eip && (
              <p className="flex items-center h-[22px] gap-[20px]">
                <span className="block text-[13px] w-[64px] text-[#737A87]">
                  EIP
                </span>
                <span className="text-[13px] font-[PingFang SC] font-normal text-[#0C0D0E]">
                  {instance.Eip || "-"}
                </span>
              </p>
            )}
            <p className="flex items-center h-[22px] gap-[20px]">
              <span className="block text-[13px] w-[64px] text-[#737A87]">
                操作系统
              </span>
              <span className="text-[13px] font-[PingFang SC] font-normal flex items-center gap-2 text-[#0C0D0E]">
                <OsTypeLogo osType={sandbox?.OsType} />
                {sandbox?.OsType}
              </span>
            </p>
          </div>
        </Card>
        <div className="m-[12px] mt-[0px]">
          <RemainingTimeAlert />
        </div>

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
