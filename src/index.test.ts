import { expect, test } from "vitest";
import { name } from "./index.js";

test("имя проекта на месте", () => {
  expect(name).toBe("arena-app");
});
