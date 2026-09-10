// Выписывает ссылку-приглашение.
//
//   just invite Витя
//
// Пока это командная строка, а не кнопка на сайте: сайта ещё нет, а звать людей
// уже надо. Формат ссылки от этого не изменится — сайт будет выписывать те же
// билеты тем же ключом.
import { issueTicket, newNonce } from "./ticket.js";

const secret = process.env.ARENA_TICKET_SECRET ?? "";
if (!secret) {
  console.error("Не задан ARENA_TICKET_SECRET — подписывать нечем. Смотри .env.example");
  process.exit(1);
}

const name = process.argv[2] ?? "";
if (!name) {
  console.error("Кого зовём? Укажи имя: just invite Витя");
  process.exit(1);
}

const room = process.env.ARENA_ROOM ?? "arena";
const hours = Number(process.env.ARENA_INVITE_HOURS ?? 24);
const site = process.env.ARENA_SITE_URL ?? "http://127.0.0.1:8099/";
const bridge = process.env.ARENA_PUBLIC_BRIDGE ?? "127.0.0.1:27961";

const expires = Math.floor(Date.now() / 1000) + hours * 3600;
const ticket = issueTicket({ room, name, nonce: newNonce(), expires }, secret);

const link = new URL(site);
link.searchParams.set("connect", bridge);
link.searchParams.set("i", ticket);

console.log(`Приглашение для «${name}», годно ${hours} ч:`);
console.log(link.toString());
