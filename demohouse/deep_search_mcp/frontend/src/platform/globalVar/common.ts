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

export enum ArkAppNames {
  Ark = 'ark',
  ArkBoe = 'ark-boe',
  ArkStg = 'ark-stg',
}

export enum ArkServiceCodeNames {
  Ark = 'ark',
  ArkBoe = 'ark_boe',
  ArkStg = 'ark_stg',
}

export enum ServiceSuffix {
  Boe = '-boe',
  Stg = '-stg',
  Prod = '',
}

export enum BUILD_ENV {
  Boe = 'boe',
  Stg = 'stg',
  Online = 'online',
}

export const buildEnvMap: Record<BUILD_ENV, ArkAppNames> = {
  [BUILD_ENV.Boe]: ArkAppNames.ArkBoe,
  [BUILD_ENV.Stg]: ArkAppNames.ArkStg,
  [BUILD_ENV.Online]: ArkAppNames.Ark,
};

export const serviceNameMap: Record<string, string> = {
  [ArkAppNames.Ark]: ArkServiceCodeNames.Ark,
  [ArkAppNames.ArkBoe]: ArkServiceCodeNames.ArkBoe,
  [ArkAppNames.ArkStg]: ArkServiceCodeNames.ArkStg,
};

export const IS_DEV = process.env.NODE_ENV === 'development';
