/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useMemo, useRef, useEffect } from "react";
import { useReactToPrint } from "react-to-print";

import { createRoot } from "react-dom/client";
import {
  dataAdaptor,
  IDataItem,
  IVsStorybookPage,
} from "@/common/components/StoryBook";

import { VsStoryBookPrint } from "./index";

const DynamicContainerClassName = "dynamic-print-container";
export const usePrint = (
  data: IDataItem[] | IVsStorybookPage[],
  shouldAdaptor = true,
  filename?: string
) => {
  const contentRef = useRef<HTMLDivElement>(null);
  // 类型守卫函数：判断是否为 IVsStorybookPage 数组
  const isIVsStorybookPageArray = (
    data: IDataItem[] | IVsStorybookPage[]
  ): data is IVsStorybookPage[] =>
    Array.isArray(data) &&
    data.length > 0 &&
    "key" in data[0] &&
    typeof data[0].key === "string";

  const list = useMemo(() => {
    // 如果数据类型是 IVsStorybookPage[]，无需 dataAdaptor 转换
    if (isIVsStorybookPageArray(data) && !shouldAdaptor) {
      return data;
    }
    // 否则使用 dataAdaptor 进行转换
    return dataAdaptor(data as IDataItem[]);
  }, [data, shouldAdaptor]);

  // 清理函数：销毁动态mount的组件
  const cleanupPrintComponents = useCallback(() => {
    if (!contentRef.current) {
      return;
    }

    const printContainer = contentRef.current.querySelector(
      `.${DynamicContainerClassName}`
    ) as HTMLElement;
    if (printContainer) {
      console.log("清理动态mount的VsStoryBookPrint组件...");

      try {
        // 获取保存的root实例
        const root = (printContainer as any).__root;
        if (root) {
          root.unmount();
        }

        // 从DOM中移除容器
        if (printContainer.parentNode) {
          printContainer.parentNode.removeChild(printContainer);
        }

        console.log("VsStoryBookPrint组件已成功清理");
      } catch (error) {
        console.error("清理组件时出错:", error);
      }
    }
  }, []);

  // 动态mount VsStoryBookPrint组件
  const handleBeforePrint = useCallback(
    () =>
      new Promise<void>((resolve) => {
        // 先清理可能存在的旧节点，防止重复创建
        cleanupPrintComponents();

        if (!contentRef.current) {
          console.warn("无法mount打印组件：缺少容器引用");
          resolve();
          return;
        }
        console.log("开始动态mount VsStoryBookPrint组件...");

        const printContainer = document.createElement("div");
        printContainer.className = DynamicContainerClassName;

        contentRef.current.appendChild(printContainer);

        const root = createRoot(printContainer);

        root.render(
          <VsStoryBookPrint
            containerRef={{ current: printContainer }}
            list={list}
          />
        );

        // 将root保存到container上，便于销毁时使用
        (printContainer as any).__root = root;

        // 等待组件渲染完成
        setTimeout(() => {
          console.log("VsStoryBookPrint组件已动态mount");
          resolve();
        }, 500);
      }),
    [cleanupPrintComponents]
  );

  // 销毁动态mount的组件
  const handleAfterPrint = useCallback(() => {
    console.log("打印完成，开始清理组件");
    cleanupPrintComponents();
  }, [cleanupPrintComponents]);

  const reactToPrintFn = useReactToPrint({
    contentRef,
    onBeforePrint: handleBeforePrint,
    onAfterPrint: handleAfterPrint,
    documentTitle: filename ?? "我的故事书",
  });

  // 监听窗口焦点变化和页面隐藏/显示，用于处理取消打印的情况
  useEffect(() => {
    let timeoutId: number | undefined;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // 页面重新获得焦点时，延迟清理可能存在的打印节点
        // 使用延迟是因为正常打印完成也会触发焦点变化
        timeoutId = window.setTimeout(() => {
          const printContainer = contentRef.current?.querySelector(
            `.${DynamicContainerClassName}`
          );
          if (printContainer) {
            console.log("检测到页面焦点变化，清理可能遗留的打印节点");
            cleanupPrintComponents();
          }
        }, 1000);
      }
    };

    const handleBeforeUnload = () => {
      // 页面卸载前清理
      cleanupPrintComponents();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // 组件卸载时也清理
      cleanupPrintComponents();
    };
  }, [cleanupPrintComponents]);

  return { contentRef, reactToPrintFn };
};
