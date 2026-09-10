import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { pickLang, setLang } from "../shared/i18n/index.js";
import { App } from "./App.js";
import "./fonts.css";
import "./style.css";

// Язык выбирается один раз, до первого кадра: переключатель без перезагрузки
// потребовал бы контекста и подписки, а языка пока два и оба ставятся один раз.
const lang = pickLang(navigator.languages ?? [navigator.language]);
setLang(lang);
// В разметке стоит ru как умолчание; здесь ставим то, что выбрали на самом
// деле — иначе браузер будет переносить слова и озвучивать текст не по тем
// правилам
document.documentElement.lang = lang;

const root = document.getElementById("root");
if (!root) throw new Error("Нет корневого элемента");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
