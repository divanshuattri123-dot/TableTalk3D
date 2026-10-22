import { expect, it } from "vitest";
import { roomAddress } from "./address";
const page = { protocol: "http:", hostname: "192.168.1.69", host: "192.168.1.69:5186" };
it("uses secure hosted multiplayer even when testing from an HTTP dev page", () => {
  expect(roomAddress("https://game.workers.dev/", page, true)).toEqual({ host: "game.workers.dev", protocol: "wss" });
  expect(roomAddress("wss://game.workers.dev", page, true).protocol).toBe("wss");
});
it("keeps LAN/local and explicitly configured plain sockets working", () => {
  expect(roomAddress(undefined, page, true)).toEqual({ host: "192.168.1.69:1999", protocol: "ws" });
  expect(roomAddress("http://localhost:1999", { ...page, protocol: "https:" }, true).protocol).toBe("ws");
  expect(roomAddress("ws://localhost:1999", page, true).host).toBe("localhost:1999");
});
it("uses the current HTTPS host when no separate multiplayer host is configured", () => {
  expect(roomAddress(undefined, { ...page, protocol: "https:", host: "game.example" }, false)).toEqual({ host: "game.example", protocol: "wss" });
});
