
const allowedStatuses = ['todo', 'progress', 'done'];
const allowedPriorities = ['low', 'medium', 'high'];
const allowedCategories = ['study', 'work', 'personal'];

function isObject(value) {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value);
}

// Створення резервної копії.
export function createBackup(snapshot) {
  return {
    format: 'taskflow-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    nextProjectId: snapshot.nextProjectId,
    tasks: JSON.parse(JSON.stringify(snapshot.tasks)),
    projects: JSON.parse(JSON.stringify(snapshot.projects)),
  };
}

// Перевірка структури та полів імпортованого JSON.
export function validateBackup(data) {
  if (!isObject(data)) {
    throw new Error('JSON повинен містити об’єкт.');
  }

  if (data.format !== 'taskflow-backup') {
    throw new Error('Невідомий формат резервної копії.');
  }

  if (data.version !== 1) {
    throw new Error('Непідтримувана версія резервної копії.');
  }

  if (!Array.isArray(data.tasks) || !Array.isArray(data.projects)) {
    throw new Error('У файлі мають бути масиви tasks та projects.');
  }

  if (data.projects.length === 0) {
    throw new Error('Каталог проєктів не може бути порожнім.');
  }

  const projectIds = new Set();
  const projectTitles = new Set();

  const projects = data.projects.map((project, index) => {
    if (!isObject(project)) {
      throw new Error(`Проєкт № ${index + 1} має неправильний формат.`);
    }

    if (
      typeof project.id !== 'string' ||
      !project.id.trim()
    ) {
      throw new Error(`Проєкт № ${index + 1} має неправильний ID.`);
    }

    if (
      typeof project.title !== 'string' ||
      project.title.trim().length < 3 ||
      project.title.trim().length > 40
    ) {
      throw new Error(
        `Назва проєкту № ${index + 1} повинна містити 3–40 символів.`
      );
    }

    const id = project.id.trim();
    const title = project.title.trim();
    const titleKey = title.toLocaleLowerCase('uk-UA');

    if (projectIds.has(id)) {
      throw new Error(`Повторюється ID проєкту: ${id}.`);
    }

    if (projectTitles.has(titleKey)) {
      throw new Error(`Повторюється назва проєкту: ${title}.`);
    }

    projectIds.add(id);
    projectTitles.add(titleKey);

    return { id, title };
  });

  const taskIds = new Set();

  const tasks = data.tasks.map((task, index) => {
    if (!isObject(task)) {
      throw new Error(`Завдання № ${index + 1} має неправильний формат.`);
    }

    if (
      !Number.isSafeInteger(task.id) ||
      task.id < 1
    ) {
      throw new Error(`Завдання № ${index + 1} має неправильний ID.`);
    }

    if (taskIds.has(task.id)) {
      throw new Error(`Повторюється ID завдання: ${task.id}.`);
    }

    taskIds.add(task.id);

    if (
      typeof task.title !== 'string' ||
      task.title.trim().length < 3 ||
      task.title.trim().length > 80
    ) {
      throw new Error(
        `Назва завдання № ${index + 1} повинна містити 3–80 символів.`
      );
    }

    if (
      task.description !== undefined &&
      (typeof task.description !== 'string' ||
        task.description.length > 500)
    ) {
      throw new Error(
        `Опис завдання № ${index + 1} має неправильний формат.`
      );
    }

    if (!allowedStatuses.includes(task.status)) {
      throw new Error(
        `Завдання № ${index + 1} має неправильний статус.`
      );
    }

    if (!allowedPriorities.includes(task.priority)) {
      throw new Error(
        `Завдання № ${index + 1} має неправильний пріоритет.`
      );
    }

    const category = task.category ?? 'study';

    if (!allowedCategories.includes(category)) {
      throw new Error(
        `Завдання № ${index + 1} має неправильну категорію.`
      );
    }

    const dueDate = task.dueDate ?? '';

    if (
      typeof dueDate !== 'string' ||
      (dueDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))
    ) {
      throw new Error(
        `Завдання № ${index + 1} має неправильний термін виконання.`
      );
    }

    if (
      typeof task.projectId !== 'string' ||
      !projectIds.has(task.projectId)
    ) {
      throw new Error(
        `Для завдання № ${index + 1} не знайдено відповідного projectId.`
      );
    }

    return {
      id: task.id,
      title: task.title.trim(),
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      category,
      dueDate,
      projectId: task.projectId,
    };
  });

  const calculatedNextId = Math.max(
    0,
    ...projects.map((project) => {
      const match = /^project-(\d+)$/.exec(project.id);
      return match ? Number(match[1]) : 0;
    })
  ) + 1;

  const nextProjectId =
    Number.isSafeInteger(data.nextProjectId) &&
    data.nextProjectId >= calculatedNextId
      ? data.nextProjectId
      : calculatedNextId;

  return {
    tasks,
    projects,
    nextProjectId,
  };
}
