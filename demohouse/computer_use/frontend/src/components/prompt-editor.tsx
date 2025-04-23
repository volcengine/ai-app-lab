"use client";

import store, { actions, defaultSystemPrompt } from "@/store";
import { Message, Button, Input } from "@arco-design/web-react";
import { FC, useEffect, useState } from "react";
import { useSnapshot } from "valtio";

export const PromptEditor: FC = () => {
  const [message, messageHolder] = Message.useMessage();
  const [isEditing, setIsEditing] = useState(false);

  const { systemPrompt } = useSnapshot(store);

  const [promptText, setPromptText] = useState<string>(systemPrompt);

  useEffect(() => {
    const prompt = localStorage.getItem("systemPrompt");
    if (prompt) {
      actions.setSystemPrompt(prompt);
      setPromptText(prompt);
    }
  }, []);

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };

  const handlePromptSubmit = () => {
    setIsEditing(false);
    actions.setSystemPrompt(promptText);
    message?.success?.("系统提示词修改成功");
  };

  const handleResetPrompt = () => {
    setPromptText(systemPrompt);
    actions.setSystemPrompt(defaultSystemPrompt);
  };
  return (
    <div className="bg-white rounded-md shadow-sm h-full flex flex-col">
      {messageHolder}
      {/* 高级设置标识 */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-800">系统提示词</h2>
        <div className="flex items-center">
          <span className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-2.5 py-1 rounded">
            高级设置
          </span>
          <span className="ml-2 bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded">
            针对高级用户
          </span>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex gap-4 mb-3">
          <div className="flex-1">
            <p className="text-sm text-slate-600 mb-1">
              系统提示词决定系统如何响应和处理用户输入。修改提示词可能影响系统行为和输出质量。
            </p>

            <div className="text-xs text-slate-500">
              <span
                className={`${
                  isEditing ? "text-green-600 font-semibold" : "text-slate-500"
                }`}
              >
                {isEditing ? "编辑模式" : "查看模式"} -{" "}
                {isEditing ? "编辑完成后点击保存" : "点击文本区域进入编辑模式"}
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-2">
            <Button
              className={`${
                isEditing
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  : "bg-slate-50 text-slate-400"
              } font-medium py-1.5 px-3 rounded-md flex items-center text-xs transition-colors`}
              onClick={handleResetPrompt}
              disabled={!isEditing}
              icon={
                <svg
                  className="w-3.5 h-3.5 mr-1 inline"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  ></path>
                </svg>
              }
            >
              使用推荐
            </Button>

            {isEditing ? (
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-1.5 px-3 rounded-md text-xs"
                onClick={handlePromptSubmit}
              >
                保存修改
              </Button>
            ) : (
              <Button
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-medium py-1.5 px-3 rounded-md text-xs"
                onClick={handleEditToggle}
              >
                开始编辑
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 提示词编辑/显示区域 - 占用最大可用空间 */}
      <div className="flex-1 flex flex-col px-4 py-3 relative">
        <div
          className={`w-full rounded-md transition-all flex-1 flex flex-col ${
            isEditing ? "cursor-text" : "cursor-pointer"
          }`}
          onClick={!isEditing ? handleEditToggle : undefined}
        >
          {isEditing ? (
            <Input.TextArea
              key="edit"
              placeholder="请输入系统提示词"
              className="w-full p-3 font-mono text-sm focus:outline-none rounded-md resize-none !h-full"
              value={promptText}
              onChange={(v) => setPromptText(v)}
              autoFocus
            />
          ) : (
            <Input.TextArea
              key="preview"
              placeholder="请输入系统提示词"
              className="prompt-display w-full p-3 font-mono text-sm focus:outline-none rounded-md resize-none"
              value={promptText}
              onClick={handleEditToggle}
              readOnly
            />
          )}
        </div>
      </div>
    </div>
  );
};
