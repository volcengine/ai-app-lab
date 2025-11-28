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

import './index.scss';

const rightFakePages = [
  {
    backgroundColor: '#cccccc',
    marginTop: '3px',
    transform: 'translateX(10px)',
    height: 'calc(100% - 5px)',
  },
  {
    backgroundColor: '#d7d7d7',
    marginTop: '2px',
    transform: 'translateX(7px)',
    height: 'calc(100% - 3px)',
  },
  {
    backgroundColor: '#ededed',
    marginTop: '1px',
    transform: 'translateX(3px)',
    height: 'calc(100% - 1px)',
  },
];

const leftFakePages = [
  {
    backgroundColor: '#cccccc',
    marginTop: '3px',
    paddingLeft: '10px',
    transform: 'translateX(-10px)',
    height: 'calc(100% - 5px)',
  },
  {
    backgroundColor: '#d7d7d7',
    marginTop: '2px',
    paddingLeft: '7px',
    transform: 'translateX(-7px)',
    height: 'calc(100% - 3px)',
  },
  {
    backgroundColor: '#ededed',
    marginTop: '1px',
    paddingLeft: '3px',
    transform: 'translateX(-3px)',
    height: 'calc(100% - 1px)',
  },
];

export function VsStoryBookRightPageThickness(props: { className?: string }) {
  const { className } = props;
  return (
    <>
      {rightFakePages.map((item, index) => (
        <div
          key={index}
          className={`vs-storybook__right-page-thickness ${className}`}
          style={{ ...(item ?? {}) }}
        />
      ))}
    </>
  );
}

export function VsStoryBookLeftPageThickness(props: { className?: string }) {
  const { className } = props;
  return (
    <>
      {leftFakePages.map((item, index) => (
        <div
          key={index}
          className={`vs-storybook__left-page-thickness ${className}`}
          style={{ ...(item ?? {}) }}
        />
      ))}
    </>
  );
}
