// src/parser.ts
var Parser = class {
  constructor(text) {
    this.pos = 0;
    this.diagnostics = [];
    this.pipelineRanges = /* @__PURE__ */ new Map();
    this.variableRanges = /* @__PURE__ */ new Map();
    this.testLetVariables = [];
    this.currentDescribeName = null;
    this.currentTestName = null;
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
  getTestLetVariables() {
    return [...this.testLetVariables];
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
  parseInlineComment() {
    this.skipInlineSpaces();
    const start = this.pos;
    if (this.text.startsWith("#", this.pos)) {
      this.pos++;
      const text = this.consumeWhile((ch) => ch !== "\n");
      return {
        type: "inline",
        text,
        style: "#",
        lineNumber: this.getLineNumber(start)
      };
    }
    if (this.text.startsWith("//", this.pos)) {
      this.pos += 2;
      const text = this.consumeWhile((ch) => ch !== "\n");
      return {
        type: "inline",
        text,
        style: "//",
        lineNumber: this.getLineNumber(start)
      };
    }
    return null;
  }
  parseStandaloneComment() {
    const start = this.pos;
    if (this.text.startsWith("#", this.pos)) {
      const originalPos = this.pos;
      this.pos++;
      const restOfLine = this.consumeWhile((ch) => ch !== "\n");
      return {
        type: "standalone",
        text: restOfLine,
        style: "#",
        lineNumber: this.getLineNumber(start)
      };
    }
    if (this.text.startsWith("//", this.pos)) {
      this.pos += 2;
      const text = this.consumeWhile((ch) => ch !== "\n");
      return {
        type: "standalone",
        text,
        style: "//",
        lineNumber: this.getLineNumber(start)
      };
    }
    return null;
  }
  parseProgram() {
    this.skipWhitespaceOnly();
    const configs = [];
    const pipelines = [];
    const variables = [];
    const routes = [];
    const describes = [];
    const comments = [];
    let graphqlSchema;
    const queries = [];
    const mutations = [];
    const resolvers = [];
    let featureFlags;
    while (!this.eof()) {
      this.skipWhitespaceOnly();
      if (this.eof()) break;
      const start = this.pos;
      const comment = this.tryParse(() => this.parseStandaloneComment());
      if (comment) {
        comments.push(comment);
        if (this.cur() === "\n") this.pos++;
        continue;
      }
      const cfg = this.tryParse(() => this.parseConfig());
      if (cfg) {
        cfg.lineNumber = this.getLineNumber(start);
        configs.push(cfg);
        continue;
      }
      const schema = this.tryParse(() => this.parseGraphQLSchema());
      if (schema) {
        schema.lineNumber = this.getLineNumber(start);
        graphqlSchema = schema;
        continue;
      }
      const query = this.tryParse(() => this.parseQueryResolver());
      if (query) {
        query.lineNumber = this.getLineNumber(start);
        queries.push(query);
        continue;
      }
      const mutation = this.tryParse(() => this.parseMutationResolver());
      if (mutation) {
        mutation.lineNumber = this.getLineNumber(start);
        mutations.push(mutation);
        continue;
      }
      const resolver = this.tryParse(() => this.parseTypeResolver());
      if (resolver) {
        resolver.lineNumber = this.getLineNumber(start);
        resolvers.push(resolver);
        continue;
      }
      const flags = this.tryParse(() => this.parseFeatureFlags());
      if (flags) {
        featureFlags = flags;
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
    return { configs, pipelines, variables, routes, describes, comments, graphqlSchema, queries, mutations, resolvers, featureFlags };
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
  skipWhitespaceOnly() {
    this.consumeWhile((ch) => ch === " " || ch === "	" || ch === "\r" || ch === "\n");
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
    const methods = ["GET", "POST", "PUT", "DELETE"];
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
  parseTag() {
    const start = this.pos;
    this.expect("@");
    const negated = this.cur() === "!";
    if (negated) this.pos++;
    const name = this.parseIdentifier();
    let args = [];
    if (this.cur() === "(") {
      args = this.parseTagArgs();
    }
    const end = this.pos;
    return { name, negated, args, start, end };
  }
  parseTagArgs() {
    this.expect("(");
    const args = [];
    this.skipInlineSpaces();
    if (this.cur() === ")") {
      throw new ParseFailure("empty tag arguments not allowed", this.pos);
    }
    args.push(this.parseTagArgument());
    this.skipInlineSpaces();
    while (this.cur() === ",") {
      this.pos++;
      this.skipInlineSpaces();
      if (this.cur() === ")") {
        throw new ParseFailure("trailing comma in tag arguments", this.pos);
      }
      args.push(this.parseTagArgument());
      this.skipInlineSpaces();
    }
    this.expect(")");
    return args;
  }
  parseTagArgument() {
    const bt = this.tryParse(() => this.parseBacktickString());
    if (bt !== null) return bt;
    return this.parseIdentifier();
  }
  parseTags() {
    const tags = [];
    while (!this.eof()) {
      this.skipInlineSpaces();
      const ch = this.cur();
      if (ch === "\n" || ch === "\r" || ch === "#" || this.text.startsWith("//", this.pos)) {
        break;
      }
      if (ch === "@") {
        tags.push(this.parseTag());
      } else {
        break;
      }
    }
    return tags;
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
    const start = this.pos;
    const key = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect(":");
    this.skipInlineSpaces();
    const value = this.parseConfigValue();
    const end = this.pos;
    return { key, value, start, end };
  }
  parseConfig() {
    const start = this.pos;
    this.expect("config");
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect("{");
    const inlineComment = this.parseInlineComment();
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
    this.skipWhitespaceOnly();
    const end = this.pos;
    return { name, properties, inlineComment: inlineComment || void 0, start, end };
  }
  parsePipelineStep() {
    const result = this.tryParse(() => this.parseResultStep());
    if (result) return result;
    const ifStep = this.tryParse(() => this.parseIfStep());
    if (ifStep) return ifStep;
    const dispatchStep = this.tryParse(() => this.parseDispatchStep());
    if (dispatchStep) return dispatchStep;
    const foreachStep = this.tryParse(() => this.parseForeachStep());
    if (foreachStep) return foreachStep;
    return this.parseRegularStep();
  }
  parseForeachStep() {
    this.skipWhitespaceOnly();
    const start = this.pos;
    this.expect("|>");
    this.skipInlineSpaces();
    this.expect("foreach");
    if (this.cur() !== " " && this.cur() !== "	") {
      throw new ParseFailure("space after foreach", this.pos);
    }
    this.skipInlineSpaces();
    const selector = this.consumeWhile((c) => c !== "\n" && c !== "#").trim();
    if (selector.length === 0) {
      throw new ParseFailure("foreach selector", this.pos);
    }
    this.skipSpaces();
    const pipeline = this.parseIfPipeline("end");
    this.skipSpaces();
    this.expect("end");
    const end = this.pos;
    return { kind: "Foreach", selector, pipeline, start, end };
  }
  parseRegularStep() {
    this.skipWhitespaceOnly();
    const start = this.pos;
    this.expect("|>");
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    const args = this.parseInlineArgs();
    this.skipInlineSpaces();
    let config = "";
    let configType = "quoted";
    if (this.cur() === ":") {
      this.pos++;
      this.skipInlineSpaces();
      const res = this.parseStepConfig();
      config = res.config;
      configType = res.configType;
    }
    const condition = this.parseStepCondition();
    const parsedJoinTargets = name === "join" ? this.parseJoinTaskNames(config) : void 0;
    this.skipWhitespaceOnly();
    const end = this.pos;
    return { kind: "Regular", name, args, config, configType, condition, parsedJoinTargets, start, end };
  }
  /**
   * Parse optional step condition (tag expression after the config)
   * Supports:
   *   - @tag (single tag)
   *   - @tag @tag2 (implicit AND for backwards compatibility)
   *   - @tag and @tag2 (explicit AND)
   *   - @tag or @tag2 (explicit OR)
   *   - (@tag or @tag2) and @tag3 (grouping)
   */
  parseStepCondition() {
    this.skipInlineSpaces();
    const ch = this.cur();
    if (ch !== "@" && ch !== "(") {
      return void 0;
    }
    let expr = this.parseTagExpr();
    while (true) {
      this.skipInlineSpaces();
      const ch2 = this.cur();
      if (ch2 === "\n" || ch2 === "\r" || ch2 === "#" || this.text.startsWith("//", this.pos)) {
        break;
      }
      if (ch2 !== "@") {
        break;
      }
      const nextTag = this.parseTag();
      expr = { kind: "And", left: expr, right: { kind: "Tag", tag: nextTag } };
    }
    return expr;
  }
  /**
   * Pre-parse join config into task names at parse time.
   * This avoids repeated parsing in the hot path during execution.
   */
  parseJoinTaskNames(config) {
    const trimmed = config.trim();
    if (trimmed.startsWith("[")) {
      try {
        const names2 = JSON.parse(trimmed);
        if (Array.isArray(names2) && names2.every((n) => typeof n === "string")) {
          return names2;
        }
      } catch {
        return void 0;
      }
    }
    const names = trimmed.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (names.length === 0) {
      return void 0;
    }
    return names;
  }
  /**
   * Split argument content by commas while respecting nesting depth and strings
   * Example: `"url", {a:1, b:2}` -> [`"url"`, `{a:1, b:2}`]
   */
  splitBalancedArgs(content) {
    const args = [];
    let current = "";
    let depth = 0;
    let inString = false;
    let stringChar = "";
    let escapeNext = false;
    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (escapeNext) {
        current += ch;
        escapeNext = false;
        continue;
      }
      if (ch === "\\" && inString) {
        current += ch;
        escapeNext = true;
        continue;
      }
      if ((ch === '"' || ch === "`") && !inString) {
        inString = true;
        stringChar = ch;
        current += ch;
        continue;
      }
      if (ch === stringChar && inString) {
        inString = false;
        stringChar = "";
        current += ch;
        continue;
      }
      if (inString) {
        current += ch;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        depth++;
        current += ch;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        depth--;
        current += ch;
      } else if (ch === "," && depth === 0) {
        args.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim().length > 0) {
      args.push(current.trim());
    }
    return args;
  }
  /**
   * Parse inline arguments: middleware(arg1, arg2) or middleware[arg1, arg2]
   * Returns the array of argument strings and advances position past the closing bracket
   */
  parseInlineArgs() {
    const trimmedStart = this.pos;
    this.skipInlineSpaces();
    const ch = this.cur();
    if (ch !== "(" && ch !== "[") {
      this.pos = trimmedStart;
      return [];
    }
    const openChar = ch;
    const closeChar = openChar === "(" ? ")" : "]";
    this.pos++;
    let depth = 1;
    let inString = false;
    let stringChar = "";
    let escapeNext = false;
    const contentStart = this.pos;
    while (!this.eof() && depth > 0) {
      const c = this.cur();
      if (escapeNext) {
        this.pos++;
        escapeNext = false;
        continue;
      }
      if (c === "\\" && inString) {
        this.pos++;
        escapeNext = true;
        continue;
      }
      if ((c === '"' || c === "`") && !inString) {
        inString = true;
        stringChar = c;
        this.pos++;
        continue;
      }
      if (c === stringChar && inString) {
        inString = false;
        stringChar = "";
        this.pos++;
        continue;
      }
      if (!inString) {
        if (c === openChar) {
          depth++;
        } else if (c === closeChar) {
          depth--;
          if (depth === 0) {
            break;
          }
        }
      }
      this.pos++;
    }
    if (depth !== 0) {
      throw new ParseFailure(`unclosed ${openChar}`, contentStart);
    }
    const argsContent = this.text.slice(contentStart, this.pos);
    this.pos++;
    if (argsContent.trim().length === 0) {
      return [];
    }
    return this.splitBalancedArgs(argsContent);
  }
  parseResultStep() {
    this.skipWhitespaceOnly();
    const start = this.pos;
    this.expect("|>");
    this.skipInlineSpaces();
    this.expect("result");
    this.skipWhitespaceOnly();
    const branches = [];
    while (true) {
      const br = this.tryParse(() => this.parseResultBranch());
      if (!br) break;
      branches.push(br);
    }
    const end = this.pos;
    return { kind: "Result", branches, start, end };
  }
  parseResultBranch() {
    this.skipSpaces();
    const start = this.pos;
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
    const end = this.pos;
    return { branchType, statusCode, pipeline, start, end };
  }
  parseIfStep() {
    this.skipWhitespaceOnly();
    const start = this.pos;
    this.expect("|>");
    this.skipInlineSpaces();
    this.expect("if");
    this.skipSpaces();
    const condition = this.parseIfPipeline("then:");
    this.skipSpaces();
    this.expect("then:");
    this.skipSpaces();
    const thenBranch = this.parseIfPipeline("else:", "end");
    this.skipSpaces();
    const elseBranch = this.tryParse(() => {
      this.expect("else:");
      this.skipSpaces();
      return this.parseIfPipeline("end");
    });
    this.skipSpaces();
    this.tryParse(() => {
      this.expect("end");
      return true;
    });
    const end = this.pos;
    return { kind: "If", condition, thenBranch, elseBranch: elseBranch || void 0, start, end };
  }
  parseDispatchStep() {
    this.skipWhitespaceOnly();
    const start = this.pos;
    this.expect("|>");
    this.skipInlineSpaces();
    this.expect("dispatch");
    this.skipSpaces();
    const branches = [];
    while (true) {
      const branch = this.tryParse(() => this.parseDispatchBranch());
      if (!branch) break;
      branches.push(branch);
      this.skipSpaces();
    }
    const defaultBranch = this.tryParse(() => {
      this.expect("default:");
      this.skipSpaces();
      return this.parseIfPipeline("end");
    });
    this.skipSpaces();
    this.tryParse(() => {
      this.expect("end");
      return true;
    });
    const end = this.pos;
    return { kind: "Dispatch", branches, default: defaultBranch || void 0, start, end };
  }
  parseDispatchBranch() {
    this.skipSpaces();
    const start = this.pos;
    this.expect("case");
    this.skipInlineSpaces();
    const condition = this.parseTagExpr();
    this.skipInlineSpaces();
    this.expect(":");
    this.skipSpaces();
    const pipeline = this.parseIfPipeline("case", "default:", "end");
    const end = this.pos;
    return { condition, pipeline, start, end };
  }
  /**
   * Parse a tag expression with boolean operators (and, or) and grouping
   * Grammar (precedence: AND > OR):
   *   tag_expr := or_expr
   *   or_expr  := and_expr ("or" and_expr)*
   *   and_expr := primary ("and" primary)*
   *   primary  := tag | "(" tag_expr ")"
   */
  parseTagExpr() {
    return this.parseOrExpr();
  }
  parseOrExpr() {
    let left = this.parseAndExpr();
    while (true) {
      const saved = this.pos;
      this.skipInlineSpaces();
      if (this.text.startsWith("or", this.pos) && !this.isIdentCont(this.text[this.pos + 2] || "")) {
        this.pos += 2;
        this.skipInlineSpaces();
        const right = this.parseAndExpr();
        left = { kind: "Or", left, right };
      } else {
        this.pos = saved;
        break;
      }
    }
    return left;
  }
  parseAndExpr() {
    let left = this.parseTagPrimary();
    while (true) {
      const saved = this.pos;
      this.skipInlineSpaces();
      if (this.text.startsWith("and", this.pos) && !this.isIdentCont(this.text[this.pos + 3] || "")) {
        this.pos += 3;
        this.skipInlineSpaces();
        const right = this.parseTagPrimary();
        left = { kind: "And", left, right };
      } else {
        this.pos = saved;
        break;
      }
    }
    return left;
  }
  parseTagPrimary() {
    if (this.cur() === "(") {
      this.pos++;
      this.skipInlineSpaces();
      const expr = this.parseTagExpr();
      this.skipInlineSpaces();
      this.expect(")");
      return expr;
    }
    const tag = this.parseTag();
    return { kind: "Tag", tag };
  }
  parseIfPipeline(...stopKeywords) {
    const start = this.pos;
    const steps = [];
    while (true) {
      const save = this.pos;
      this.skipSpaces();
      for (const keyword of stopKeywords) {
        if (this.text.startsWith(keyword, this.pos)) {
          this.pos = save;
          const end2 = this.pos;
          return { steps, start, end: end2 };
        }
      }
      if (!this.text.startsWith("|>", this.pos)) {
        this.pos = save;
        break;
      }
      const step = this.parsePipelineStep();
      steps.push(step);
    }
    const end = this.pos;
    return { steps, start, end };
  }
  parsePipeline() {
    const start = this.pos;
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
    const end = this.pos;
    return { steps, start, end };
  }
  parseNamedPipeline() {
    const start = this.pos;
    this.expect("pipeline");
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect("=");
    const inlineComment = this.parseInlineComment();
    this.skipInlineSpaces();
    const pipeline = this.parsePipeline();
    const end = this.pos;
    this.pipelineRanges.set(name, { start, end });
    this.skipWhitespaceOnly();
    return { name, pipeline, inlineComment: inlineComment || void 0, start, end };
  }
  parsePipelineRef() {
    const inline = this.tryParse(() => this.parsePipeline());
    if (inline && inline.steps.length > 0) {
      return { kind: "Inline", pipeline: inline, start: inline.start, end: inline.end };
    }
    const named = this.tryParse(() => {
      this.skipWhitespaceOnly();
      const start = this.pos;
      this.expect("|>");
      this.skipInlineSpaces();
      this.expect("pipeline:");
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      const end = this.pos;
      return { kind: "Named", name, start, end };
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
    const inlineComment = this.parseInlineComment();
    const end = this.pos;
    this.variableRanges.set(`${varType}::${name}`, { start, end });
    this.skipWhitespaceOnly();
    return { varType, name, value, inlineComment: inlineComment || void 0, start, end };
  }
  parseGraphQLSchema() {
    const start = this.pos;
    this.expect("graphqlSchema");
    this.skipInlineSpaces();
    this.expect("=");
    const inlineComment = this.parseInlineComment();
    this.skipInlineSpaces();
    const sdl = this.parseBacktickString();
    const end = this.pos;
    this.skipWhitespaceOnly();
    return { sdl, inlineComment: inlineComment || void 0, start, end };
  }
  parseQueryResolver() {
    const start = this.pos;
    this.expect("query");
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect("=");
    const inlineComment = this.parseInlineComment();
    this.skipWhitespaceOnly();
    const pipeline = this.parsePipeline();
    const end = this.pos;
    this.skipWhitespaceOnly();
    return { name, pipeline, inlineComment: inlineComment || void 0, start, end };
  }
  parseMutationResolver() {
    const start = this.pos;
    this.expect("mutation");
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect("=");
    const inlineComment = this.parseInlineComment();
    this.skipWhitespaceOnly();
    const pipeline = this.parsePipeline();
    const end = this.pos;
    this.skipWhitespaceOnly();
    return { name, pipeline, inlineComment: inlineComment || void 0, start, end };
  }
  parseTypeResolver() {
    const start = this.pos;
    this.expect("resolver");
    this.skipInlineSpaces();
    const typeName = this.parseIdentifier();
    this.expect(".");
    const fieldName = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect("=");
    const inlineComment = this.parseInlineComment();
    this.skipWhitespaceOnly();
    const pipeline = this.parsePipeline();
    const end = this.pos;
    this.skipWhitespaceOnly();
    return { typeName, fieldName, pipeline, inlineComment: inlineComment || void 0, start, end };
  }
  parseFeatureFlags() {
    this.expect("featureFlags");
    this.skipInlineSpaces();
    this.expect("=");
    this.skipWhitespaceOnly();
    const pipeline = this.parsePipeline();
    this.skipWhitespaceOnly();
    return pipeline;
  }
  parseRoute() {
    const start = this.pos;
    const method = this.parseMethod();
    this.skipInlineSpaces();
    const path = this.consumeWhile((c) => c !== " " && c !== "\n" && c !== "#");
    const inlineComment = this.parseInlineComment();
    this.skipSpaces();
    const pipeline = this.parsePipelineRef();
    const end = this.pos;
    this.skipWhitespaceOnly();
    return { method, path, pipeline, inlineComment: inlineComment || void 0, start, end };
  }
  parseWhen() {
    const calling = this.tryParse(() => {
      const start = this.pos;
      this.expect("calling");
      this.skipInlineSpaces();
      const method = this.parseMethod();
      this.skipInlineSpaces();
      const path = this.consumeWhile((c) => c !== "\n");
      const end = this.pos;
      return { kind: "CallingRoute", method, path, start, end };
    });
    if (calling) return calling;
    const executingPipeline = this.tryParse(() => {
      const start = this.pos;
      this.expect("executing");
      this.skipInlineSpaces();
      this.expect("pipeline");
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      const end = this.pos;
      return { kind: "ExecutingPipeline", name, start, end };
    });
    if (executingPipeline) return executingPipeline;
    const executingVariable = this.tryParse(() => {
      const start = this.pos;
      this.expect("executing");
      this.skipInlineSpaces();
      this.expect("variable");
      this.skipInlineSpaces();
      const varType = this.parseIdentifier();
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      const end = this.pos;
      return { kind: "ExecutingVariable", varType, name, start, end };
    });
    if (executingVariable) return executingVariable;
    throw new ParseFailure("when", this.pos);
  }
  parseCondition() {
    this.skipSpaces();
    const start = this.pos;
    const ct = (() => {
      if (this.match("then")) return "Then";
      if (this.match("and")) return "And";
      throw new Error("condition-type");
    })();
    this.skipInlineSpaces();
    const field = this.consumeWhile((c) => c !== " " && c !== "\n" && c !== "`");
    this.skipInlineSpaces();
    if (field === "call") {
      const callType = this.consumeWhile((c) => c !== " ");
      this.skipInlineSpaces();
      const callName = this.consumeWhile((c) => c !== " " && c !== "\n");
      const callTarget = `${callType}.${callName}`;
      this.skipInlineSpaces();
      let comparison2;
      if (this.text.startsWith("with arguments", this.pos)) {
        this.pos += 14;
        comparison2 = "with arguments";
      } else if (this.text.startsWith("with", this.pos)) {
        this.pos += 4;
        comparison2 = "with";
      } else {
        throw new Error('expected "with" or "with arguments"');
      }
      this.skipInlineSpaces();
      const value2 = (() => {
        const v1 = this.tryParse(() => this.parseBacktickString());
        if (v1 !== null) return v1;
        const v2 = this.tryParse(() => this.parseQuotedString());
        if (v2 !== null) return v2;
        return this.consumeWhile((c) => c !== "\n");
      })();
      const end2 = this.pos;
      return {
        conditionType: ct,
        field: "call",
        comparison: comparison2,
        value: value2,
        isCallAssertion: true,
        callTarget,
        start,
        end: end2
      };
    }
    if (field === "selector") {
      const selectorStr = (() => {
        const bt = this.tryParse(() => this.parseBacktickString());
        if (bt !== null) return bt;
        const qt = this.tryParse(() => this.parseQuotedString());
        if (qt !== null) return qt;
        throw new Error("selector requires quoted string");
      })();
      this.skipInlineSpaces();
      const operation = this.consumeWhile((c) => c !== " " && c !== "\n");
      this.skipInlineSpaces();
      let domAssert;
      let comparison2;
      let value2;
      if (operation === "exists") {
        domAssert = { kind: "Exists" };
        comparison2 = "exists";
        value2 = "true";
      } else if (operation === "does") {
        this.expect("not");
        this.skipInlineSpaces();
        this.expect("exist");
        domAssert = { kind: "Exists" };
        comparison2 = "does_not_exist";
        value2 = "false";
      } else if (operation === "text") {
        domAssert = { kind: "Text" };
        this.skipInlineSpaces();
        comparison2 = this.consumeWhile((c) => c !== " " && c !== "\n");
        this.skipInlineSpaces();
        value2 = (() => {
          const v1 = this.tryParse(() => this.parseBacktickString());
          if (v1 !== null) return v1;
          const v2 = this.tryParse(() => this.parseQuotedString());
          if (v2 !== null) return v2;
          return this.consumeWhile((c) => c !== "\n");
        })();
      } else if (operation === "count") {
        domAssert = { kind: "Count" };
        let compParts = "";
        while (this.pos < this.text.length && this.text[this.pos] !== "\n") {
          const c = this.text[this.pos];
          if (/\d/.test(c)) break;
          compParts += c;
          this.pos++;
        }
        comparison2 = compParts.trim();
        value2 = this.consumeWhile((c) => c !== "\n").trim();
      } else if (operation === "attribute") {
        const attrName = (() => {
          const bt = this.tryParse(() => this.parseBacktickString());
          if (bt !== null) return bt;
          const qt = this.tryParse(() => this.parseQuotedString());
          if (qt !== null) return qt;
          throw new Error("attribute requires quoted name");
        })();
        this.skipInlineSpaces();
        comparison2 = this.consumeWhile((c) => c !== " " && c !== "\n");
        this.skipInlineSpaces();
        value2 = (() => {
          const v1 = this.tryParse(() => this.parseBacktickString());
          if (v1 !== null) return v1;
          const v2 = this.tryParse(() => this.parseQuotedString());
          if (v2 !== null) return v2;
          return this.consumeWhile((c) => c !== "\n");
        })();
        domAssert = { kind: "Attribute", name: attrName };
      } else {
        throw new Error(`Unknown selector operation: ${operation}`);
      }
      const end2 = this.pos;
      return {
        conditionType: ct,
        field: "selector",
        comparison: comparison2,
        value: value2,
        selector: selectorStr,
        domAssert,
        start,
        end: end2
      };
    }
    let headerName;
    if (field === "header") {
      const h1 = this.tryParse(() => this.parseBacktickString());
      if (h1 !== null) {
        headerName = h1;
      } else {
        const h2 = this.tryParse(() => this.parseQuotedString());
        if (h2 !== null) {
          headerName = h2;
        }
      }
      this.skipInlineSpaces();
    }
    const jqExpr = headerName === void 0 ? this.tryParse(() => this.parseBacktickString()) : null;
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
    const end = this.pos;
    return { conditionType: ct, field, headerName: headerName ?? void 0, jqExpr: jqExpr ?? void 0, comparison, value, start, end };
  }
  parseMockHead(prefixWord) {
    this.skipSpaces();
    const start = this.pos;
    this.expect(prefixWord);
    this.skipInlineSpaces();
    this.expect("mock");
    this.skipInlineSpaces();
    let target;
    if (this.text.startsWith("query ", this.pos) || this.text.startsWith("mutation ", this.pos)) {
      const type = this.consumeWhile((c) => c !== " ");
      this.skipInlineSpaces();
      const name = this.consumeWhile((c) => c !== " " && c !== "\n");
      target = `${type}.${name}`;
    } else {
      target = this.consumeWhile((c) => c !== " " && c !== "\n");
    }
    this.skipInlineSpaces();
    this.expect("returning");
    this.skipInlineSpaces();
    const returnValue = this.parseBacktickString();
    this.skipSpaces();
    const end = this.pos;
    return { target, returnValue, start, end };
  }
  parseMock() {
    return this.parseMockHead("with");
  }
  parseAndMock() {
    return this.parseMockHead("and");
  }
  parseLetBinding() {
    const fullStart = this.pos;
    this.expect("let");
    this.skipInlineSpaces();
    const nameStart = this.pos;
    const name = this.parseIdentifier();
    const nameEnd = this.pos;
    if (this.currentDescribeName !== null) {
      this.testLetVariables.push({
        name,
        describeName: this.currentDescribeName,
        testName: this.currentTestName || void 0,
        start: nameStart,
        end: nameEnd
      });
    }
    this.skipInlineSpaces();
    this.expect("=");
    this.skipInlineSpaces();
    let format;
    const value = (() => {
      const bt = this.tryParse(() => this.parseBacktickString());
      if (bt !== null) {
        format = "backtick";
        return bt;
      }
      const qt = this.tryParse(() => this.parseQuotedString());
      if (qt !== null) {
        format = "quoted";
        return qt;
      }
      if (this.text.startsWith("null", this.pos)) {
        this.pos += 4;
        format = "bare";
        return "null";
      }
      if (this.text.startsWith("true", this.pos)) {
        this.pos += 4;
        format = "bare";
        return "true";
      }
      if (this.text.startsWith("false", this.pos)) {
        this.pos += 5;
        format = "bare";
        return "false";
      }
      const num = this.tryParse(() => {
        const digits = this.consumeWhile((c) => /[0-9]/.test(c));
        if (digits.length === 0) throw new Error("number");
        if (this.cur() === ".") {
          this.pos++;
          const decimals = this.consumeWhile((c) => /[0-9]/.test(c));
          if (decimals.length === 0) throw new Error("Expected digits after decimal point");
          return digits + "." + decimals;
        }
        return digits;
      });
      if (num !== null) {
        format = "bare";
        return num;
      }
      throw new Error("let value");
    })();
    const fullEnd = this.pos;
    return {
      name,
      value,
      format,
      start: nameStart,
      end: nameEnd,
      fullStart,
      fullEnd
    };
  }
  parseIt() {
    const start = this.pos;
    this.skipSpaces();
    this.expect("it");
    this.skipInlineSpaces();
    this.expect('"');
    const name = this.consumeWhile((c) => c !== '"');
    this.expect('"');
    this.skipSpaces();
    this.currentTestName = name;
    const mocks = [];
    while (true) {
      const m = this.tryParse(() => this.parseMock());
      if (!m) break;
      mocks.push(m);
    }
    const variables = [];
    while (true) {
      const letBinding = this.tryParse(() => {
        const binding = this.parseLetBinding();
        this.skipSpaces();
        return binding;
      });
      if (letBinding) {
        variables.push(letBinding);
        continue;
      }
      break;
    }
    this.expect("when");
    this.skipInlineSpaces();
    const when = this.parseWhen();
    this.skipSpaces();
    let input;
    let body;
    let headers;
    let cookies;
    let firstWithClause = true;
    while (true) {
      const parsed = this.tryParse(() => {
        if (firstWithClause) {
          this.expect("with");
        } else {
          this.expect("and");
          this.skipInlineSpaces();
          this.expect("with");
        }
        this.skipInlineSpaces();
        if (this.text.startsWith("input", this.pos)) {
          this.expect("input");
          this.skipInlineSpaces();
          const v = this.parseBacktickString();
          this.skipSpaces();
          return { type: "input", value: v };
        } else if (this.text.startsWith("body", this.pos)) {
          this.expect("body");
          this.skipInlineSpaces();
          const v = this.parseBacktickString();
          this.skipSpaces();
          return { type: "body", value: v };
        } else if (this.text.startsWith("headers", this.pos)) {
          this.expect("headers");
          this.skipInlineSpaces();
          const v = this.parseBacktickString();
          this.skipSpaces();
          return { type: "headers", value: v };
        } else if (this.text.startsWith("cookies", this.pos)) {
          this.expect("cookies");
          this.skipInlineSpaces();
          const v = this.parseBacktickString();
          this.skipSpaces();
          return { type: "cookies", value: v };
        } else if (this.text.startsWith("mock", this.pos)) {
          throw new Error("mock");
        } else {
          throw new Error("unknown with clause");
        }
      });
      if (!parsed) break;
      if (parsed.type === "input") input = parsed.value;
      else if (parsed.type === "body") body = parsed.value;
      else if (parsed.type === "headers") headers = parsed.value;
      else if (parsed.type === "cookies") cookies = parsed.value;
      firstWithClause = false;
    }
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
    this.currentTestName = null;
    const end = this.pos;
    return {
      name,
      mocks: [...mocks, ...extraMocks],
      when,
      variables: variables.length > 0 ? variables : void 0,
      input,
      body,
      headers,
      cookies,
      conditions,
      start,
      end
    };
  }
  parseDescribe() {
    const start = this.pos;
    this.skipSpaces();
    this.expect("describe");
    this.skipInlineSpaces();
    this.expect('"');
    const name = this.consumeWhile((c) => c !== '"');
    this.expect('"');
    const inlineComment = this.parseInlineComment();
    this.skipSpaces();
    this.currentDescribeName = name;
    const variables = [];
    const mocks = [];
    const tests = [];
    while (true) {
      this.skipSpaces();
      const letBinding = this.tryParse(() => this.parseLetBinding());
      if (letBinding) {
        variables.push(letBinding);
        continue;
      }
      const withMock = this.tryParse(() => this.parseMock());
      if (withMock) {
        mocks.push(withMock);
        continue;
      }
      const andMock = this.tryParse(() => this.parseAndMock());
      if (andMock) {
        mocks.push(andMock);
        continue;
      }
      const it = this.tryParse(() => this.parseIt());
      if (it) {
        tests.push(it);
        continue;
      }
      break;
    }
    this.currentDescribeName = null;
    const end = this.pos;
    return { name, variables, mocks, tests, inlineComment: inlineComment || void 0, start, end };
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
function getTestLetVariables(text) {
  const parser = new Parser(text);
  parser.parseProgram();
  return parser.getTestLetVariables();
}
function getTestLetVariableRanges(text) {
  const parser = new Parser(text);
  parser.parseProgram();
  const variables = parser.getTestLetVariables();
  const map = /* @__PURE__ */ new Map();
  for (const v of variables) {
    map.set(v.name, { start: v.start, end: v.end });
  }
  return map;
}
var ParseFailure = class extends Error {
  constructor(message, at) {
    super(message);
    this.at = at;
  }
};
function printRoute(route) {
  const lines = [];
  const routeLine = `${route.method} ${route.path}`;
  if (route.inlineComment) {
    lines.push(`${routeLine} ${printComment(route.inlineComment)}`);
  } else {
    lines.push(routeLine);
  }
  const pipelineLines = formatPipelineRef(route.pipeline);
  pipelineLines.forEach((line) => lines.push(line));
  return lines.join("\n");
}
function printConfig(config) {
  const lines = [];
  const configLine = `config ${config.name} {`;
  if (config.inlineComment) {
    lines.push(`${configLine} ${printComment(config.inlineComment)}`);
  } else {
    lines.push(configLine);
  }
  config.properties.forEach((prop) => {
    const value = formatConfigValue(prop.value);
    lines.push(`  ${prop.key}: ${value}`);
  });
  lines.push("}");
  return lines.join("\n");
}
function printPipeline(pipeline) {
  const lines = [];
  const pipelineLine = `pipeline ${pipeline.name} =`;
  if (pipeline.inlineComment) {
    lines.push(`${pipelineLine} ${printComment(pipeline.inlineComment)}`);
  } else {
    lines.push(pipelineLine);
  }
  pipeline.pipeline.steps.forEach((step) => {
    lines.push(formatPipelineStep(step));
  });
  return lines.join("\n");
}
function printVariable(variable) {
  const variableLine = `${variable.varType} ${variable.name} = \`${variable.value}\``;
  if (variable.inlineComment) {
    return `${variableLine} ${printComment(variable.inlineComment)}`;
  }
  return variableLine;
}
function printGraphQLSchema(schema) {
  const schemaLine = `graphql schema = \`${schema.sdl}\``;
  if (schema.inlineComment) {
    return `${schemaLine} ${printComment(schema.inlineComment)}`;
  }
  return schemaLine;
}
function printQueryResolver(query) {
  const lines = [];
  const queryLine = `query ${query.name} =`;
  if (query.inlineComment) {
    lines.push(`${queryLine} ${printComment(query.inlineComment)}`);
  } else {
    lines.push(queryLine);
  }
  query.pipeline.steps.forEach((step) => {
    lines.push(formatPipelineStep(step));
  });
  return lines.join("\n");
}
function printMutationResolver(mutation) {
  const lines = [];
  const mutationLine = `mutation ${mutation.name} =`;
  if (mutation.inlineComment) {
    lines.push(`${mutationLine} ${printComment(mutation.inlineComment)}`);
  } else {
    lines.push(mutationLine);
  }
  mutation.pipeline.steps.forEach((step) => {
    lines.push(formatPipelineStep(step));
  });
  return lines.join("\n");
}
function printTypeResolver(resolver) {
  const lines = [];
  const resolverLine = `resolver ${resolver.typeName}.${resolver.fieldName} =`;
  if (resolver.inlineComment) {
    lines.push(`${resolverLine} ${printComment(resolver.inlineComment)}`);
  } else {
    lines.push(resolverLine);
  }
  resolver.pipeline.steps.forEach((step) => {
    lines.push(formatPipelineStep(step));
  });
  return lines.join("\n");
}
function printMock(mock, indent = "  ") {
  return `${indent}with mock ${mock.target} returning \`${mock.returnValue}\``;
}
function printCondition(condition, indent = "    ") {
  const condType = condition.conditionType.toLowerCase();
  if (condition.field === "selector" && condition.selector && condition.domAssert) {
    const selector = condition.selector;
    const formatValue = (val) => {
      if (val.startsWith("`") || val.startsWith('"')) return val;
      if (val.includes("\n") || val.includes("{") || val.includes("[")) return `\`${val}\``;
      return `"${val}"`;
    };
    if (condition.domAssert.kind === "Exists") {
      const operation = condition.comparison === "exists" ? "exists" : "does not exist";
      return `${indent}${condType} selector "${selector}" ${operation}`;
    } else if (condition.domAssert.kind === "Text") {
      return `${indent}${condType} selector "${selector}" text ${condition.comparison} ${formatValue(condition.value)}`;
    } else if (condition.domAssert.kind === "Count") {
      return `${indent}${condType} selector "${selector}" count ${condition.comparison} ${condition.value}`;
    } else if (condition.domAssert.kind === "Attribute") {
      return `${indent}${condType} selector "${selector}" attribute "${condition.domAssert.name}" ${condition.comparison} ${formatValue(condition.value)}`;
    }
  }
  const fieldPart = condition.headerName ? `${condition.field} "${condition.headerName}"` : condition.jqExpr ? `${condition.field} \`${condition.jqExpr}\`` : condition.field;
  const value = condition.value.startsWith("`") ? condition.value : condition.value.includes("\n") || condition.value.includes("{") || condition.value.includes("[") ? `\`${condition.value}\`` : condition.value;
  return `${indent}${condType} ${fieldPart} ${condition.comparison} ${value}`;
}
function printTest(test) {
  const lines = [];
  lines.push(`  it "${test.name}"`);
  test.mocks.forEach((mock) => {
    lines.push(printMock(mock, "    "));
  });
  lines.push(`    when ${formatWhen(test.when)}`);
  if (test.variables) {
    test.variables.forEach((variable) => {
      const formattedValue = variable.format === "quoted" ? `"${variable.value}"` : variable.format === "backtick" ? `\`${variable.value}\`` : variable.value;
      lines.push(`    let ${variable.name} = ${formattedValue}`);
    });
  }
  if (test.input) {
    lines.push(`    with input \`${test.input}\``);
  }
  if (test.body) {
    lines.push(`    with body \`${test.body}\``);
  }
  if (test.headers) {
    lines.push(`    with headers \`${test.headers}\``);
  }
  if (test.cookies) {
    lines.push(`    with cookies \`${test.cookies}\``);
  }
  test.conditions.forEach((condition) => {
    lines.push(printCondition(condition));
  });
  return lines.join("\n");
}
function printComment(comment) {
  if (comment.style === "#" && comment.text.startsWith("#")) {
    return `${comment.style}${comment.text}`;
  }
  if (comment.text === "" || comment.text.startsWith(" ")) {
    return `${comment.style}${comment.text}`;
  }
  return `${comment.style} ${comment.text}`;
}
function printDescribe(describe) {
  const lines = [];
  const describeLine = `describe "${describe.name}"`;
  if (describe.inlineComment) {
    lines.push(`${describeLine} ${printComment(describe.inlineComment)}`);
  } else {
    lines.push(describeLine);
  }
  if (describe.variables && describe.variables.length > 0) {
    describe.variables.forEach((variable) => {
      const formattedValue = variable.format === "quoted" ? `"${variable.value}"` : variable.format === "backtick" ? `\`${variable.value}\`` : variable.value;
      lines.push(`  let ${variable.name} = ${formattedValue}`);
    });
    lines.push("");
  }
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
  if (program.graphqlSchema) {
    allItems.push({ type: "graphqlSchema", item: program.graphqlSchema, lineNumber: program.graphqlSchema.lineNumber || 0 });
  }
  program.queries.forEach((query) => {
    allItems.push({ type: "query", item: query, lineNumber: query.lineNumber || 0 });
  });
  program.mutations.forEach((mutation) => {
    allItems.push({ type: "mutation", item: mutation, lineNumber: mutation.lineNumber || 0 });
  });
  program.resolvers.forEach((resolver) => {
    allItems.push({ type: "resolver", item: resolver, lineNumber: resolver.lineNumber || 0 });
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
  program.comments.forEach((comment) => {
    allItems.push({ type: "comment", item: comment, lineNumber: comment.lineNumber || 0 });
  });
  allItems.sort((a, b) => a.lineNumber - b.lineNumber);
  allItems.forEach((entry, index) => {
    switch (entry.type) {
      case "comment":
        lines.push(printComment(entry.item));
        break;
      case "config":
        lines.push(printConfig(entry.item));
        lines.push("");
        break;
      case "graphqlSchema":
        lines.push(printGraphQLSchema(entry.item));
        lines.push("");
        break;
      case "query":
        lines.push(printQueryResolver(entry.item));
        lines.push("");
        break;
      case "mutation":
        lines.push(printMutationResolver(entry.item));
        lines.push("");
        break;
      case "resolver":
        lines.push(printTypeResolver(entry.item));
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
  return lines.join("\n").trim() + "\n";
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
    const argsPart = step.args.length > 0 ? `(${step.args.join(", ")})` : "";
    const configPart = formatStepConfig(step.config, step.configType);
    const conditionPart = step.condition ? " " + formatTagExpr(step.condition) : "";
    return `${indent}|> ${step.name}${argsPart}: ${configPart}${conditionPart}`;
  } else if (step.kind === "Result") {
    const lines = [`${indent}|> result`];
    step.branches.forEach((branch) => {
      const branchName = branch.branchType.kind === "Ok" ? "ok" : branch.branchType.kind === "Default" ? "default" : branch.branchType.name;
      lines.push(`${indent}  ${branchName}(${branch.statusCode}):`);
      branch.pipeline.steps.forEach((branchStep) => {
        lines.push(formatPipelineStep(branchStep, indent + "    "));
      });
    });
    return lines.join("\n");
  } else if (step.kind === "If") {
    const lines = [`${indent}|> if`];
    step.condition.steps.forEach((condStep) => {
      lines.push(formatPipelineStep(condStep, indent + "  "));
    });
    lines.push(`${indent}  then:`);
    step.thenBranch.steps.forEach((thenStep) => {
      lines.push(formatPipelineStep(thenStep, indent + "    "));
    });
    if (step.elseBranch) {
      lines.push(`${indent}  else:`);
      step.elseBranch.steps.forEach((elseStep) => {
        lines.push(formatPipelineStep(elseStep, indent + "    "));
      });
    }
    return lines.join("\n");
  } else if (step.kind === "Dispatch") {
    const lines = [`${indent}|> dispatch`];
    step.branches.forEach((branch) => {
      lines.push(`${indent}  case ${formatTagExpr(branch.condition)}:`);
      branch.pipeline.steps.forEach((branchStep) => {
        lines.push(formatPipelineStep(branchStep, indent + "    "));
      });
    });
    if (step.default) {
      lines.push(`${indent}  default:`);
      step.default.steps.forEach((defaultStep) => {
        lines.push(formatPipelineStep(defaultStep, indent + "    "));
      });
    }
    return lines.join("\n");
  } else {
    const lines = [`${indent}|> foreach ${step.selector}`];
    step.pipeline.steps.forEach((innerStep) => {
      lines.push(formatPipelineStep(innerStep, indent + "  "));
    });
    lines.push(`${indent}end`);
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
function formatTags(tags) {
  return tags.map(formatTag).join(" ");
}
function formatTag(tag) {
  const negation = tag.negated ? "!" : "";
  const formattedArgs = tag.args.map((arg) => {
    if (/[^a-zA-Z0-9_-]/.test(arg)) {
      return `\`${arg}\``;
    }
    return arg;
  });
  const args = tag.args.length > 0 ? `(${formattedArgs.join(",")})` : "";
  return `@${negation}${tag.name}${args}`;
}
function formatTagExpr(expr) {
  switch (expr.kind) {
    case "Tag":
      return formatTag(expr.tag);
    case "And": {
      const leftStr = expr.left.kind === "Or" ? `(${formatTagExpr(expr.left)})` : formatTagExpr(expr.left);
      const rightStr = expr.right.kind === "Or" ? `(${formatTagExpr(expr.right)})` : formatTagExpr(expr.right);
      return `${leftStr} and ${rightStr}`;
    }
    case "Or":
      return `${formatTagExpr(expr.left)} or ${formatTagExpr(expr.right)}`;
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
export {
  formatConfigValue,
  formatPipelineRef,
  formatPipelineStep,
  formatStepConfig,
  formatTag,
  formatTagExpr,
  formatTags,
  formatWhen,
  getPipelineRanges,
  getTestLetVariableRanges,
  getTestLetVariables,
  getVariableRanges,
  parseProgram,
  parseProgramWithDiagnostics,
  prettyPrint,
  printComment,
  printCondition,
  printConfig,
  printDescribe,
  printGraphQLSchema,
  printMock,
  printMutationResolver,
  printPipeline,
  printQueryResolver,
  printRoute,
  printTest,
  printTypeResolver,
  printVariable
};
