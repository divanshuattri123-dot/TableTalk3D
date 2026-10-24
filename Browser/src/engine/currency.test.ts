import { expect, it } from "vitest";
import { formatRupees } from "./currency";

it.each([[1500,"₹1,500"],[12345678,"₹1,23,45,678"],[5.5,"₹5.50"],[-123456.75,"−₹1,23,456.75"],[0.1+0.2,"₹0.30"],[0,"₹0"]])("formats %s without losing small building-sale refunds",(value,label)=>{
  expect(formatRupees(value as number)).toBe(label);
});
