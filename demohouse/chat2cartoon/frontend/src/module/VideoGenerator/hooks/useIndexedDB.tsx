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

import { openDB } from 'idb';

const dbName = 'video-generator-bot';
const storeName = 'message-store';

export const useIndexedDB = (storeUniqueId: string) => {
  const id = storeUniqueId;

  // 初始化 db， 新建一个 store
  const init = async () =>
    await openDB(dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      },
    });

  // 获取数据
  const getItem = async () => {
    const db = await init();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const data = await store.get(id);
    if (!data) {
      return undefined;
    }
    return data;
  };

  // 添加数据
  const addItem = async (data: any) => {
    const db = await init();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    await store.add({ id, ...data });
  };

  // 更新数据
  const putItem = async (data: any) => {
    const db = await init();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const prevData = await store.get(id);
    if (!prevData) {
      return store.put({ id, ...data });
    }
    await store.put({ id, ...prevData, ...data });
  };

  // 删除数据
  const deleteItem = async () => {
    const db = await init();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    await store.delete(id);
  };

  return 'indexedDB' in window
    ? {
        getItem,
        addItem,
        putItem,
        deleteItem,
      }
    : null;
};
