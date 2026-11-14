
import { reactive } from 'vue';

import { useTasksStore } from '../store/tasks';
import { useProjectsStore } from '../store/projects';

import {
  readSnapshot,
  writeSnapshot,
  deleteTaskRecord,
} from './database';

export const persistenceState = reactive({
  status: 'loading',
  error: '',
  canRetry: false,
  lastSavedAt: null,
  externalUpdateMessage: '',
});

let taskStore = null;
let projectStore = null;

let enabled = false;
let writing = false;
let applyingRemoteSnapshot = false;

let revision = 0;
let savedRevision = 0;

let lastRequestedSnapshot = '';
let scheduled = false;

const tabId =
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let channel = null;

function makeSnapshot() {
  return JSON.parse(JSON.stringify({
    tasks: taskStore.tasks,
    projects: projectStore.projects,
    nextProjectId: projectStore.nextProjectId,
  }));
}

function broadcastUpdate() {
  channel?.postMessage({
    type: 'snapshot-saved',
    source: tabId,
    savedAt: persistenceState.lastSavedAt,
  });
}

async function flushChanges() {
  if (!enabled || writing) return;

  writing = true;

  try {
    while (savedRevision < revision) {
      const targetRevision = revision;
      const snapshot = makeSnapshot();

      try {
        const savedAt = await writeSnapshot(snapshot);

        savedRevision = targetRevision;
        persistenceState.lastSavedAt = savedAt;
        persistenceState.status = 'saved';
        persistenceState.error = '';
        persistenceState.canRetry = false;
        persistenceState.externalUpdateMessage = '';

        broadcastUpdate();
      } catch (error) {
        console.error('TaskFlow: збереження не вдалося:', error);

        persistenceState.status = 'error';
        persistenceState.error =
          'Зміни поки що залишилися лише в пам’яті.';
        persistenceState.canRetry = true;
        return;
      }
    }
  } finally {
    writing = false;
  }
}

function requestSave(force = false) {
  if (!enabled) return;

  const fingerprint = JSON.stringify(makeSnapshot());

  if (!force && fingerprint === lastRequestedSnapshot) {
    return;
  }

  lastRequestedSnapshot = fingerprint;
  revision += 1;

  persistenceState.status = 'saving';
  persistenceState.error = '';
  persistenceState.canRetry = false;

  void flushChanges();
}

function onStoreChanged() {
  if (!enabled || applyingRemoteSnapshot) return;
  if (scheduled) return;

  scheduled = true;

  queueMicrotask(() => {
    scheduled = false;
    requestSave();
  });
}

function calculateNextProjectId(projects) {
  const maximumId = Math.max(
    0,
    ...projects.map((project) => {
      const match = /^project-(\d+)$/.exec(String(project.id));
      return match ? Number(match[1]) : 0;
    })
  );

  return maximumId + 1;
}

function patchStores(snapshot) {
  applyingRemoteSnapshot = true;

  try {
    const calculatedNextId =
      calculateNextProjectId(snapshot.projects);

    projectStore.$patch({
      projects: snapshot.projects,
      nextProjectId:
        Number.isSafeInteger(snapshot.nextProjectId) &&
        snapshot.nextProjectId >= calculatedNextId
          ? snapshot.nextProjectId
          : calculatedNextId,
    });

    taskStore.$patch({
      tasks: snapshot.tasks,
    });
  } finally {
    applyingRemoteSnapshot = false;
  }

  lastRequestedSnapshot = JSON.stringify(makeSnapshot());
}

async function handleRemoteUpdate(event) {
  const message = event.data;

  if (
    !message ||
    message.type !== 'snapshot-saved' ||
    message.source === tabId
  ) {
    return;
  }

  if (
    writing ||
    scheduled ||
    persistenceState.status === 'saving' ||
    persistenceState.status === 'error' ||
    revision !== savedRevision
  ) {
    persistenceState.externalUpdateMessage =
      'Інша вкладка зберегла зміни. У цій вкладці є ' +
      'локальний стан, тому автоматичне оновлення пропущено. ' +
      'Перевірте дані перед перезавантаженням.';

    return;
  }

  try {
    const snapshot = await readSnapshot();

    if (!snapshot.initialized) return;

    if (
      writing ||
      scheduled ||
      persistenceState.status === 'saving' ||
      revision !== savedRevision
    ) {
      persistenceState.externalUpdateMessage =
        'Отримано оновлення з іншої вкладки, але є локальні зміни. ' +
        'Перевірте дані перед перезавантаженням.';

      return;
    }

    patchStores(snapshot);

    persistenceState.lastSavedAt =
      snapshot.lastSavedAt ?? null;

    persistenceState.status = 'saved';
    persistenceState.externalUpdateMessage =
      'Дані оновлено з іншої вкладки.';
  } catch (error) {
    console.error(
      'TaskFlow: помилка синхронізації вкладок:',
      error
    );

    persistenceState.externalUpdateMessage =
      'Не вдалося отримати оновлення з іншої вкладки.';
  }
}

export function retrySave() {
  if (!enabled || persistenceState.status !== 'error') return;

  requestSave(true);
}

export async function initializePersistence(pinia) {
  taskStore = useTasksStore(pinia);
  projectStore = useProjectsStore(pinia);

  try {
    const snapshot = await readSnapshot();

    if (snapshot.initialized) {
      if (
        !Array.isArray(snapshot.tasks) ||
        !Array.isArray(snapshot.projects)
      ) {
        throw new Error('Некоректний формат локальних даних.');
      }

      patchStores(snapshot);

      // Додаємо lastSavedAt до вже існуючої бази,
      // створеної попередньою версією практичної.
      persistenceState.lastSavedAt = snapshot.lastSavedAt
        ?? await writeSnapshot(makeSnapshot());
    } else {
      persistenceState.lastSavedAt =
        await writeSnapshot(makeSnapshot());
    }

    persistenceState.status = 'saved';

    lastRequestedSnapshot = JSON.stringify(makeSnapshot());

    revision = 0;
    savedRevision = 0;

    enabled = true;

    taskStore.$subscribe(
      onStoreChanged,
      { detached: true, flush: 'sync' }
    );

    projectStore.$subscribe(
      onStoreChanged,
      { detached: true, flush: 'sync' }
    );

    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('taskflow-db-sync');
      channel.addEventListener('message', handleRemoteUpdate);
    }
  } catch (error) {
    console.error('TaskFlow: IndexedDB недоступна:', error);

    persistenceState.status = 'error';
    persistenceState.error =
      'Не вдалося відкрити або відновити локальні дані. ' +
      'Працює лише тимчасовий стан; наявну базу не перезаписано.';

    persistenceState.canRetry = false;
  }
}

// Точкове видалення запису з IndexedDB та синхронізація Pinia.
export async function deletePersistedTask(id) {
  if (!enabled) {
    throw new Error('Локальне збереження не ініціалізовано.');
  }

  if (
    persistenceState.status !== 'saved' ||
    writing ||
    scheduled ||
    revision !== savedRevision
  ) {
    throw new Error(
      'Дочекайтеся завершення поточного збереження.'
    );
  }

  const exists = taskStore.tasks.some(
    (task) => task.id === Number(id)
  );

  if (!exists) return false;

  const savedAt = await deleteTaskRecord(id);

  applyingRemoteSnapshot = true;

  try {
    taskStore.deleteTask(id);
  } finally {
    applyingRemoteSnapshot = false;
  }

  lastRequestedSnapshot = JSON.stringify(makeSnapshot());

  persistenceState.lastSavedAt = savedAt;
  persistenceState.status = 'saved';
  persistenceState.error = '';
  persistenceState.canRetry = false;

  broadcastUpdate();

  return true;
}

// Заміна даних після перевіреного імпорту JSON.
export async function replaceSnapshot(snapshot) {
  if (!enabled) {
    throw new Error('IndexedDB не готова до імпорту.');
  }

  if (
    persistenceState.status !== 'saved' ||
    writing ||
    scheduled ||
    revision !== savedRevision
  ) {
    throw new Error(
      'Перед імпортом дочекайтеся завершення збереження.'
    );
  }

  const safeSnapshot = {
    tasks: snapshot.tasks,
    projects: snapshot.projects,
    nextProjectId: snapshot.nextProjectId,
  };

  const savedAt = await writeSnapshot(safeSnapshot);

  patchStores(safeSnapshot);

  persistenceState.lastSavedAt = savedAt;
  persistenceState.status = 'saved';
  persistenceState.error = '';
  persistenceState.canRetry = false;

  persistenceState.externalUpdateMessage =
    'Дані імпортовано та збережено в IndexedDB.';

  broadcastUpdate();

  return true;
}
