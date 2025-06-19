import { openDB } from 'idb';

const dbName = 'deep-research';
const storeName = 'history-message';

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
