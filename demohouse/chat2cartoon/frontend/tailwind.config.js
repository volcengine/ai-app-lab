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

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out forwards',
        shake: 'shake 0.5s ease-in-out 1',
      },
      colors: {
        gray: {
          default: 'var(--color-text-1)',
          secondary: 'var(--color-text-2)',
          caption: 'var(--color-text-3)',
          disabled: 'var(--color-text-4)',
        },
        success: 'rgb(var(--success-6))',
        primary: 'rgb(var(--primary-6))',
        danger: 'rgb(var(--danger-6))',
        warning: 'rgb(var(--warning-6))',
        brand1: 'rgb(var(--arcoblue-6))',
        brand2: 'rgb(var(--cyan-6))',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Helvetica Neue',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        DEFAULT: '0 1px 2px 0 rgba(0, 0, 0, 0.1)',
        md: '0 2px 8px 0px rgba(0, 0, 0, 0.1)',
        lg: '0 4px 16px 0px rgba(0, 0, 0, 0.1)',
      },
      strokeWidth: {
        0: '0',
        1: '0.25rem',
        2: '0.5rem',
      },
    },
  },
};
