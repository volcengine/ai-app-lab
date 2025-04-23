"use client";

import { proxy, useSnapshot } from "valtio";
import {
  createSandbox as apiCreateSandbox,
  getSandboxList,
  OSType,
} from "@/services/sandbox";
import { getModelList } from "@/services/planner";

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
  ip?: string;
  messagesByInstance: Record<string, Message[]>;
  messages: Message[]; // 当前选中实例的消息
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
  loggedIn: boolean;  // 是否已登录
  checkingLogin: boolean; // 是否正在检查登录状态
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
  ip: undefined,
  modelList: [],
  sandboxList: [],
  creating: false,
  env: {},
  envLoaded: false,
  unauthenticated: false,
  systemPrompt: defaultSystemPrompt,
  maximized: false,
  loggedIn: false,
  checkingLogin: true,
};

export const store = proxy<AppState>(initialState);

export const actions = {
  getCurrentIp: () => {
    return store.ip;
  },

  // 获取当前实例的消息
  getCurrentInstanceMessages: () => {
    const ip = actions.getCurrentIp();
    if (!ip) {
      return [];
    }
    if (!store.messagesByInstance[ip]) {
      store.messagesByInstance[ip] = [...initialState.messages];
    }
    return store.messagesByInstance[ip];
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
    const ip = actions.getCurrentIp();
    if (!ip) {
      return;
    }
    if (!store.messagesByInstance[ip]) {
      store.messagesByInstance[ip] = [];
    }
    store.messagesByInstance[ip].push(newMessage);
    store.messages = store.messagesByInstance[ip];
  },

  // 删除消息
  removeMessage: (id: string) => {
    const ip = actions.getCurrentIp();
    if (!ip) {
      return;
    }
    const messages = store.messagesByInstance[ip];
    if (messages) {
      const index = messages.findIndex((msg) => msg.id === id);
      if (index !== -1) {
        messages.splice(index, 1);
        store.messages = messages;
      }
    }
  },

  // 清空所有消息
  clearMessages: () => {
    const ip = actions.getCurrentIp();
    if (!ip) {
      return;
    }
    store.messagesByInstance[ip] = [];
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
  setIp: (ip?: string) => {
    store.ip = ip;
    if (ip) {
      store.sandbox = store.sandboxList.find(
        (sandbox) => sandbox.Eip === ip || sandbox.PrimaryIp === ip
      );
      const instanceMessages = store.messagesByInstance[ip] || [
        {
          id: "1",
          text: "你好！我是你的虚拟助手。我可以帮助你浏览网站、研究信息或完成任务。今天你想让我做什么呢？",
          timestamp: Date.now(),
          sender: "assistant",
          type: "text",
        },
      ];
      store.messagesByInstance[ip] = instanceMessages;
      store.messages = instanceMessages;
    }
  },

  // 设置模型名称
  setModelName: (name: string) => {
    store.modelName = name;
  },

  // 这里的消息提示改成回调了，因为这里没法用 hook
  createSandbox: async (params?: {
    osType?: OSType;
    onSuccess?: () => void;
    onError?: (errorMsg?: string) => void;
  }) => {
    store.creating = true;
    try {
      await apiCreateSandbox({ OsType: params?.osType });
      params?.onSuccess?.();
      await actions.fetchSandboxList();
    } catch (error) {
      params?.onError?.((error as any).response?.data.message);
      console.error("创建实例失败", (error as any).response?.data.message);
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

      if (store.sandbox) {
        // 已选实例，则更新选中状态
        const sandboxNew = store.sandboxList.find(
          (item) => item.SandboxId === store.sandbox?.SandboxId
        );
        if (sandboxNew) {
          actions.setIp(sandboxNew.Eip || sandboxNew.PrimaryIp);
        }
        return;
      } else {
        // 未选中实例，则选中第一个
        const sandbox = store.sandboxList.find(
          (item) => item.Eip || item.PrimaryIp
        );
        if (sandbox && !store.sandbox) {
          actions.setIp(sandbox.Eip || sandbox.PrimaryIp);
        }
      }
    } catch (error) {
      console.error("获取沙箱列表失败", error);
    }
  },

  setEnv: (env: Record<string, string>) => {
    store.env = env;
    store.envLoaded = true;
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

  setLoggedIn: (loggedIn: boolean) => {
    store.loggedIn = loggedIn;
  },

  setCheckingLogin: (checkingLogin: boolean) => {
    store.checkingLogin = checkingLogin;
  },
};

// 导出自定义 hook 方便组件使用
export function useAppStore() {
  return useSnapshot(store);
}

export default store;
