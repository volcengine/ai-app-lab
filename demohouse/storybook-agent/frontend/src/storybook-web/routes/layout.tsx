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

import { useEffect, useState } from "react";
import { Outlet } from "@modern-js/runtime/router";
import { Message } from "@arco-design/web-react";

import AuthModal from "@/common/components/AuthModal";
import DynamicBackground from "@/common/components/Background";
import { getUserTokenCookie, setUserTokenCookie, hasUserTokenCookie } from "@/common/utils/cookie";

import "@arco-design/web-react/dist/css/arco.min.css";
import "../styles/arco.css";
import "../styles/global.css";
import "./index.css";

export default function Layout() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [, setUserToken] = useState("");
  
  // 在组件挂载时检查User Token
  useEffect(() => {
    const hasKey = hasUserTokenCookie();
    if (!hasKey) {
      // 如果没有User Token，显示认证弹窗
      setShowAuthModal(true);
    } else {
      // 如果有User Token，加载到状态中
      const savedKey = getUserTokenCookie();
      setUserToken(savedKey);
    }
  }, []);
  
  // 处理认证成功
  const handleAuthSuccess = (token: string) => {
    // 保存 User Token 到cookie
    setUserTokenCookie(token);
    setUserToken(token);
    setShowAuthModal(false);
    
    Message.success("认证成功");
  };

  return (
    <>
      {/* 动态背景组件 */}
      <DynamicBackground />
      
      <Outlet />
      <AuthModal
        visible={showAuthModal}
        onOk={handleAuthSuccess}
      />
    </>
  );
}
