import type { SceneDocument, Snapshot } from '../../domain/scene/types';
import { validateScene } from '../../domain/scene/validation';

export const STORAGE_NAMESPACE = 'w03-design-lab-v2';
export class StorageConflictError extends Error { constructor() { super('另一标签页已修改此作品。请保留当前画面为新副本后继续。'); this.name = 'StorageConflictError'; } }
let opening: Promise<IDBDatabase> | null = null;
let channel: BroadcastChannel | null = null;
function broadcast() { if (!channel && typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(STORAGE_NAMESPACE); return channel; }
export function subscribeStorageChanges(listener: (documentId: string) => void) {
  const current = broadcast(); const handler = (event: MessageEvent) => { if (event.data?.kind === 'saved' && typeof event.data.documentId === 'string') listener(event.data.documentId); };
  current?.addEventListener('message', handler);
  return () => current?.removeEventListener('message', handler);
}
function openDatabase(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('此浏览器无法使用 IndexedDB，请下载 JSON 保留作品。')); return; }
    const request = indexedDB.open(STORAGE_NAMESPACE, 1);
    request.onupgradeneeded = () => {
      for (const name of ['documents', 'backups', 'snapshots']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'documentId' });
      if (!request.result.objectStoreNames.contains('meta')) request.result.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
    request.onerror = () => reject(new Error(`本地存储打开失败：${request.error?.message ?? '请下载 JSON 保留作品'}`));
    request.onblocked = () => reject(new Error('本地存储被其他旧版标签页占用，请关闭旧标签页后重试。'));
  }).catch(error => { opening = null; throw error; });
  return opening;
}
function requestValue<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error('本地读写失败。')); }); }
function finished(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error('本地读写失败。')); tx.onabort = () => reject(tx.error ?? new Error('本地保存已取消。')); }); }
function valid(value: unknown): SceneDocument | null { try { return validateScene(value); } catch { return null; } }
const content = (scene: SceneDocument) => JSON.stringify({ ...scene, updatedAt: '' });
export async function listDocuments(): Promise<SceneDocument[]> {
  const db = await openDatabase(), tx = db.transaction(['documents', 'backups'], 'readonly'), done = finished(tx);
  const [documents, backups] = await Promise.all([requestValue<unknown[]>(tx.objectStore('documents').getAll()), requestValue<{ documentId: string; scene: unknown }[]>(tx.objectStore('backups').getAll())]);
  await done;
  const output = new Map<string, SceneDocument>();
  for (const backup of backups) { const scene = valid(backup.scene); if (scene) output.set(scene.documentId, scene); }
  for (const item of documents) { const scene = valid(item); if (scene) output.set(scene.documentId, scene); }
  return Array.from(output.values()).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
export async function saveDocument(input: SceneDocument): Promise<void> {
  const scene = validateScene(input), db = await openDatabase();
  const tx = db.transaction(['documents', 'backups', 'meta'], 'readwrite'), done = finished(tx);
  try {
    const store = tx.objectStore('documents');
    const previous = valid(await requestValue<unknown>(store.get(scene.documentId)));
    if (previous && (previous.revision > scene.revision || previous.revision === scene.revision && content(previous) !== content(scene))) throw new StorageConflictError();
    if (previous && content(previous) !== content(scene)) tx.objectStore('backups').put({ documentId: scene.documentId, scene: previous });
    store.put(scene);
    tx.objectStore('meta').put({ key: 'lastDocumentId', value: scene.documentId });
    await done;
    broadcast()?.postMessage({ kind: 'saved', documentId: scene.documentId, revision: scene.revision });
  } catch (error) { try { tx.abort(); } catch { /* already complete */ } await done.catch(() => undefined); throw error; }
}
export async function deleteDocument(documentId: string): Promise<void> {
  const db = await openDatabase(), tx = db.transaction(['documents', 'backups', 'snapshots', 'meta'], 'readwrite'), done = finished(tx);
  const meta = await requestValue<{ key: string; value: string } | undefined>(tx.objectStore('meta').get('lastDocumentId'));
  for (const name of ['documents', 'backups', 'snapshots']) tx.objectStore(name).delete(documentId);
  if (meta?.value === documentId) tx.objectStore('meta').delete('lastDocumentId');
  await done;
  broadcast()?.postMessage({ kind: 'saved', documentId, deleted: true });
}
export async function loadLastDocument(): Promise<SceneDocument | null> {
  const db = await openDatabase(), tx = db.transaction(['documents', 'backups', 'meta'], 'readonly'), done = finished(tx);
  const meta = await requestValue<{ key: string; value: string } | undefined>(tx.objectStore('meta').get('lastDocumentId'));
  let result: SceneDocument | null = null;
  if (meta?.value) {
    const [current, backup] = await Promise.all([requestValue<unknown>(tx.objectStore('documents').get(meta.value)), requestValue<{ scene: unknown } | undefined>(tx.objectStore('backups').get(meta.value))]);
    result = valid(current) ?? valid(backup?.scene);
  }
  await done;
  return result ?? (await listDocuments())[0] ?? null;
}
export async function saveSnapshots(documentId: string, snapshots: Snapshot[]): Promise<void> {
  if (snapshots.length > 100) throw new Error('版本存储最多保留 100 份，请先删除较早版本。');
  const copies = snapshots.map(snapshot => {
    const scene = validateScene(snapshot.scene);
    if (scene.documentId !== documentId) throw new Error('版本与作品 ID 不匹配。');
    return structuredClone({ ...snapshot, scene });
  });
  const db = await openDatabase(), tx = db.transaction('snapshots', 'readwrite'), done = finished(tx);
  tx.objectStore('snapshots').put({ documentId, snapshots: copies }); await done;
}
export async function loadSnapshots(documentId: string): Promise<Snapshot[]> {
  const db = await openDatabase(), tx = db.transaction('snapshots', 'readonly'), done = finished(tx);
  const saved = await requestValue<{ snapshots?: Snapshot[] } | undefined>(tx.objectStore('snapshots').get(documentId)); await done;
  if (!Array.isArray(saved?.snapshots)) return [];
  return saved.snapshots.filter(snapshot => snapshot && typeof snapshot.id === 'string' && typeof snapshot.name === 'string' && typeof snapshot.createdAt === 'string' && valid(snapshot.scene)?.documentId === documentId).map(snapshot => structuredClone(snapshot));
}
