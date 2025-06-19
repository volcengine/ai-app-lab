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

/**
 * 密钥转换工具模块
 * 支持在 snake_case、camelCase 和 PascalCase 之间进行转换
 * 可以递归处理对象和数组中的所有键名
 */

/**
 * 将 snake_case 转换为 camelCase
 */
const snakeToCamel = (str: string): string => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

/**
 * 将 camelCase 转换为 snake_case
 */
const camelToSnake = (str: string): string => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

/**
 * 将 PascalCase 转换为 snake_case
 * 处理首字母大写的情况，避免开头出现下划线
 */
const pascalToSnake = (str: string): string =>
  str
    .replace(/^[A-Z]/, letter => letter.toLowerCase()) // 首字母小写
    .replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`); // 其余大写字母前加下划线
/**
 * 转换类型枚举
 */
export enum TransformType {
  SNAKE_TO_CAMEL = 'snakeToCamel',
  CAMEL_TO_SNAKE = 'camelToSnake',
  PASCAL_TO_SNAKE = 'pascalToSnake',
}

/**
 * 递归转换对象的 key
 * @param data 要转换的数据
 * @param type 转换类型，默认为 snake_case 转 camelCase
 */
export const transformKeys = <T>(data: T, type: TransformType = TransformType.SNAKE_TO_CAMEL): any => {
  let transformFn: (str: string) => string;

  switch (type) {
    case TransformType.SNAKE_TO_CAMEL:
      transformFn = snakeToCamel;
      break;
    case TransformType.CAMEL_TO_SNAKE:
      transformFn = camelToSnake;
      break;
    case TransformType.PASCAL_TO_SNAKE:
      transformFn = pascalToSnake;
      break;
    default:
      transformFn = snakeToCamel;
  }

  if (Array.isArray(data)) {
    return data.map(item => transformKeys(item, type));
  }

  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [transformFn(key), transformKeys(value, type)]),
    );
  }

  return data;
};

/**
 * 将对象键名从 snake_case 转换为 camelCase（保持向后兼容）
 */
export const snakeKeysToCamel = <T>(data: T): any => transformKeys(data, TransformType.SNAKE_TO_CAMEL);

/**
 * 将对象键名从 camelCase 转换为 snake_case
 */
export const camelKeysToSnake = <T>(data: T): any => transformKeys(data, TransformType.CAMEL_TO_SNAKE);

/**
 * 将对象键名从 PascalCase 转换为 snake_case
 */
export const pascalKeysToSnake = <T>(data: T): any => transformKeys(data, TransformType.PASCAL_TO_SNAKE);
