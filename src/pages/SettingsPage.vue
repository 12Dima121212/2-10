
<script setup>
import { ref, onMounted } from 'vue';

import AppTabbar from '../components/AppTabbar.vue';
import { readDatabaseStats } from '../services/database';

import '../css/persistence.css';

const stats = ref({
  taskCount: null,
  projectCount: null,
  lastSavedAt: null,
});

const loading = ref(false);
const error = ref('');

async function loadStats() {
  loading.value = true;
  error.value = '';

  try {
    // Читаємо кількість записів безпосередньо з IndexedDB.
    stats.value = await readDatabaseStats();
  } catch (err) {
    error.value =
      err.message || 'Не вдалося отримати статистику IndexedDB.';
  } finally {
    loading.value = false;
  }
}

function formatDate(value) {
  if (!value) return 'Немає даних';

  return new Date(value).toLocaleString('uk-UA');
}

onMounted(loadStats);
</script>

<template>
  <f7-page name="settings" class="tf3-page">
    <f7-navbar title="Налаштування" />

    <div class="tf3-container">
      <section class="tf3-hero">
        <div class="tf3-eyebrow">TASKFLOW / STORAGE</div>
        <h1>Налаштування та локальні дані</h1>
        <p>
          Інформація про записи, які фактично зберігаються
          у браузерній базі IndexedDB.
        </p>
      </section>

      <section class="tf5-panel tf7-settings-panel">
        <h2>Статистика IndexedDB</h2>

        <p v-if="loading">
          Отримання даних із бази…
        </p>

        <p
          v-if="error"
          class="tf5-error"
          role="alert"
        >
          {{ error }}
        </p>

        <div
          v-if="!loading && !error"
          class="tf7-settings-grid"
        >
          <div class="tf7-settings-card">
            <span>Збережені завдання</span>
            <strong>{{ stats.taskCount }}</strong>
          </div>

          <div class="tf7-settings-card">
            <span>Збережені проєкти</span>
            <strong>{{ stats.projectCount }}</strong>
          </div>
        </div>

        <div class="tf7-settings-date">
          <strong>Останнє успішне збереження</strong>
          <span>{{ formatDate(stats.lastSavedAt) }}</span>
        </div>

        <button
          type="button"
          class="tf5-btn tf5-btn--primary"
          :disabled="loading"
          @click="loadStats"
        >
          Оновити статистику
        </button>
      </section>

      <section class="tf5-panel">
        <h2>Про локальне зберігання</h2>

        <p>
          TaskFlow використовує IndexedDB для зберігання
          завдань, проєктів і службових метаданих.
        </p>

        <p>
          Дані доступні в межах поточного браузера,
          профілю та origin застосунку.
        </p>

        <p>
          Резервну копію можна створити на сторінці
          «Мої завдання» за допомогою експорту JSON.
        </p>
      </section>
    </div>

    <AppTabbar active="settings" />
  </f7-page>
</template>
