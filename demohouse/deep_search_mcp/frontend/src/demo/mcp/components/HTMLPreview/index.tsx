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

import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';

import styles from './index.module.less';

interface IframeHandle {
  focus: () => void;
  click: () => void;
}

interface Props {
  content: string;
}

const HTMLPreview = forwardRef<IframeHandle, Props>((props, ref) => {
  const { content } = props;
  // 创建一个内部的 ref 引用实际的 DOM 元素
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const iframeContent = useMemo(() => {
    // 安全脚本：拦截导航和增强功能
    const securityScript = `
    <script>
      window.alert = msg => console.log('Alert:', msg);
      window.confirm = msg => { console.log('Confirm:', msg); return true; };

      /******************** 基础拦截方案 ********************/
      // 拦截所有链接点击
      document.addEventListener('click', e => {
        const link = e.target.closest('a')
        if (!link) return
        const isMailto = link.href.startsWith('mailto:')
        const isTel = link.href.startsWith('tel:')
        const isDownload = link.hasAttribute('download')
        const isJavascript = link.href.startsWith('javascript:')
        const isDataUri = link.href.startsWith('data:')
        const isBlob = link.href.startsWith('blob:')
        const isNewTab = link.target === '_blank'

        // 允许的链接类型
        const shouldAllow = isNewTab || isMailto || isTel || isDownload || isDataUri || isBlob || isJavascript

        if (!shouldAllow) {
          e.preventDefault()
          handleNavigation(link.href, 'link')
        }
      })

      // 拦截表单提交
      document.addEventListener('submit', e => {
        e.preventDefault()
        const formData = new FormData(e.target)
        handleFormSubmit(e.target.action, formData)
      })

      // 拦截 window.location 跳转
      const originalLocation = window.location
      const locationProxy = new Proxy(originalLocation, {
        set(target, prop, value) {
          if (['href', 'assign', 'replace'].includes(prop)) {
            handleNavigation(value.toString(), 'location')
            return true // 阻止实际跳转
          }
          return Reflect.set(...arguments)
        },
      })

      // 拦截历史记录操作
      const originalPushState = history.pushState
      history.pushState = function (state, title, url) {
        handleNavigation(url, 'history-push')
        return originalPushState.apply(history, arguments)
      }

      const originalReplaceState = history.replaceState
      history.replaceState = function (state, title, url) {
        handleNavigation(url, 'history-replace')
        return originalReplaceState.apply(history, arguments)
      }

      /******************** 处理函数 ********************/
      function handleNavigation(url, source) {
        console.log(\`拦截到导航请求 (来源: \${source\}):\`, url)
      }

      function handleFormSubmit(url, formData) {
        console.log('拦截到表单提交:', url, Object.fromEntries(formData))
      }

      /******************** 增强方案：动态内容处理 ********************/
      // 等待文档加载完成
      document.addEventListener('DOMContentLoaded', () => {
        // 使用 MutationObserver 监控 DOM 变化
        const observer = new MutationObserver(mutations => {
          mutations.forEach(mutation => {
            if (mutation.addedNodes) {
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                  // Element node
                  // 重新绑定事件监听器
                  if (node.tagName === 'A') {
                    node.addEventListener('click', handleLinkClick)
                  }
                  if (node.tagName === 'FORM') {
                    node.addEventListener('submit', handleFormSubmit)
                  }
                }
              })
            }
          })
        })

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        console.log('🛡️ 安全脚本已加载，页面导航已被拦截保护')
      });
    </script>
  `;

    // 注入脚本到HTML内容
    const injectScript = (htmlContent: string): string => {
      // 检查是否已经是完整的HTML文档
      const hasHtmlTag = htmlContent.includes('<html');
      const hasBodyTag = htmlContent.includes('<body');
      const hasHeadTag = htmlContent.includes('<head');

      if (hasHtmlTag && hasBodyTag) {
        // 完整的HTML文档，在 </body> 前注入脚本
        const bodyClosingIndex = htmlContent.lastIndexOf('</body>');
        if (bodyClosingIndex !== -1) {
          return htmlContent.slice(0, bodyClosingIndex) + securityScript + htmlContent.slice(bodyClosingIndex);
        }
      }

      if (hasHtmlTag) {
        // 有html标签但可能没有body，在 </html> 前注入
        const htmlClosingIndex = htmlContent.lastIndexOf('</html>');
        if (htmlClosingIndex !== -1) {
          return `${htmlContent.slice(0, htmlClosingIndex)}<body>${securityScript}</body>${htmlContent.slice(
            htmlClosingIndex,
          )}`;
        }
      }

      if (hasHeadTag) {
        // 有head标签，在 </head> 前注入
        const headClosingIndex = htmlContent.lastIndexOf('</head>');
        if (headClosingIndex !== -1) {
          return `${htmlContent.slice(0, headClosingIndex)}${securityScript}${htmlContent.slice(headClosingIndex)}`;
        }
      }

      // 如果不是完整的HTML文档，包装成完整文档并注入脚本
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sandbox Document</title>
</head>
<body>
${htmlContent}
${securityScript}
</body>
</html>`;
    };
    return injectScript(content);
  }, [content]);

  // 使用 useImperativeHandle 自定义暴露给父组件的实例值
  useImperativeHandle(ref, () => ({
    // 暴露聚焦方法
    focus: () => {
      iframeRef.current?.focus();
    },
    click: () => {
      if (iframeRef.current) {
        iframeRef.current.click();
      }
    },
  }));

  return (
    <div className={styles.preview}>
      <iframe ref={iframeRef} className={styles.iframe} srcDoc={iframeContent} />
    </div>
  );
});

export default HTMLPreview;
