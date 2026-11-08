import { load } from "@tauri-apps/plugin-store";

export const getAppStore = async () => {
  return await load("settings.json", { autoSave: true, defaults: {} });
};

export const setStoreValue = async (key: string, value: any) => {
  const store = await getAppStore();
  await store.set(key, value);
};

export const getStoreValue = async <T>(key: string, defaultValue: T): Promise<T> => {
  const store = await getAppStore();
  const val = await store.get<T>(key);
  return val !== undefined ? val : defaultValue;
};
