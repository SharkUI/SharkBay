import assert from "node:assert/strict";
import path from "node:path";
import { readdirSync } from "node:fs";
import ts from "typescript";

const configPath = path.resolve("tsconfig.runtime.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined, "Unable to read runtime build configuration");
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
assert.equal(parsed.errors.length, 0, "Invalid runtime build configuration");
const program = ts.createProgram(parsed.fileNames, parsed.options);
const forbidden = program.getSourceFiles().filter((file) =>
  file.fileName.includes("/node_modules/electron/") || file.fileName.startsWith(path.resolve("electron") + path.sep)
);
for (const file of program.getSourceFiles().filter((source) => !source.isDeclarationFile)) {
  const visit = (node) => {
    let moduleName;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) moduleName = node.moduleSpecifier.text;
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && /^require/.test(node.expression.text))) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) moduleName = node.arguments[0].text;
    if (moduleName === "electron" || moduleName?.startsWith("electron/")) forbidden.push(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
}
assert.equal(forbidden.length, 0, `Runtime depends on Electron: ${[...new Set(forbidden.map((file) => file.fileName))].join(", ")}`);
console.log("RUNTIME_IMPORTS_OK no Electron source, module, or types in the Core build");
