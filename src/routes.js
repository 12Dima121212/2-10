
import HomePage from './pages/HomePage.vue';
import AboutPage from './pages/AboutPage.vue';
import TasksPage from './pages/TasksPage.vue';
import SettingsPage from './pages/SettingsPage.vue';

const routes = [
  {
    path: '/',
    component: HomePage,
  },
  {
    path: '/about/',
    component: AboutPage,
  },
  {
    path: '/tasks/',
    component: TasksPage,
  },
  {
    path: '/settings/',
    component: SettingsPage,
  },
];

export default routes;
