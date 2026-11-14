
import { openDB } from 'idb';

const DB_NAME = 'taskflow-db';
const DB_VERSION = 1;

let databasePromise = null;

export function getDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new Error('Цей браузер не підтримує IndexedDB.')
    );
  }

  if (!databasePromise) {
    databasePromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata');
        }
      },
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

// Читання повного стану бази.
export async function readSnapshot() {
  const db = await getDatabase();

  const tx = db.transaction(
    ['tasks', 'projects', 'metadata'],
    'readonly'
  );

  const [
    tasks,
    projects,
    initialized,
    nextProjectId,
    lastSavedAt,
  ] = await Promise.all([
    tx.objectStore('tasks').getAll(),
    tx.objectStore('projects').getAll(),
    tx.objectStore('metadata').get('initialized'),
    tx.objectStore('metadata').get('nextProjectId'),
    tx.objectStore('metadata').get('lastSavedAt'),
  ]);

  await tx.done;

  return {
    tasks,
    projects,
    initialized: initialized === true,
    nextProjectId,
    lastSavedAt: lastSavedAt ?? null,
  };
}

// Повний атомарний запис snapshot.
export async function writeSnapshot(snapshot) {
  const db = await getDatabase();

  const tx = db.transaction(
    ['tasks', 'projects', 'metadata'],
    'readwrite'
  );

  const taskStore = tx.objectStore('tasks');
  const projectStore = tx.objectStore('projects');
  const metadataStore = tx.objectStore('metadata');

  const savedAt = new Date().toISOString();

  await Promise.all([
    taskStore.clear(),
    projectStore.clear(),
  ]);

  await Promise.all([
    ...snapshot.tasks.map((task) => taskStore.put(task)),
    ...snapshot.projects.map((project) => projectStore.put(project)),
    metadataStore.put(true, 'initialized'),
    metadataStore.put(snapshot.nextProjectId, 'nextProjectId'),
    metadataStore.put(savedAt, 'lastSavedAt'),
    tx.done,
  ]);

  return savedAt;
}

// Додаткове завдання № 3.
// Точкове видалення одного запису без повного переписування snapshot.
export async function deleteTaskRecord(id) {
  const db = await getDatabase();

  const tx = db.transaction(
    ['tasks', 'metadata'],
    'readwrite'
  );

  const taskStore = tx.objectStore('tasks');
  const metadataStore = tx.objectStore('metadata');

  await taskStore.delete(Number(id));

  const savedAt = new Date().toISOString();

  await metadataStore.put(savedAt, 'lastSavedAt');

  await tx.done;

  return savedAt;
}

// Додаткове завдання № 5.
// Статистика читається безпосередньо з IndexedDB.
export async function readDatabaseStats() {
  const db = await getDatabase();

  const tx = db.transaction(
    ['tasks', 'projects', 'metadata'],
    'readonly'
  );

  const [
    taskCount,
    projectCount,
    lastSavedAt,
  ] = await Promise.all([
    tx.objectStore('tasks').count(),
    tx.objectStore('projects').count(),
    tx.objectStore('metadata').get('lastSavedAt'),
  ]);

  await tx.done;

  return {
    taskCount,
    projectCount,
    lastSavedAt: lastSavedAt ?? null,
  };
}
