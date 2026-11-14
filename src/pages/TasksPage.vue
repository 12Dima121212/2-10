
<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';

import AppTabbar from '../components/AppTabbar.vue';
import TaskCard from '../components/TaskCard.vue';
import TaskForm from '../components/TaskForm.vue';
import TaskListControls from '../components/TaskListControls.vue';

import { useTasksStore } from '../store/tasks';
import { useProjectsStore } from '../store/projects';

import {
  persistenceState,
  retrySave,
  deletePersistedTask,
  replaceSnapshot,
} from '../services/persistence';

import {
  createBackup,
  validateBackup,
} from '../services/backup';

import '../css/task-components.css';
import '../css/task-list.css';
import '../css/persistence.css';

const taskStore = useTasksStore();
const projectStore = useProjectsStore();

const {
  tasks,
  visibleTasks,
  searchText,
  selectedStatus,
  selectedPriority,
  selectedProject,
  sortOrder,
  onlyUncompleted,
  onlyWithoutDueDate,
} = storeToRefs(taskStore);

const {
  projects,
  projectStats,
} = storeToRefs(projectStore);

const showForm = ref(false);
const editingId = ref(null);
const newProjectTitle = ref('');
const newProjectError = ref('');
const saveFeedback = ref('');
const importInput = ref(null);

// Посилання на створений JSON-файл.
const downloadUrl = ref('');
const downloadFileName = ref('');

const editingTask = computed(() =>
  tasks.value.find(
    (task) => task.id === editingId.value
  ) ?? null
);

const selectedProjectStats = computed(() =>
  projectStats.value.find(
    (project) => project.id === selectedProject.value
  ) ?? null
);

// Повідомлення про стан збереження.
const saveMessage = computed(() => {
  if (persistenceState.status === 'loading') {
    return 'Завантаження локальних даних…';
  }

  if (persistenceState.status === 'saving') {
    return 'Збереження змін у IndexedDB…';
  }

  if (persistenceState.status === 'saved') {
    return 'Усі зміни збережено в цьому браузері.';
  }

  return persistenceState.error ||
    'Помилка локального збереження.';
});

// Дата останнього успішного збереження.
const lastSavedMessage = computed(() => {
  if (!persistenceState.lastSavedAt) {
    return 'Час останнього збереження невідомий.';
  }

  return `Останнє успішне збереження: ${
    new Date(persistenceState.lastSavedAt).toLocaleString('uk-UA')
  }`;
});

function startCreate() {
  editingId.value = null;
  showForm.value = true;
  saveFeedback.value = '';
}

function startEdit(id) {
  editingId.value = id;
  showForm.value = true;
  saveFeedback.value = '';
}

function cancelForm() {
  editingId.value = null;
  showForm.value = false;
}

// Створення або редагування завдання.
function saveTask(values) {
  const saved = values.id === null
    ? taskStore.addTask(values)
    : taskStore.updateTask(values);

  if (saved) {
    saveFeedback.value = '';
    cancelForm();
  } else {
    saveFeedback.value =
      'Не вдалося зберегти завдання. Перевірте введені дані.';
  }
}

// Видалення окремого завдання через IndexedDB delete().
async function handleDelete(id) {
  const task = tasks.value.find(
    (item) => item.id === Number(id)
  );

  if (!task) return;

  if (!window.confirm(`Видалити завдання «${task.title}»?`)) {
    return;
  }

  try {
    await deletePersistedTask(id);

    if (editingId.value === Number(id)) {
      cancelForm();
    }

    saveFeedback.value =
      'Завдання видалено та збережено в IndexedDB.';
  } catch (error) {
    saveFeedback.value =
      error.message || 'Не вдалося видалити завдання.';
  }
}

// Створення нового проєкту.
function createProject() {
  const project = projectStore.addProject(newProjectTitle.value);

  if (!project) {
    newProjectError.value =
      'Назва має містити 3–40 символів і не повторювати інші проєкти.';
    return;
  }

  newProjectTitle.value = '';
  newProjectError.value = '';
  selectedProject.value = project.id;
  saveFeedback.value = '';
}

// Масове переведення завдань вибраного проєкту в статус «У роботі».
function moveProjectTasksToProgress() {
  const project = selectedProjectStats.value;

  if (!project) {
    saveFeedback.value =
      'Спочатку виберіть конкретний проєкт у фільтрі.';
    return;
  }

  if (project.taskCount === 0) {
    saveFeedback.value =
      'У вибраному проєкті поки немає завдань.';
    return;
  }

  const confirmed = window.confirm(
    `Перевести всі ${project.taskCount} завдань проєкту ` +
    `«${project.title}» у статус «У роботі»?`
  );

  if (!confirmed) return;

  const changedCount = taskStore.setProjectTasksInProgress(
    project.id
  );

  saveFeedback.value =
    `У статус «У роботі» переведено завдань: ${changedCount}.`;
}

// Додаткове завдання № 1: експорт JSON.
function exportJSON() {
  if (persistenceState.status !== 'saved') {
    saveFeedback.value =
      'Спочатку дочекайтеся завершення локального збереження.';
    return;
  }

  try {
    const backup = createBackup({
      tasks: tasks.value,
      projects: projects.value,
      nextProjectId: projectStore.nextProjectId,
    });

    const json = JSON.stringify(backup, null, 2);

    const blob = new Blob(
      [json],
      { type: 'application/json;charset=utf-8' }
    );

    // Видаляємо попереднє тимчасове посилання.
    if (downloadUrl.value) {
      URL.revokeObjectURL(downloadUrl.value);
    }

    downloadUrl.value = URL.createObjectURL(blob);

    downloadFileName.value =
      `taskflow-backup-${new Date().toISOString().slice(0, 10)}.json`;

    saveFeedback.value =
      'Резервну копію JSON сформовано. Натисніть «Завантажити JSON-файл».';
  } catch (error) {
    saveFeedback.value =
      `Помилка експорту: ${error.message}`;
  }
}

// Повідомлення після натискання посилання завантаження.
function markDownloadStarted() {
  saveFeedback.value =
    'Завантаження JSON-файлу розпочато. Перевірте папку «Завантаження» браузера.';
}

// Відкриваємо вибір JSON-файлу.
function openImportDialog() {
  if (persistenceState.status !== 'saved') {
    saveFeedback.value =
      'Перед імпортом дочекайтеся завершення збереження.';
    return;
  }

  importInput.value?.click();
}

// Додаткове завдання № 2: імпорт JSON із перевіркою.
async function importJSON(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  try {
    if (persistenceState.status !== 'saved') {
      throw new Error(
        'Перед імпортом дочекайтеся завершення збереження.'
      );
    }

    const parsed = JSON.parse(await file.text());
    const importedSnapshot = validateBackup(parsed);

    const confirmed = window.confirm(
      `Імпорт замінить поточні дані TaskFlow.\n\n` +
      `Завдань: ${importedSnapshot.tasks.length}\n` +
      `Проєктів: ${importedSnapshot.projects.length}\n\n` +
      `Продовжити?`
    );

    if (!confirmed) {
      saveFeedback.value = 'Імпорт скасовано.';
      return;
    }

    await replaceSnapshot(importedSnapshot);

    showForm.value = false;
    editingId.value = null;

    taskStore.resetFilters();

    saveFeedback.value =
      `Імпортовано завдань: ${importedSnapshot.tasks.length}, ` +
      `проєктів: ${importedSnapshot.projects.length}.`;
  } catch (error) {
    saveFeedback.value =
      `Імпорт не виконано: ${error.message}`;
  } finally {
    // Дозволяємо повторно вибрати той самий файл.
    event.target.value = '';
  }
}

// Звільняємо тимчасове посилання при закритті сторінки.
onBeforeUnmount(() => {
  if (downloadUrl.value) {
    URL.revokeObjectURL(downloadUrl.value);
  }
});
</script>

<template>
  <f7-page name="tasks" class="tf3-page">
    <f7-navbar title="Мої завдання" />

    <div class="tf3-container">
      <section class="tf3-hero">
        <div class="tf3-eyebrow">TASKFLOW / TASK MANAGER</div>

        <h1>Керування завданнями і проєктами</h1>

        <p>
          Pinia керує станом, IndexedDB зберігає
          завдання та проєкти локально.
        </p>

        <button
          type="button"
          class="tf5-btn tf5-btn--primary tf5-new"
          @click="startCreate"
        >
          + Додати завдання
        </button>

        <div class="tf7-backup-actions">
          <button
            type="button"
            class="tf5-btn"
            :disabled="persistenceState.status !== 'saved'"
            @click="exportJSON"
          >
            Експорт JSON
          </button>

          <button
            type="button"
            class="tf5-btn"
            :disabled="persistenceState.status !== 'saved'"
            @click="openImportDialog"
          >
            Імпорт JSON
          </button>

          <input
            ref="importInput"
            type="file"
            accept=".json,application/json"
            class="tf7-hidden-input"
            @change="importJSON"
          />
        </div>

        <!-- Посилання на сформований JSON-файл. -->
        <a
          v-if="downloadUrl"
          :href="downloadUrl"
          :download="downloadFileName"
          class="external tf5-btn tf7-download-link"
          @click.stop="markDownloadStarted"
        >
          <f7-icon f7="download" />
          Завантажити JSON-файл
        </a>
      </section>

      <!-- Індикатор локального збереження. -->
      <section
        class="tf7-persistence"
        :class="`tf7-persistence--${persistenceState.status}`"
        role="status"
        aria-live="polite"
      >
        <strong>Локальне збереження</strong>
        <span>{{ saveMessage }}</span>
        <small>{{ lastSavedMessage }}</small>

        <button
          v-if="persistenceState.canRetry"
          type="button"
          class="tf5-btn"
          @click="retrySave"
        >
          Повторити збереження
        </button>
      </section>

      <!-- Повідомлення від іншої вкладки. -->
      <p
        v-if="persistenceState.externalUpdateMessage"
        class="tf7-external-message"
        role="status"
      >
        {{ persistenceState.externalUpdateMessage }}
      </p>

      <!-- Повідомлення про експорт, імпорт та інші дії. -->
      <p
        v-if="saveFeedback"
        class="tf7-feedback"
        role="status"
      >
        {{ saveFeedback }}
      </p>

      <!-- Каталог проєктів. -->
      <section
        class="tf5-panel tf6-project-panel"
        aria-label="Проєкти"
      >
        <h2>Мої проєкти</h2>

        <div class="tf6-project-list">
          <span
            v-for="project in projectStats"
            :key="project.id"
            class="tf6-project-pill"
          >
            {{ project.title }}
            <strong>{{ project.taskCount }}</strong>
            <span>
              {{ project.uncompletedCount }} невиконаних
              · {{ project.completionPercent }}%
            </span>
          </span>
        </div>

        <form
          class="tf6-project-form"
          @submit.prevent="createProject"
        >
          <label>
            Назва нового проєкту

            <input
              v-model="newProjectTitle"
              type="text"
              maxlength="40"
              placeholder="Наприклад: Лабораторні"
              @input="newProjectError = ''"
            />
          </label>

          <button
            type="submit"
            class="tf5-btn tf5-btn--primary"
          >
            Створити проєкт
          </button>
        </form>

        <p
          v-if="newProjectError"
          class="tf5-error"
          role="alert"
        >
          {{ newProjectError }}
        </p>

        <div class="tf6-bulk-action">
          <p>
            Масова зміна статусу застосовується до всіх
            завдань вибраного проєкту.
          </p>

          <p v-if="selectedProjectStats">
            Вибраний проєкт:
            <strong>{{ selectedProjectStats.title }}</strong>.
            Завдань: {{ selectedProjectStats.taskCount }}.
          </p>

          <p v-else>
            Для масової зміни спочатку виберіть проєкт у фільтрі нижче.
          </p>

          <button
            type="button"
            class="tf5-btn tf5-btn--primary"
            :disabled="
              !selectedProjectStats ||
              selectedProjectStats.taskCount === 0
            "
            @click="moveProjectTasksToProgress"
          >
            Перевести всі завдання в «У роботі»
          </button>
        </div>
      </section>

      <!-- Форма створення або редагування завдання. -->
      <TaskForm
        v-if="showForm"
        :key="editingId ?? 'new'"
        :task="editingTask"
        :projects="projects"
        @save="saveTask"
        @cancel="cancelForm"
      />

      <!-- Пошук, сортування та фільтри. -->
      <TaskListControls
        v-model:search="searchText"
        v-model:status="selectedStatus"
        v-model:priority="selectedPriority"
        v-model:project="selectedProject"
        v-model:sort="sortOrder"
        v-model:onlyUncompleted="onlyUncompleted"
        v-model:onlyWithoutDueDate="onlyWithoutDueDate"
        :projects="projects"
        @reset="taskStore.resetFilters"
      />

      <!-- Список завдань. -->
      <section class="tf3-section">
        <div class="tf3-section-heading">
          <div>
            <div class="tf3-eyebrow">TASK LIST</div>
            <h2>Список завдань</h2>
          </div>

          <div class="tf3-counter">
            Показано: {{ visibleTasks.length }}
            із {{ tasks.length }}
          </div>
        </div>

        <div
          v-if="visibleTasks.length"
          class="tf3-task-grid"
        >
          <TaskCard
            v-for="task in visibleTasks"
            :key="task.id"
            :task="task"
            :project-title="
              projectStore.projectTitle(task.projectId)
            "
            @status-change="taskStore.setTaskStatus"
            @priority-change="taskStore.setTaskPriority"
            @edit="startEdit"
            @delete="handleDelete"
          />
        </div>

        <div
          v-else
          class="tf5-empty"
        >
          <p>За поточними умовами завдань не знайдено.</p>

          <button
            type="button"
            class="tf5-btn"
            @click="taskStore.resetFilters"
          >
            Показати всі завдання
          </button>
        </div>
      </section>
    </div>

    <AppTabbar active="tasks" />
  </f7-page>
</template>
