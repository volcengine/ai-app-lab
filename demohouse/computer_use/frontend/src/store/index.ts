"use client";

import { proxy, useSnapshot } from "valtio";
import {
  createSandbox as apiCreateSandbox,
  getSandboxList,
  OSType,
} from "@/services/sandbox";
import { getModelList } from "@/services/planner";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const defaultSystemPrompt = '';

export enum SandboxStatus {
  CREATING = "CREATING",
  RUNNING = "RUNNING",
  STOPPED = "STOPPED",
  STOPPING = "STOPPING",
  DELETING = "DELETING",
  DELETED = "DELETED",
}

export interface Sandbox {
  SandboxId: string;
  PrimaryIp: string;
  Eip: string;
  Status: SandboxStatus;
  OsType: OSType;
}

// 消息接口
export interface Message {
  id: string;
  text: string;
  timestamp: number;
  sender: "user" | "assistant";
  type: "text" | "image";
  extra?: string;
}

// 主应用状态接口
export interface AppState {
  id?: string;
  messagesByInstance: Record<string, Message[]>;
  messages: Message[]; // 当前选中沙箱的消息
  inputMessage: string;
  sandboxList: Sandbox[];
  sandbox?: Sandbox;
  modelName?: string;
  modelList: Model[];
  creating: boolean;
  env: Record<string, string>;
  envLoaded: boolean;
  unauthenticated: boolean;
  systemPrompt: string;
  maximized: boolean; // 桌面最大化
  pollSandboxListTimer?: NodeJS.Timeout;
  canCreateSandbox: boolean;
}

export interface Model {
  name: string;
  display_name: string;
}

// 创建初始状态
const initialState: AppState = {
  messagesByInstance: {},
  messages: [],
  inputMessage: "",
  id: undefined,
  modelList: [],
  sandboxList: [],
  creating: false,
  env: {},
  envLoaded: false,
  unauthenticated: false,
  systemPrompt: defaultSystemPrompt,
  maximized: false,
  canCreateSandbox: false,
};

export const store = proxy<AppState>(initialState);

export const actions = {
  getCurrentId: () => {
    return store.id;
  },

  // 获取当前沙箱的消息
  getCurrentInstanceMessages: () => {
    const id = actions.getCurrentId();
    if (!id) {
      return [];
    }
    if (!store.messagesByInstance[id]) {
      store.messagesByInstance[id] = [...initialState.messages];
    }
    return store.messagesByInstance[id];
  },

  // 添加新消息
  addMessage: (
    text: string,
    sender: "user" | "assistant",
    type: "text" | "image" = "text",
    extra?: string
  ) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      timestamp: Date.now(),
      sender,
      type,
      extra,
    };
    const id = actions.getCurrentId();
    if (!id) {
      return;
    }
    if (!store.messagesByInstance[id]) {
      store.messagesByInstance[id] = [];
    }
    store.messagesByInstance[id].push(newMessage);
    store.messages = store.messagesByInstance[id];
  },

  // 删除消息
  removeMessage: (msgId: string) => {
    const id = actions.getCurrentId();
    if (!id) {
      return;
    }
    const messages = store.messagesByInstance[id];
    if (messages) {
      const index = messages.findIndex((msg) => msg.id === msgId);
      if (index !== -1) {
        messages.splice(index, 1);
        store.messages = messages;
      }
    }
  },

  // 清空所有消息
  clearMessages: () => {
    const id = actions.getCurrentId();
    if (!id) {
      return;
    }
    store.messagesByInstance[id] = [];
    store.messages = [];
  },

  // 设置输入消息
  setInputMessage: (text: string) => {
    store.inputMessage = text;
  },

  // 发送消息
  sendMessage: () => {
    const text = store.inputMessage.trim();
    if (text) {
      actions.addMessage(text, "user");
      store.inputMessage = "";
    }
  },

  // 添加图片消息
  addImageMessage: (imageUrl: string, sender: "user" | "assistant") => {
    actions.addMessage(imageUrl, sender, "image");
  },

  // 设置 IP
  setId: (id?: string) => {
    if (id) {
      const sandbox = store.sandboxList.find(
        (sandbox) => sandbox.SandboxId === id
      );
      if (!sandbox) {
        return;
      }
      store.id = id;
      store.sandbox = sandbox;

      const instanceMessages = store.messagesByInstance[id] || [
        {
          id: "1",
          text: "你好！我是你的虚拟助手。我可以帮助你浏览网站、研究信息或完成任务。今天你想让我做什么呢？",
          timestamp: Date.now(),
          sender: "assistant",
          type: "text",
        },
      ];
      store.messagesByInstance[id] = instanceMessages;
      store.messages = instanceMessages;
    } else {
      store.id = undefined;
      store.sandbox = undefined;
      store.messages = [];
    }
  },

  // 设置模型名称
  setModelName: (name: string) => {
    store.modelName = name;
  },

  selectFirstInstance: () => {
    const sandbox = store.sandboxList[0];
    if (sandbox) {
      actions.setId(sandbox.SandboxId);
    }
  },

  // 这里的消息提示改成回调了，因为这里没法用 hook
  createSandbox: async (params?: {
    osType?: OSType;
    onSuccess?: () => void;
    onError?: (errorMsg?: string) => void;
  }) => {
    store.creating = true;
    try {
      const res = await apiCreateSandbox({ OsType: params?.osType });
      const id = res.Result.SandboxId;
      params?.onSuccess?.();
      await sleep(1000);
      await actions.fetchSandboxList();
      actions.setId(id);
    } catch (error) {
      params?.onError?.((error as any).response?.data.message);
      console.error("创建沙箱失败", (error as any).response?.data.message);
    } finally {
      store.creating = false;
    }
  },

  fetchModelList: async () => {
    const resp = await getModelList();
    store.modelList = resp.models;
    store.modelName = store.modelList[0]?.name;
  },

  // 设置沙箱列表
  fetchSandboxList: async () => {
    try {
      const sandboxList = await getSandboxList();
      store.sandboxList = sandboxList;
      actions.restartPollSandboxList();

      if (store.sandbox) {
        // 已选沙箱，则更新选中状态
        const sandboxNew = store.sandboxList.find(
          (item) => item.SandboxId === store.sandbox?.SandboxId
        );
        if (sandboxNew) {
          actions.setId(sandboxNew.SandboxId);
        }
        return;
      } else {
        // 未选中沙箱，则选中第一个
        actions.selectFirstInstance();
      }
    } catch (error) {
      console.error("获取沙箱列表失败", error);
    }
  },

  setEnv: (env: Record<string, string>) => {
    store.env = env;
    store.envLoaded = true;
    store.canCreateSandbox = env.SUPPORT_SANDBOX_CREATE === "true";
  },

  getEnvItem: (key: string) => {
    return store.env[key];
  },

  setSystemPrompt: (prompt: string) => {
    store.systemPrompt = prompt;
    localStorage.setItem("systemPrompt", prompt);
  },

  resetSystemPrompt: () => {
    store.systemPrompt = defaultSystemPrompt;
  },

  toggleMaximized: () => {
    store.maximized = !store.maximized;
  },

  startPollSandboxList: () => {
    const timer = setTimeout(() => {
      actions.fetchSandboxList();
    }, 30000);
    store.pollSandboxListTimer = timer;
  },

  stopPollSandboxList: () => {
    if (store.pollSandboxListTimer) {
      clearTimeout(store.pollSandboxListTimer);
      store.pollSandboxListTimer = undefined;
    }
  },

  restartPollSandboxList: () => {
    actions.stopPollSandboxList();
    actions.startPollSandboxList();
  },
};

// 导出自定义 hook 方便组件使用
export function useAppStore() {
  return useSnapshot(store);
}

export default store;
