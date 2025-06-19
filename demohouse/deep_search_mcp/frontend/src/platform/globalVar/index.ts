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

import { getLocalStorage } from '@/utils/localStorage';

import {
  ArkAppNames,
  ArkServiceCodeNames,
  BUILD_ENV,
  IS_DEV,
  buildEnvMap,
  serviceNameMap,
} from './common';
const DefaultProject = '';
export const LatestProjectStorageKeySuffix = `latest-project-value`;
/**
 * 获取url参数
 * @param {string} param
 * @returns 得到的值
 */
export function getUrlParam(param: string) {
  const searchParams = new URLSearchParams(location.search);
  return searchParams.get(param);
}

class GlobalVar {
  APPNAME: string;
  TOP_REGION: string;
  ROOT_PATH: string;
  SERVICE_NAME: string;
  PROJECT_NAME?: string;
  SET_PROJECT_NAME: (projectName: string) => void;
  constructor() {
    const appName = ArkAppNames.Ark;
    this.APPNAME = IS_DEV
      ? appName
      : (window.location.pathname.split('/')[1] ?? ArkAppNames.Ark);
    this.TOP_REGION = 'cn-beijing';
    this.ROOT_PATH = `${this.APPNAME}/region:${this.APPNAME}+${this.TOP_REGION}`;
    this.SERVICE_NAME = serviceNameMap[this.APPNAME] ?? ArkServiceCodeNames.Ark;
    this.PROJECT_NAME =
      getUrlParam('projectName') ||
      getLocalStorage(`${this.APPNAME}-${LatestProjectStorageKeySuffix}`) ||
      DefaultProject;
    this.SET_PROJECT_NAME = (projectName: string) => {
      this.PROJECT_NAME = projectName;
    };
  }
}

export default new GlobalVar();

export * from './common';
