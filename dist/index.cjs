"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  formatConfigValue: () => formatConfigValue,
  formatPipelineRef: () => formatPipelineRef,
  formatPipelineStep: () => formatPipelineStep,
  formatStepConfig: () => formatStepConfig,
  formatWhen: () => formatWhen,
  getPipelineRanges: () => getPipelineRanges,
  getVariableRanges: () => getVariableRanges,
  parseProgram: () => parseProgram,
  parseProgramWithDiagnostics: () => parseProgramWithDiagnostics,
  prettyPrint: () => prettyPrint,
  printCondition: () => printCondition,
  printConfig: () => printConfig,
  printDescribe: () => printDescribe,
  printMock: () => printMock,
  printPipeline: () => printPipeline,
  printRoute: () => printRoute,
  printTest: () => printTest,
  printVariable: () => printVariable
});
module.exports = __toCommonJS(index_exports);

// src/parser.ts
var Parser = class {
  constructor(text) {
    this.pos = 0;
    this.diagnostics = [];
    this.pipelineRanges = /* @__PURE__ */ new Map();
    this.variableRanges = /* @__PURE__ */ new Map();
    this.text = text;
    this.len = text.length;
  }
  getDiagnostics() {
    return this.diagnostics.slice();
  }
  getPipelineRanges() {
    return new Map(this.pipelineRanges);
  }
  getVariableRanges() {
    return new Map(this.variableRanges);
  }
  report(message, start, end, severity) {
    this.diagnostics.push({ message, start, end, severity });
  }
  findLineStart(pos) {
    let i = Math.max(0, Math.min(pos, this.len));
    while (i > 0 && this.text[i - 1] !== "\n") i--;
    return i;
  }
  findLineEnd(pos) {
    let i = Math.max(0, Math.min(pos, this.len));
    while (i < this.text.length && this.text[i] !== "\n") i++;
    return i;
  }
  getLineNumber(pos) {
    return this.text.slice(0, pos).split("\n").length;
  }
  parseProgram() {
    this.skipSpaces();
    const configs = [];
    const pipelines = [];
    const variables = [];
    const routes = [];
    const describes = [];
    while (!this.eof()) {
      this.skipSpaces();
      if (this.eof()) break;
      const start = this.pos;
      const cfg = this.tryParse(() => this.parseConfig());
      if (cfg) {
        cfg.lineNumber = this.getLineNumber(start);
        configs.push(cfg);
        continue;
      }
      const namedPipe = this.tryParse(() => this.parseNamedPipeline());
      if (namedPipe) {
        namedPipe.lineNumber = this.getLineNumber(start);
        pipelines.push(namedPipe);
        continue;
      }
      const variable = this.tryParse(() => this.parseVariable());
      if (variable) {
        variable.lineNumber = this.getLineNumber(start);
        variables.push(variable);
        continue;
      }
      const route = this.tryParse(() => this.parseRoute());
      if (route) {
        route.lineNumber = this.getLineNumber(start);
        routes.push(route);
        continue;
      }
      const describe = this.tryParse(() => this.parseDescribe());
      if (describe) {
        describe.lineNumber = this.getLineNumber(start);
        describes.push(describe);
        continue;
      }
      if (this.pos === start) {
        const lineStart = this.findLineStart(this.pos);
        const lineEnd = this.findLineEnd(this.pos);
        this.report("Unrecognized or unsupported syntax", lineStart, lineEnd, "warning");
        this.skipToEol();
        if (this.cur() === "\n") this.pos++;
        this.consumeWhile((c) => c === "\n");
      }
    }
    const backtickCount = (this.text.match(/`/g) || []).length;
    if (backtickCount % 2 === 1) {
      const idx = this.text.lastIndexOf("`");
      const start = Math.max(0, idx);
      this.report("Unclosed backtick-delimited string", start, start + 1, "warning");
    }
    return { configs, pipelines, variables, routes, describes };
  }
  eof() {
    return this.pos >= this.len;
  }
  peek() {
    return this.text[this.pos] ?? "\0";
  }
  cur() {
    return this.text[this.pos] ?? "\0";
  }
  ahead(n) {
    return this.text[this.pos + n] ?? "\0";
  }
  tryParse(fn) {
    const save = this.pos;
    try {
      const value = fn();
      return value;
    } catch (_e) {
      this.pos = save;
      return null;
    }
  }
  skipSpaces() {
    while (true) {
      this.consumeWhile((ch) => ch === " " || ch === "	" || ch === "\r" || ch === "\n");
      if (this.text.startsWith("#", this.pos)) {
        this.skipToEol();
        if (this.cur() === "\n") this.pos++;
        continue;
      }
      if (this.text.startsWith("//", this.pos)) {
        this.skipToEol();
        if (this.cur() === "\n") this.pos++;
        continue;
      }
      break;
    }
  }
  skipInlineSpaces() {
    this.consumeWhile((ch) => ch === " " || ch === "	" || ch === "\r");
  }
  consumeWhile(pred) {
    const start = this.pos;
    while (!this.eof() && pred(this.text[this.pos])) this.pos++;
    return this.text.slice(start, this.pos);
  }
  match(str) {
    if (this.text.startsWith(str, this.pos)) {
      this.pos += str.length;
      return true;
    }
    return false;
  }
  expect(str) {
    if (!this.match(str)) throw new ParseFailure(`expected '${str}'`, this.pos);
  }
  skipToEol() {
    while (!this.eof() && this.cur() !== "\n") this.pos++;
  }
  isIdentStart(ch) {
    return /[A-Za-z_]/.test(ch);
  }
  isIdentCont(ch) {
    return /[A-Za-z0-9_\-]/.test(ch);
  }
  parseIdentifier() {
    if (!this.isIdentStart(this.cur())) throw new ParseFailure("identifier", this.pos);
    const start = this.pos;
    this.pos++;
    while (!this.eof() && this.isIdentCont(this.cur())) this.pos++;
    return this.text.slice(start, this.pos);
  }
  parseNumber() {
    const start = this.pos;
    const digits = this.consumeWhile((c) => /[0-9]/.test(c));
    if (digits.length === 0) throw new ParseFailure("number", this.pos);
    return parseInt(this.text.slice(start, this.pos), 10);
  }
  parseQuotedString() {
    this.expect('"');
    const start = this.pos;
    while (!this.eof()) {
      const ch = this.cur();
      if (ch === '"') break;
      this.pos++;
    }
    const content = this.text.slice(start, this.pos);
    this.expect('"');
    return content;
  }
  parseBacktickString() {
    this.expect("`");
    const start = this.pos;
    while (!this.eof()) {
      const ch = this.cur();
      if (ch === "`") break;
      this.pos++;
    }
    const content = this.text.slice(start, this.pos);
    this.expect("`");
    return content;
  }
  parseMethod() {
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    for (const m of methods) {
      if (this.text.startsWith(m, this.pos)) {
        this.pos += m.length;
        return m;
      }
    }
    throw new ParseFailure("method", this.pos);
  }
  parseStepConfig() {
    const bt = this.tryParse(() => this.parseBacktickString());
    if (bt !== null) return { config: bt, configType: "backtick" };
    const dq = this.tryParse(() => this.parseQuotedString());
    if (dq !== null) return { config: dq, configType: "quoted" };
    const id = this.tryParse(() => this.parseIdentifier());
    if (id !== null) return { config: id, configType: "identifier" };
    throw new ParseFailure("step-config", this.pos);
  }
  parseConfigValue() {
    const envWithDefault = this.tryParse(() => {
      this.expect("$");
      const variable = this.parseIdentifier();
      this.skipInlineSpaces();
      this.expect("||");
      this.skipInlineSpaces();
      const def = this.parseQuotedString();
      return { kind: "EnvVar", var: variable, default: def };
    });
    if (envWithDefault) return envWithDefault;
    const envNoDefault = this.tryParse(() => {
      this.expect("$");
      const variable = this.parseIdentifier();
      return { kind: "EnvVar", var: variable };
    });
    if (envNoDefault) return envNoDefault;
    const str = this.tryParse(() => this.parseQuotedString());
    if (str !== null) return { kind: "String", value: str };
    const bool = this.tryParse(() => {
      if (this.match("true")) return true;
      if (this.match("false")) return false;
      throw new ParseFailure("bool", this.pos);
    });
    if (bool !== null) return { kind: "Boolean", value: bool };
    const num = this.tryParse(() => this.parseNumber());
    if (num !== null) return { kind: "Number", value: num };
    throw new ParseFailure("config-value", this.pos);
  }
  parseConfigProperty() {
    this.skipSpaces();
    const key = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect(":");
    this.skipInlineSpaces();
    const value = this.parseConfigValue();
    return { key, value };
  }
  parseConfig() {
    this.expect("config");
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect("{");
    this.skipSpaces();
    const properties = [];
    while (true) {
      const prop = this.tryParse(() => this.parseConfigProperty());
      if (!prop) break;
      properties.push(prop);
      this.skipSpaces();
    }
    this.skipSpaces();
    this.expect("}");
    this.skipSpaces();
    return { name, properties };
  }
  parsePipelineStep() {
    const result = this.tryParse(() => this.parseResultStep());
    if (result) return result;
    return this.parseRegularStep();
  }
  parseRegularStep() {
    this.skipSpaces();
    this.expect("|>");
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.expect(":");
    this.skipInlineSpaces();
    const { config, configType } = this.parseStepConfig();
    this.skipSpaces();
    return { kind: "Regular", name, config, configType };
  }
  parseResultStep() {
    this.skipSpaces();
    this.expect("|>");
    this.skipInlineSpaces();
    this.expect("result");
    this.skipSpaces();
    const branches = [];
    while (true) {
      const br = this.tryParse(() => this.parseResultBranch());
      if (!br) break;
      branches.push(br);
    }
    return { kind: "Result", branches };
  }
  parseResultBranch() {
    this.skipSpaces();
    const branchIdent = this.parseIdentifier();
    let branchType;
    if (branchIdent === "ok") branchType = { kind: "Ok" };
    else if (branchIdent === "default") branchType = { kind: "Default" };
    else branchType = { kind: "Custom", name: branchIdent };
    this.expect("(");
    const statusCode = this.parseNumber();
    if (statusCode < 100 || statusCode > 599) {
      this.report(
        `Invalid HTTP status code: ${statusCode}`,
        this.pos - String(statusCode).length,
        this.pos,
        "error"
      );
    }
    this.expect(")");
    this.expect(":");
    this.skipSpaces();
    const pipeline = this.parsePipeline();
    return { branchType, statusCode, pipeline };
  }
  parsePipeline() {
    const steps = [];
    while (true) {
      const save = this.pos;
      this.skipSpaces();
      if (!this.text.startsWith("|>", this.pos)) {
        this.pos = save;
        break;
      }
      const step = this.parsePipelineStep();
      steps.push(step);
    }
    return { steps };
  }
  parseNamedPipeline() {
    const start = this.pos;
    this.expect("pipeline");
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect("=");
    this.skipInlineSpaces();
    const beforePipeline = this.pos;
    const pipeline = this.parsePipeline();
    const end = this.pos;
    this.pipelineRanges.set(name, { start, end });
    this.skipSpaces();
    return { name, pipeline };
  }
  parsePipelineRef() {
    const inline = this.tryParse(() => this.parsePipeline());
    if (inline && inline.steps.length > 0) return { kind: "Inline", pipeline: inline };
    const named = this.tryParse(() => {
      this.skipSpaces();
      this.expect("|>");
      this.skipInlineSpaces();
      this.expect("pipeline:");
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      return { kind: "Named", name };
    });
    if (named) return named;
    throw new Error("pipeline-ref");
  }
  parseVariable() {
    const start = this.pos;
    const varType = this.parseIdentifier();
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect("=");
    this.skipInlineSpaces();
    const value = this.parseBacktickString();
    const end = this.pos;
    this.variableRanges.set(`${varType}::${name}`, { start, end });
    this.skipSpaces();
    return { varType, name, value };
  }
  parseRoute() {
    const method = this.parseMethod();
    this.skipInlineSpaces();
    const path = this.consumeWhile((c) => c !== " " && c !== "\n");
    this.skipSpaces();
    const pipeline = this.parsePipelineRef();
    this.skipSpaces();
    return { method, path, pipeline };
  }
  parseWhen() {
    const calling = this.tryParse(() => {
      this.expect("calling");
      this.skipInlineSpaces();
      const method = this.parseMethod();
      this.skipInlineSpaces();
      const path = this.consumeWhile((c) => c !== "\n");
      return { kind: "CallingRoute", method, path };
    });
    if (calling) return calling;
    const executingPipeline = this.tryParse(() => {
      this.expect("executing");
      this.skipInlineSpaces();
      this.expect("pipeline");
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      return { kind: "ExecutingPipeline", name };
    });
    if (executingPipeline) return executingPipeline;
    const executingVariable = this.tryParse(() => {
      this.expect("executing");
      this.skipInlineSpaces();
      this.expect("variable");
      this.skipInlineSpaces();
      const varType = this.parseIdentifier();
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      return { kind: "ExecutingVariable", varType, name };
    });
    if (executingVariable) return executingVariable;
    throw new ParseFailure("when", this.pos);
  }
  parseCondition() {
    this.skipSpaces();
    const ct = (() => {
      if (this.match("then")) return "Then";
      if (this.match("and")) return "And";
      throw new Error("condition-type");
    })();
    this.skipInlineSpaces();
    const field = this.consumeWhile((c) => c !== " " && c !== "\n" && c !== "`");
    this.skipInlineSpaces();
    const jqExpr = this.tryParse(() => this.parseBacktickString());
    this.skipInlineSpaces();
    const comparison = this.consumeWhile((c) => c !== " " && c !== "\n");
    this.skipInlineSpaces();
    const value = (() => {
      const v1 = this.tryParse(() => this.parseBacktickString());
      if (v1 !== null) return v1;
      const v2 = this.tryParse(() => this.parseQuotedString());
      if (v2 !== null) return v2;
      return this.consumeWhile((c) => c !== "\n");
    })();
    return { conditionType: ct, field, jqExpr: jqExpr ?? void 0, comparison, value };
  }
  parseMockHead(prefixWord) {
    this.skipSpaces();
    this.expect(prefixWord);
    this.skipInlineSpaces();
    this.expect("mock");
    this.skipInlineSpaces();
    const target = this.consumeWhile((c) => c !== " " && c !== "\n");
    this.skipInlineSpaces();
    this.expect("returning");
    this.skipInlineSpaces();
    const returnValue = this.parseBacktickString();
    this.skipSpaces();
    return { target, returnValue };
  }
  parseMock() {
    return this.parseMockHead("with");
  }
  parseAndMock() {
    return this.parseMockHead("and");
  }
  parseIt() {
    this.skipSpaces();
    this.expect("it");
    this.skipInlineSpaces();
    this.expect('"');
    const name = this.consumeWhile((c) => c !== '"');
    this.expect('"');
    this.skipSpaces();
    const mocks = [];
    while (true) {
      const m = this.tryParse(() => this.parseMock());
      if (!m) break;
      mocks.push(m);
    }
    this.expect("when");
    this.skipInlineSpaces();
    const when = this.parseWhen();
    this.skipSpaces();
    const input = this.tryParse(() => {
      this.expect("with");
      this.skipInlineSpaces();
      this.expect("input");
      this.skipInlineSpaces();
      const v = this.parseBacktickString();
      this.skipSpaces();
      return v;
    }) ?? void 0;
    const extraMocks = [];
    while (true) {
      const m = this.tryParse(() => this.parseAndMock());
      if (!m) break;
      extraMocks.push(m);
      this.skipSpaces();
    }
    const conditions = [];
    while (true) {
      const c = this.tryParse(() => this.parseCondition());
      if (!c) break;
      conditions.push(c);
    }
    return { name, mocks: [...mocks, ...extraMocks], when, input, conditions };
  }
  parseDescribe() {
    this.skipSpaces();
    this.expect("describe");
    this.skipInlineSpaces();
    this.expect('"');
    const name = this.consumeWhile((c) => c !== '"');
    this.expect('"');
    this.skipSpaces();
    const mocks = [];
    while (true) {
      const m = this.tryParse(() => this.parseMock());
      if (!m) break;
      mocks.push(m);
      this.skipSpaces();
    }
    const tests = [];
    while (true) {
      const it = this.tryParse(() => this.parseIt());
      if (!it) break;
      tests.push(it);
    }
    return { name, mocks, tests };
  }
};
function parseProgram(text) {
  const parser = new Parser(text);
  return parser.parseProgram();
}
function parseProgramWithDiagnostics(text) {
  const parser = new Parser(text);
  const program = parser.parseProgram();
  return { program, diagnostics: parser.getDiagnostics() };
}
function getPipelineRanges(text) {
  const parser = new Parser(text);
  parser.parseProgram();
  return parser.getPipelineRanges();
}
function getVariableRanges(text) {
  const parser = new Parser(text);
  parser.parseProgram();
  return parser.getVariableRanges();
}
var ParseFailure = class extends Error {
  constructor(message, at) {
    super(message);
    this.at = at;
  }
};
function printRoute(route) {
  const lines = [];
  lines.push(`${route.method} ${route.path}`);
  const pipelineLines = formatPipelineRef(route.pipeline);
  pipelineLines.forEach((line) => lines.push(line));
  return lines.join("\n");
}
function printConfig(config) {
  const lines = [];
  lines.push(`config ${config.name} {`);
  config.properties.forEach((prop) => {
    const value = formatConfigValue(prop.value);
    lines.push(`  ${prop.key}: ${value}`);
  });
  lines.push("}");
  return lines.join("\n");
}
function printPipeline(pipeline) {
  const lines = [];
  lines.push(`pipeline ${pipeline.name} =`);
  pipeline.pipeline.steps.forEach((step) => {
    lines.push(formatPipelineStep(step));
  });
  return lines.join("\n");
}
function printVariable(variable) {
  return `${variable.varType} ${variable.name} = \`${variable.value}\``;
}
function printMock(mock, indent = "  ") {
  return `${indent}with mock ${mock.target} returning \`${mock.returnValue}\``;
}
function printCondition(condition, indent = "    ") {
  const condType = condition.conditionType.toLowerCase();
  const jqPart = condition.jqExpr ? ` \`${condition.jqExpr}\`` : "";
  const value = condition.value.startsWith("`") ? condition.value : condition.value.includes("\n") || condition.value.includes("{") || condition.value.includes("[") ? `\`${condition.value}\`` : condition.value;
  return `${indent}${condType} ${condition.field}${jqPart} ${condition.comparison} ${value}`;
}
function printTest(test) {
  const lines = [];
  lines.push(`  it "${test.name}"`);
  test.mocks.forEach((mock) => {
    lines.push(printMock(mock, "    "));
  });
  lines.push(`    when ${formatWhen(test.when)}`);
  if (test.input) {
    lines.push(`    with input \`${test.input}\``);
  }
  test.conditions.forEach((condition) => {
    lines.push(printCondition(condition));
  });
  return lines.join("\n");
}
function printDescribe(describe) {
  const lines = [];
  lines.push(`describe "${describe.name}"`);
  describe.mocks.forEach((mock) => {
    lines.push(printMock(mock));
  });
  if (describe.mocks.length > 0) {
    lines.push("");
  }
  describe.tests.forEach((test) => {
    lines.push(printTest(test));
    lines.push("");
  });
  return lines.join("\n").replace(/\n\n$/, "\n");
}
function prettyPrint(program) {
  const lines = [];
  const allItems = [];
  program.configs.forEach((config) => {
    allItems.push({ type: "config", item: config, lineNumber: config.lineNumber || 0 });
  });
  program.routes.forEach((route) => {
    allItems.push({ type: "route", item: route, lineNumber: route.lineNumber || 0 });
  });
  program.pipelines.forEach((pipeline) => {
    allItems.push({ type: "pipeline", item: pipeline, lineNumber: pipeline.lineNumber || 0 });
  });
  program.variables.forEach((variable) => {
    allItems.push({ type: "variable", item: variable, lineNumber: variable.lineNumber || 0 });
  });
  program.describes.forEach((describe) => {
    allItems.push({ type: "describe", item: describe, lineNumber: describe.lineNumber || 0 });
  });
  allItems.sort((a, b) => a.lineNumber - b.lineNumber);
  let hasConfigs = false;
  allItems.forEach((entry, index) => {
    if (entry.type === "config" && !hasConfigs) {
      lines.push("## Config");
      hasConfigs = true;
    }
    switch (entry.type) {
      case "config":
        lines.push(printConfig(entry.item));
        lines.push("");
        break;
      case "route":
        lines.push(printRoute(entry.item));
        lines.push("");
        break;
      case "pipeline":
        lines.push(printPipeline(entry.item));
        lines.push("");
        break;
      case "variable":
        lines.push(printVariable(entry.item));
        const nextNonVariable = allItems.slice(index + 1).find((item) => item.type !== "variable");
        if (nextNonVariable) lines.push("");
        break;
      case "describe":
        lines.push(printDescribe(entry.item));
        lines.push("");
        break;
    }
  });
  return lines.join("\n").trim();
}
function formatConfigValue(value) {
  switch (value.kind) {
    case "String":
      return `"${value.value}"`;
    case "EnvVar":
      return value.default ? `$${value.var} || "${value.default}"` : `$${value.var}`;
    case "Boolean":
      return value.value.toString();
    case "Number":
      return value.value.toString();
  }
}
function formatPipelineStep(step, indent = "  ") {
  if (step.kind === "Regular") {
    return `${indent}|> ${step.name}: ${formatStepConfig(step.config, step.configType)}`;
  } else {
    const lines = [`${indent}|> result`];
    step.branches.forEach((branch) => {
      const branchName = branch.branchType.kind === "Ok" ? "ok" : branch.branchType.kind === "Default" ? "default" : branch.branchType.name;
      lines.push(`${indent}  ${branchName}(${branch.statusCode}):`);
      branch.pipeline.steps.forEach((branchStep) => {
        lines.push(formatPipelineStep(branchStep, indent + "    "));
      });
    });
    return lines.join("\n");
  }
}
function formatStepConfig(config, configType) {
  switch (configType) {
    case "backtick":
      return `\`${config}\``;
    case "quoted":
      return `"${config}"`;
    case "identifier":
      return config;
  }
}
function formatPipelineRef(ref) {
  if (ref.kind === "Named") {
    return [`  |> pipeline: ${ref.name}`];
  } else {
    const lines = [];
    ref.pipeline.steps.forEach((step) => {
      lines.push(formatPipelineStep(step));
    });
    return lines;
  }
}
function formatWhen(when) {
  switch (when.kind) {
    case "CallingRoute":
      return `calling ${when.method} ${when.path}`;
    case "ExecutingPipeline":
      return `executing pipeline ${when.name}`;
    case "ExecutingVariable":
      return `executing variable ${when.varType} ${when.name}`;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  formatConfigValue,
  formatPipelineRef,
  formatPipelineStep,
  formatStepConfig,
  formatWhen,
  getPipelineRanges,
  getVariableRanges,
  parseProgram,
  parseProgramWithDiagnostics,
  prettyPrint,
  printCondition,
  printConfig,
  printDescribe,
  printMock,
  printPipeline,
  printRoute,
  printTest,
  printVariable
});
