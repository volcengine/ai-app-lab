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

import React from 'react';

/**
 * 动态背景组件
 * 提供柔和的渐变和脉动效果，减少页面单调感
 */
const DynamicBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* 基础渐变背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f5f7fa] to-[#e4eaf1] opacity-90" />
      
      {/* 动态渐变效果 - 顶部粉色调 */}
      <div 
        className="absolute -top-[10%] -left-[10%] w-[120%] h-[120%] 
                  bg-[radial-gradient(circle_at_30%_20%,rgba(255,240,240,0.3),transparent_25%)] 
                  animate-pulse-slow"
      />
      
      {/* 动态渐变效果 - 右侧蓝色调 */}
      <div 
        className="absolute top-[40%] right-[10%] w-[60%] h-[60%] 
                  bg-[radial-gradient(circle_at_70%_60%,rgba(220,230,255,0.4),transparent_30%)] 
                  animate-pulse-slow-delay"
      />
      
      {/* 动态渐变效果 - 底部绿色调 */}
      <div 
        className="absolute bottom-[10%] left-[20%] w-[50%] h-[50%] 
                  bg-[radial-gradient(circle_at_40%_90%,rgba(240,255,245,0.3),transparent_25%)] 
                  animate-pulse-slow-delay2"
      />
    </div>
  );
};

export default DynamicBackground;