import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Корень браузерного приложения — src/app, но тесты живут по всему src.
  // Без явного test.root vitest унаследовал бы корень отсюда и перестал их
  // находить.
  test: { root: ".", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
  root: "src/app",
  build: { outDir: "../../var/site", emptyOutDir: true },
  server: {
    // Адрес и порт закреплены: по умолчанию vite слушает только IPv6-localhost
    // и уезжает на соседний порт, если этот занят, — а на машине разработчика
    // занято бывает всё подряд. Пусть лучше падает с понятной ошибкой.
    host: "127.0.0.1",
    port: 5273,
    strictPort: true,
    // Сайт и браузерное приложение живут порознь, поэтому запросы к /api
    // в разработке переливаются на сервер. В боевом контуре их сводит Traefik.
    proxy: { "/api": { target: `http://127.0.0.1:${process.env.SITE_PORT ?? 3100}` } },
  },
});
