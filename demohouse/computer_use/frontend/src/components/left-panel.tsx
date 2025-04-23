"use client";

import {
  IconThumbUp,
  IconThumbDown,
  IconCopy,
  IconShareInternal,
  IconRefresh,
  IconUp,
} from "@arco-design/web-react/icon";
import { Button, Divider, Space, Dropdown, Menu } from "@arco-design/web-react";
import { Input } from "@arco-design/web-react";
import { store, actions, Message } from "@/store";
import { FC, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { runTask } from "@/services/planner";
import { IconStop } from "@arco-design/web-react/icon";
import { IconCaretDown, IconCaretLeft } from "@arco-design/web-react/icon";

const getActionNameFromText = (text: string) => {
  return text.split("(")[0]?.trim();
};

const IconHover: FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="rounded-md hover:bg-gray-200 bg-blue px-1 cursor-pointer text-[#737A87]">
      {children}
    </div>
  );
};

const IconSend: FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  return (
    <svg
      width="17"
      height="18"
      viewBox="0 0 17 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="customGradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
          gradientTransform="rotate(77.86)"
        >
          <stop offset="-3.23%" stopColor="#8AC5FF" />
          <stop offset="51.11%" stopColor="#74ABFF" />
          <stop offset="98.65%" stopColor="#E1A9FF" />
        </linearGradient>
      </defs>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={disabled ? "#C7CCD6" : "url(#customGradient)"}
        d="M0.875 1.50105V6.37605L0.877903 6.44199C0.89332 6.61674 0.969646 6.78136 1.09467 6.90638L3.18934 9.00105L1.09467 11.0957L1.05009 11.1444C0.937434 11.2789 0.875 11.4492 0.875 11.626V16.501L0.876997 16.5571C0.915343 17.0925 1.49859 17.4219 1.98164 17.1608L15.8566 9.66083L15.909 9.62987C16.3805 9.32598 16.363 8.615 15.8566 8.34127L1.98164 0.84127L1.93134 0.81635C1.44214 0.595511 0.875 0.951946 0.875 1.50105ZM3.18934 9.00105L2.44045 9.75H8.00006C8.20717 9.75 8.37506 9.58211 8.37506 9.375V8.625C8.37506 8.41789 8.20717 8.25 8.00006 8.25H2.43835L3.18934 9.00105Z"
      />
    </svg>
  );
};

const HelperContent: FC<{ last?: boolean }> = ({ last = false }) => {
  return (
    <div className={`mt-2 ${last ? "" : "invisible group-hover:visible"}`}>
      <Space size="mini">
        <IconHover>
          <IconThumbUp />
        </IconHover>
        <IconHover>
          <IconThumbDown />
        </IconHover>
      </Space>
      <Divider type="vertical" className="mx-2" />
      <Space size="mini">
        <IconHover>
          <IconCopy />
        </IconHover>
        <IconHover>
          <IconShareInternal />
        </IconHover>
        <IconHover>
          <IconRefresh />
        </IconHover>
      </Space>
    </div>
  );
};

// 消息内容组件
const MessageContent: FC<{ message: Message; last?: boolean }> = ({
  message,
  last,
}) => {
  const [open, setOpen] = useState(false);

  if (message.type === "image") {
    return (
      <div className="relative w-full max-w-[240px] overflow-hidden rounded-md">
        <img src={message.text} className="relative object-cover max-w-full" />
      </div>
    );
  }

  return (
    <div className="group w-full">
      <p className="leading-relaxed text-slate-700 whitespace-pre-wrap break-words text-xs font-normal">
        {message.text}
      </p>
      {message.extra && (
        <div className="text-slate-700">
          <div
            className={`mt-2 bg-gray-100 text-slate-500 ${
              !open ? "rounded-md" : "rounded-t-md rounded-b-none"
            } px-2 py-1 text-xs whitespace-no-wrap break-all border border-gray-100 flex justify-between items-center w-full cursor-pointer border-gray-300`}
            onClick={() => setOpen(!open)}
          >
            <div>Action: {getActionNameFromText(message.extra)}</div>
            {open ? <IconCaretDown /> : <IconCaretLeft />}
          </div>
          {open && (
            <div className="w-full bg-gray-40 rounded-b-md px-2 py-1 text-xs whitespace-no-wrap break-all border-x border-b border-gray-300 scrollbar-thin">
              {message.extra}
            </div>
          )}
        </div>
      )}

      {message.sender === "assistant" && <HelperContent last={last} />}
    </div>
  );
};

export const LeftPanel: FC = () => {
  const { messages, inputMessage, id, modelName, modelList } = useSnapshot(
    store,
    {
      sync: true,
    }
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const abortController = useRef<AbortController | null>(null);

  // 判断聊天窗口是否可用（需要选中沙箱）
  const isChatDisabled = !id || !modelName;

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  };

  useEffect(() => {
    actions.fetchModelList();
  }, []);

  const selectedModel = modelList.find((m) => m.name === modelName);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendMessage = () => {
    if (isChatDisabled) return;
    actions.sendMessage();
    startExecution();
  };

  const startExecution = async () => {
    abortController.current = new AbortController();
    setIsRunning(true);
    try {
      await runTask({
        onData: (data) => {
          if (data.screenshot) {
            actions.addMessage(data.screenshot, "assistant", "image");
          } else {
            actions.addMessage(
              data.summary || "",
              "assistant",
              "text",
              data.action
            );
          }
        },
        prompt: inputMessage,
        abortSignal: abortController.current.signal,
      });
    } catch (error) {
      console.error("执行出错", error);
    } finally {
      setIsRunning(false);
      abortController.current = null;
    }
  };

  const stopExecution = () => {
    if (abortController.current) {
      abortController.current.abort();
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-md">
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            <p>
              {isChatDisabled ? "请先选择或创建一个沙箱" : "开始新的对话吧"}
            </p>
          </div>
        ) : (
          <div className="flex-1 space-y-3">
            {messages.map((message, idx) => (
              <div
                key={message.id}
                className={`flex items-start max-w-full ${
                  message.sender === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`flex-shrink-0 ${
                    message.sender === "user" ? "max-w-[70%]" : "w-full"
                  }`}
                >
                  <div
                    className={`rounded-md ${
                      message.sender === "assistant" ? "" : "bg-[#F3F7FF]"
                    } p-[6px_8px]`}
                  >
                    <MessageContent
                      message={message}
                      last={idx === messages.length - 1}
                    />
                  </div>
                </div>
              </div>
            ))}
            {isRunning && (
              <div className="flex items-start gap-2 max-w-full">
                <div className="flex-shrink-0 max-w-[70%]">
                  <div className="p-2.5 text-xs border-0 shadow-sm rounded-md bg-indigo-50 rounded-tl-none">
                    <div className="flex items-center space-x-2 py-1 px-1">
                      <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse opacity-75"></div>
                      <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse opacity-75 animation-delay-[300ms]"></div>
                      <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse opacity-75 animation-delay-[600ms]"></div>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 mx-1">
                    正在思考...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="px-3 py-3 border-t border-slate-100 bg-white">
        <div className="flex items-center justify-end">
          {modelList.length > 0 && (
            <Dropdown
              trigger="click"
              position="tr"
              droplist={
                <Menu>
                  {modelList.map((model) => (
                    <Menu.Item
                      key={model.name}
                      onClick={() => actions.setModelName(model.name)}
                    >
                      {model.display_name}
                    </Menu.Item>
                  ))}
                </Menu>
              }
              disabled={isChatDisabled}
            >
              <Button
                type="text"
                size="mini"
                className="mr-2 text-xs mb-2"
                disabled={isChatDisabled}
              >
                {selectedModel?.display_name || "选择模型"}
                <IconUp className="ml-1" />
              </Button>
            </Dropdown>
          )}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center space-x-1.5 relative">
            <div className="rounded-md w-full">
              <div className="relative rounded-md p-[1px] bg-gradient-to-r from-[#8AC5FF] via-[#74ABFF] to-[#E1A9FF]">
                <Input.TextArea
                  className="w-full min-h-[36px] max-h-24 px-2.5 py-1.5 resize-none text-xs rounded-[4px] shadow-sm border-0 focus:outline-none bg-white"
                  placeholder={
                    isChatDisabled ? "请先选择一个沙箱..." : "问我任何问题吧！"
                  }
                  value={inputMessage}
                  onChange={(v) => actions.setInputMessage(v)}
                  onKeyDown={handleKeyDown}
                  disabled={isRunning || isChatDisabled || !modelName}
                />
              </div>
            </div>
            {isRunning && (
              <Button
                shape="circle"
                size="mini"
                type="primary"
                onClick={stopExecution}
                icon={<IconStop />}
                className="!absolute top-6 right-2 bottom-2 cursor-pointer z-100"
              >
                <span className="sr-only">停止</span>
              </Button>
            )}
            {!isRunning && (
              <div
                className={`absolute right-2 bottom-2 ${
                  !!inputMessage ? "cursor-pointer" : ""
                } z-100 transition-all`}
                onClick={sendMessage}
              >
                <IconSend disabled={!inputMessage} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
