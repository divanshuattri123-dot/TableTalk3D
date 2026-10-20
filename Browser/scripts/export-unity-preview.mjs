import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const importSource = async file => {
  const code = ts.transpileModule(await fs.readFile(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
};
const { getBoard, isPurchasableTile } = await importSource("src/engine/board.ts");
const { GROUP_COLORS } = await importSource("src/view/palette.ts");
const project = path.resolve("..");
const preview = JSON.parse(await fs.readFile(path.join(project, "Assets/TableTalk/Art/PreviewSnapshot.json"), "utf8"));
for (const boardSize of [40, 48, 56, 64]) {
  const state = { ...preview, boardSize, currencySymbol: "₹", tiles: getBoard(boardSize).map(tile => ({
    id: tile.position, name: tile.name, boardLabel: tile.boardLabel ?? tile.name, region: tile.region ?? "", detail: tile.detail ?? "", kind: tile.kind,
    price: isPurchasableTile(tile) ? tile.price : 0, color: tile.kind === "property" ? GROUP_COLORS[tile.group] : "#e5b94d", ownerId: "", houses: 0, mortgaged: false
  })) };
  const file = boardSize === 40 ? "Assets/TableTalk/Art/PreviewSnapshot.json" : `AgentScripts/Snapshots/${boardSize}.json`;
  await fs.writeFile(path.join(project, file), JSON.stringify(state));
  console.log(`${boardSize} Indian tiles → ${file}`);
}
