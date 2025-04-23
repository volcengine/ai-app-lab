import axios from "axios";

export enum OSType {
  WINDOWS = "Windows",
  LINUX = "Linux",
}

// 创建一个统一的axios实例
export const apiClient = axios.create({
  baseURL: "/api/sandbox",
  headers: {
    "Content-Type": "application/json",
  },
});

// 创建实例
export async function createSandbox(params: { OsType?: OSType } = {}) {
  try {
    const resp = await apiClient.post("/create", params);
    return resp.data;
  } catch (error) {
    console.error("创建实例失败", error);
    throw error;
  }
}

// 删除实例
export async function deleteSandbox(id: string) {
  try {
    const response = await apiClient.post(`/delete`, {
      sandboxId: id,
    });
    return response.data;
  } catch (error) {
    console.error(`删除实例[${id}]失败`, error);
    throw error;
  }
}

// 获取沙箱列表
export async function getSandboxList() {
  try {
    const response = await apiClient.get("/list");
    return response.data.Result;
  } catch (error) {
    console.error("获取沙箱列表失败", error);
    throw error;
  }
}

export async function getVncUrl(sandboxId: string) {
  try {
    const response = await apiClient.get(
      `/terminal-url?sandboxId=${sandboxId}`
    );
    return response.data.Result;
  } catch (error) {
    console.error("获取远程桌面地址失败", error);
    throw error;
  }
}
