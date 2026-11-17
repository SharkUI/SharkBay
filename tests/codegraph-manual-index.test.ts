import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("manual CodeGraph maintenance boundary", () => {
  it("does not invoke indexing from any automatic React effect", () => {
    const source = readFileSync(new URL("../src/renderer/App.tsx", import.meta.url), "utf8");
    const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const automatic: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect") {
        if (/ensureCodeGraphStatus\s*\(/.test(node.getText(ast))) automatic.push(node.getText(ast));
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    expect(automatic).toEqual([]);
    expect(source).toMatch(/onClick=\{onMaintainCodeGraph\}/);
  });
});
