export interface Program {
  configs: Config[];
  pipelines: NamedPipeline[];
  variables: Variable[];
  routes: Route[];
  describes: Describe[];
  comments: Comment[];
}

export interface Comment {
  type: 'standalone' | 'inline';
  text: string;
  style: '#' | '//';
  lineNumber?: number;
}

export interface Config {
  name: string;
  properties: ConfigProperty[];
  lineNumber?: number;
  inlineComment?: Comment;
}

export interface ConfigProperty {
  key: string;
  value: ConfigValue;
}

export type ConfigValue =
  | { kind: 'String'; value: string }
  | { kind: 'EnvVar'; var: string; default?: string }
  | { kind: 'Boolean'; value: boolean }
  | { kind: 'Number'; value: number };

export interface NamedPipeline {
  name: string;
  pipeline: Pipeline;
  lineNumber?: number;
  inlineComment?: Comment;
}

export interface Variable {
  varType: string;
  name: string;
  value: string;
  lineNumber?: number;
  inlineComment?: Comment;
}

export interface Route {
  method: string;
  path: string;
  pipeline: PipelineRef;
  lineNumber?: number;
  inlineComment?: Comment;
}

export type PipelineRef =
  | { kind: 'Inline'; pipeline: Pipeline }
  | { kind: 'Named'; name: string };

export interface Pipeline {
  steps: PipelineStep[];
}

export type ConfigType = 'backtick' | 'quoted' | 'identifier';

export type PipelineStep =
  | { kind: 'Regular'; name: string; config: string; configType: ConfigType }
  | { kind: 'Result'; branches: ResultBranch[] };

export interface ResultBranch {
  branchType: ResultBranchType;
  statusCode: number;
  pipeline: Pipeline;
}

export type ResultBranchType =
  | { kind: 'Ok' }
  | { kind: 'Custom'; name: string }
  | { kind: 'Default' };

export interface Describe {
  name: string;
  mocks: Mock[];
  tests: It[];
  lineNumber?: number;
  inlineComment?: Comment;
}

export interface Mock {
  target: string;
  returnValue: string;
}

export interface It {
  name: string;
  mocks: Mock[];
  when: When;
  input?: string;
  conditions: Condition[];
}

export type When =
  | { kind: 'CallingRoute'; method: string; path: string }
  | { kind: 'ExecutingPipeline'; name: string }
  | { kind: 'ExecutingVariable'; varType: string; name: string };

export interface Condition {
  conditionType: 'Then' | 'And';
  field: string;
  jqExpr?: string;
  comparison: string;
  value: string;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';
export interface ParseDiagnostic {
  message: string;
  start: number;
  end: number;
  severity: DiagnosticSeverity;
}

class Parser {
  private readonly text: string;
  private readonly len: number;
  private pos: number = 0;
  private diagnostics: ParseDiagnostic[] = [];
  private readonly pipelineRanges: Map<string, { start: number; end: number }> = new Map();
  private readonly variableRanges: Map<string, { start: number; end: number }> = new Map();

  constructor(text: string) {
    this.text = text;
    this.len = text.length;
  }

  getDiagnostics(): ParseDiagnostic[] {
    return this.diagnostics.slice();
  }

  getPipelineRanges(): Map<string, { start: number; end: number }> {
    return new Map(this.pipelineRanges);
  }

  getVariableRanges(): Map<string, { start: number; end: number }> {
    return new Map(this.variableRanges);
  }

  report(message: string, start: number, end: number, severity: DiagnosticSeverity): void {
    this.diagnostics.push({ message, start, end, severity });
  }

  findLineStart(pos: number): number {
    let i = Math.max(0, Math.min(pos, this.len));
    while (i > 0 && this.text[i - 1] !== '\n') i--;
    return i;
  }

  findLineEnd(pos: number): number {
    let i = Math.max(0, Math.min(pos, this.len));
    while (i < this.text.length && this.text[i] !== '\n') i++;
    return i;
  }

  getLineNumber(pos: number): number {
    return this.text.slice(0, pos).split('\n').length;
  }

  private parseInlineComment(): Comment | null {
    this.skipInlineSpaces();
    const start = this.pos;
    
    if (this.text.startsWith('#', this.pos)) {
      this.pos++; // Skip #
      const text = this.consumeWhile((ch) => ch !== '\n');
      return {
        type: 'inline',
        text: text,
        style: '#',
        lineNumber: this.getLineNumber(start)
      };
    }
    
    if (this.text.startsWith('//', this.pos)) {
      this.pos += 2; // Skip //
      const text = this.consumeWhile((ch) => ch !== '\n');
      return {
        type: 'inline',
        text: text,
        style: '//',
        lineNumber: this.getLineNumber(start)
      };
    }
    
    return null;
  }

  private parseStandaloneComment(): Comment | null {
    const start = this.pos;
    
    if (this.text.startsWith('#', this.pos)) {
      const originalPos = this.pos;
      this.pos++; // Skip first #
      const restOfLine = this.consumeWhile((ch) => ch !== '\n');
      // Store the complete original comment text (without the first #)
      return {
        type: 'standalone',
        text: restOfLine,
        style: '#',
        lineNumber: this.getLineNumber(start)
      };
    }
    
    if (this.text.startsWith('//', this.pos)) {
      this.pos += 2; // Skip //
      const text = this.consumeWhile((ch) => ch !== '\n');
      return {
        type: 'standalone',
        text: text,
        style: '//',
        lineNumber: this.getLineNumber(start)
      };
    }
    
    return null;
  }

  parseProgram(): Program {
    this.skipWhitespaceOnly();

    const configs: Config[] = [];
    const pipelines: NamedPipeline[] = [];
    const variables: Variable[] = [];
    const routes: Route[] = [];
    const describes: Describe[] = [];
    const comments: Comment[] = [];

    while (!this.eof()) {
      this.skipWhitespaceOnly();
      if (this.eof()) break;

      const start = this.pos;

      // Try to parse a standalone comment first
      const comment = this.tryParse(() => this.parseStandaloneComment());
      if (comment) {
        comments.push(comment);
        if (this.cur() === '\n') this.pos++;
        continue;
      }

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
        this.report('Unrecognized or unsupported syntax', lineStart, lineEnd, 'warning');
        this.skipToEol();
        if (this.cur() === '\n') this.pos++;
        this.consumeWhile((c) => c === '\n');
      }
    }

    const backtickCount = (this.text.match(/`/g) || []).length;
    if (backtickCount % 2 === 1) {
      const idx = this.text.lastIndexOf('`');
      const start = Math.max(0, idx);
      this.report('Unclosed backtick-delimited string', start, start + 1, 'warning');
    }

    return { configs, pipelines, variables, routes, describes, comments };
  }

  private eof(): boolean { return this.pos >= this.len; }
  private peek(): string { return this.text[this.pos] ?? '\0'; }
  private cur(): string { return this.text[this.pos] ?? '\0'; }
  private ahead(n: number): string { return this.text[this.pos + n] ?? '\0'; }

  private tryParse<T>(fn: () => T): T | null {
    const save = this.pos;
    try {
      const value = fn();
      return value;
    } catch (_e) {
      this.pos = save;
      return null;
    }
  }

  private skipSpaces(): void {
    while (true) {
      this.consumeWhile((ch) => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n');
      if (this.text.startsWith('#', this.pos)) {
        this.skipToEol();
        if (this.cur() === '\n') this.pos++;
        continue;
      }
      if (this.text.startsWith('//', this.pos)) {
        this.skipToEol();
        if (this.cur() === '\n') this.pos++;
        continue;
      }
      break;
    }
  }

  private skipWhitespaceOnly(): void {
    this.consumeWhile((ch) => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n');
  }

  private skipInlineSpaces(): void {
    this.consumeWhile((ch) => ch === ' ' || ch === '\t' || ch === '\r');
  }

  private consumeWhile(pred: (ch: string) => boolean): string {
    const start = this.pos;
    while (!this.eof() && pred(this.text[this.pos])) this.pos++;
    return this.text.slice(start, this.pos);
  }

  private match(str: string): boolean {
    if (this.text.startsWith(str, this.pos)) {
      this.pos += str.length;
      return true;
    }
    return false;
  }

  private expect(str: string): void {
    if (!this.match(str)) throw new ParseFailure(`expected '${str}'`, this.pos);
  }

  private skipToEol(): void {
    while (!this.eof() && this.cur() !== '\n') this.pos++;
  }

  private isIdentStart(ch: string): boolean {
    return /[A-Za-z_]/.test(ch);
  }

  private isIdentCont(ch: string): boolean {
    return /[A-Za-z0-9_\-]/.test(ch);
  }

  private parseIdentifier(): string {
    if (!this.isIdentStart(this.cur())) throw new ParseFailure('identifier', this.pos);
    const start = this.pos;
    this.pos++;
    while (!this.eof() && this.isIdentCont(this.cur())) this.pos++;
    return this.text.slice(start, this.pos);
  }

  private parseNumber(): number {
    const start = this.pos;
    const digits = this.consumeWhile((c) => /[0-9]/.test(c));
    if (digits.length === 0) throw new ParseFailure('number', this.pos);
    return parseInt(this.text.slice(start, this.pos), 10);
  }

  private parseQuotedString(): string {
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

  private parseBacktickString(): string {
    this.expect('`');
    const start = this.pos;
    while (!this.eof()) {
      const ch = this.cur();
      if (ch === '`') break;
      this.pos++;
    }
    const content = this.text.slice(start, this.pos);
    this.expect('`');
    return content;
  }

  private parseMethod(): string {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    for (const m of methods) {
      if (this.text.startsWith(m, this.pos)) {
        this.pos += m.length;
        return m;
      }
    }
    throw new ParseFailure('method', this.pos);
  }

  private parseStepConfig(): { config: string; configType: ConfigType } {
    const bt = this.tryParse(() => this.parseBacktickString());
    if (bt !== null) return { config: bt, configType: 'backtick' };
    const dq = this.tryParse(() => this.parseQuotedString());
    if (dq !== null) return { config: dq, configType: 'quoted' };
    const id = this.tryParse(() => this.parseIdentifier());
    if (id !== null) return { config: id, configType: 'identifier' };
    throw new ParseFailure('step-config', this.pos);
  }

  private parseConfigValue(): ConfigValue {
    const envWithDefault = this.tryParse(() => {
      this.expect('$');
      const variable = this.parseIdentifier();
      this.skipInlineSpaces();
      this.expect('||');
      this.skipInlineSpaces();
      const def = this.parseQuotedString();
      return { kind: 'EnvVar', var: variable, default: def } as ConfigValue;
    });
    if (envWithDefault) return envWithDefault;

    const envNoDefault = this.tryParse(() => {
      this.expect('$');
      const variable = this.parseIdentifier();
      return { kind: 'EnvVar', var: variable } as ConfigValue;
    });
    if (envNoDefault) return envNoDefault;

    const str = this.tryParse(() => this.parseQuotedString());
    if (str !== null) return { kind: 'String', value: str };

    const bool = this.tryParse(() => {
      if (this.match('true')) return true;
      if (this.match('false')) return false;
      throw new ParseFailure('bool', this.pos);
    });
    if (bool !== null) return { kind: 'Boolean', value: bool };

    const num = this.tryParse(() => this.parseNumber());
    if (num !== null) return { kind: 'Number', value: num };

    throw new ParseFailure('config-value', this.pos);
  }

  private parseConfigProperty(): ConfigProperty {
    this.skipSpaces();
    const key = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect(':');
    this.skipInlineSpaces();
    const value = this.parseConfigValue();
    return { key, value };
  }

  private parseConfig(): Config {
    this.expect('config');
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect('{');
    const inlineComment = this.parseInlineComment();
    this.skipSpaces();
    const properties: ConfigProperty[] = [];
    while (true) {
      const prop = this.tryParse(() => this.parseConfigProperty());
      if (!prop) break;
      properties.push(prop);
      this.skipSpaces();
    }
    this.skipSpaces();
    this.expect('}');
    this.skipWhitespaceOnly();
    return { name, properties, inlineComment: inlineComment || undefined };
  }

  private parsePipelineStep(): PipelineStep {
    const result = this.tryParse(() => this.parseResultStep());
    if (result) return result;
    return this.parseRegularStep();
  }

  private parseRegularStep(): PipelineStep {
    this.skipWhitespaceOnly();
    this.expect('|>');
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.expect(':');
    this.skipInlineSpaces();
    const { config, configType } = this.parseStepConfig();
    this.skipWhitespaceOnly();
    return { kind: 'Regular', name, config, configType };
  }

  private parseResultStep(): PipelineStep {
    this.skipWhitespaceOnly();
    this.expect('|>');
    this.skipInlineSpaces();
    this.expect('result');
    this.skipWhitespaceOnly();
    const branches: ResultBranch[] = [];
    while (true) {
      const br = this.tryParse(() => this.parseResultBranch());
      if (!br) break;
      branches.push(br);
    }
    return { kind: 'Result', branches };
  }

  private parseResultBranch(): ResultBranch {
    this.skipSpaces();
    const branchIdent = this.parseIdentifier();
    let branchType: ResultBranchType;
    if (branchIdent === 'ok') branchType = { kind: 'Ok' };
    else if (branchIdent === 'default') branchType = { kind: 'Default' };
    else branchType = { kind: 'Custom', name: branchIdent };
    this.expect('(');
    const statusCode = this.parseNumber();
    if (statusCode < 100 || statusCode > 599) {
      this.report(`Invalid HTTP status code: ${statusCode}`,
        this.pos - String(statusCode).length,
        this.pos,
        'error');
    }
    this.expect(')');
    this.expect(':');
    this.skipSpaces();
    const pipeline = this.parsePipeline();
    return { branchType, statusCode, pipeline };
  }

  private parsePipeline(): Pipeline {
    const steps: PipelineStep[] = [];
    while (true) {
      const save = this.pos;
      this.skipWhitespaceOnly();
      if (!this.text.startsWith('|>', this.pos)) {
        this.pos = save;
        break;
      }
      const step = this.parsePipelineStep();
      steps.push(step);
    }
    return { steps };
  }

  private parseNamedPipeline(): NamedPipeline {
    const start = this.pos;
    this.expect('pipeline');
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect('=');
    const inlineComment = this.parseInlineComment();
    this.skipInlineSpaces();
    const beforePipeline = this.pos;
    const pipeline = this.parsePipeline();
    const end = this.pos;
    this.pipelineRanges.set(name, { start, end });
    this.skipWhitespaceOnly();
    return { name, pipeline, inlineComment: inlineComment || undefined };
  }

  private parsePipelineRef(): PipelineRef {
    const inline = this.tryParse(() => this.parsePipeline());
    if (inline && inline.steps.length > 0) return { kind: 'Inline', pipeline: inline };

    const named = this.tryParse(() => {
      this.skipWhitespaceOnly();
      this.expect('|>');
      this.skipInlineSpaces();
      this.expect('pipeline:');
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      return { kind: 'Named', name } as PipelineRef;
    });
    if (named) return named;
    throw new Error('pipeline-ref');
  }

  private parseVariable(): Variable {
    const start = this.pos;
    const varType = this.parseIdentifier();
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect('=');
    this.skipInlineSpaces();
    const value = this.parseBacktickString();
    const inlineComment = this.parseInlineComment();
    const end = this.pos;
    this.variableRanges.set(`${varType}::${name}`, { start, end });
    this.skipWhitespaceOnly();
    return { varType, name, value, inlineComment: inlineComment || undefined };
  }

  private parseRoute(): Route {
    const method = this.parseMethod();
    this.skipInlineSpaces();
    const path = this.consumeWhile((c) => c !== ' ' && c !== '\n' && c !== '#');
    const inlineComment = this.parseInlineComment();
    this.skipSpaces();
    const pipeline = this.parsePipelineRef();
    this.skipWhitespaceOnly();
    return { method, path, pipeline, inlineComment: inlineComment || undefined };
  }

  private parseWhen(): When {
    const calling = this.tryParse(() => {
      this.expect('calling');
      this.skipInlineSpaces();
      const method = this.parseMethod();
      this.skipInlineSpaces();
      const path = this.consumeWhile((c) => c !== '\n');
      return { kind: 'CallingRoute', method, path } as When;
    });
    if (calling) return calling;

    const executingPipeline = this.tryParse(() => {
      this.expect('executing');
      this.skipInlineSpaces();
      this.expect('pipeline');
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      return { kind: 'ExecutingPipeline', name } as When;
    });
    if (executingPipeline) return executingPipeline;

    const executingVariable = this.tryParse(() => {
      this.expect('executing');
      this.skipInlineSpaces();
      this.expect('variable');
      this.skipInlineSpaces();
      const varType = this.parseIdentifier();
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      return { kind: 'ExecutingVariable', varType, name } as When;
    });
    if (executingVariable) return executingVariable;

    throw new ParseFailure('when', this.pos);
  }

  private parseCondition(): Condition {
    this.skipSpaces();
    const ct = (() => {
      if (this.match('then')) return 'Then' as const;
      if (this.match('and')) return 'And' as const;
      throw new Error('condition-type');
    })();
    this.skipInlineSpaces();
    const field = this.consumeWhile((c) => c !== ' ' && c !== '\n' && c !== '`');
    this.skipInlineSpaces();
    const jqExpr = this.tryParse(() => this.parseBacktickString());
    this.skipInlineSpaces();
    const comparison = this.consumeWhile((c) => c !== ' ' && c !== '\n');
    this.skipInlineSpaces();
    const value = (() => {
      const v1 = this.tryParse(() => this.parseBacktickString());
      if (v1 !== null) return v1;
      const v2 = this.tryParse(() => this.parseQuotedString());
      if (v2 !== null) return v2;
      return this.consumeWhile((c) => c !== '\n');
    })();
    return { conditionType: ct, field, jqExpr: jqExpr ?? undefined, comparison, value };
  }

  private parseMockHead(prefixWord: 'with' | 'and'): Mock {
    this.skipSpaces();
    this.expect(prefixWord);
    this.skipInlineSpaces();
    this.expect('mock');
    this.skipInlineSpaces();
    const target = this.consumeWhile((c) => c !== ' ' && c !== '\n');
    this.skipInlineSpaces();
    this.expect('returning');
    this.skipInlineSpaces();
    const returnValue = this.parseBacktickString();
    this.skipSpaces();
    return { target, returnValue };
  }

  private parseMock(): Mock {
    return this.parseMockHead('with');
  }
  private parseAndMock(): Mock {
    return this.parseMockHead('and');
  }

  private parseIt(): It {
    this.skipSpaces();
    this.expect('it');
    this.skipInlineSpaces();
    this.expect('"');
    const name = this.consumeWhile((c) => c !== '"');
    this.expect('"');
    this.skipSpaces();

    const mocks: Mock[] = [];
    while (true) {
      const m = this.tryParse(() => this.parseMock());
      if (!m) break;
      mocks.push(m);
    }

    this.expect('when');
    this.skipInlineSpaces();
    const when = this.parseWhen();
    this.skipSpaces();

    const input = this.tryParse(() => {
      this.expect('with');
      this.skipInlineSpaces();
      this.expect('input');
      this.skipInlineSpaces();
      const v = this.parseBacktickString();
      this.skipSpaces();
      return v;
    }) ?? undefined;

    const extraMocks: Mock[] = [];
    while (true) {
      const m = this.tryParse(() => this.parseAndMock());
      if (!m) break;
      extraMocks.push(m);
      this.skipSpaces();
    }

    const conditions: Condition[] = [];
    while (true) {
      const c = this.tryParse(() => this.parseCondition());
      if (!c) break;
      conditions.push(c);
    }

    return { name, mocks: [...mocks, ...extraMocks], when, input, conditions };
  }

  private parseDescribe(): Describe {
    this.skipSpaces();
    this.expect('describe');
    this.skipInlineSpaces();
    this.expect('"');
    const name = this.consumeWhile((c) => c !== '"');
    this.expect('"');
    const inlineComment = this.parseInlineComment();
    this.skipSpaces();

    const mocks: Mock[] = [];
    while (true) {
      const m = this.tryParse(() => this.parseMock());
      if (!m) break;
      mocks.push(m);
      this.skipSpaces();
    }

    const tests: It[] = [];
    while (true) {
      const it = this.tryParse(() => this.parseIt());
      if (!it) break;
      tests.push(it);
    }

    return { name, mocks, tests, inlineComment: inlineComment || undefined };
  }
}

export function parseProgram(text: string): Program {
  const parser = new Parser(text);
  return parser.parseProgram();
}

export function parseProgramWithDiagnostics(text: string): { program: Program; diagnostics: ParseDiagnostic[] } {
  const parser = new Parser(text);
  const program = parser.parseProgram();
  return { program, diagnostics: parser.getDiagnostics() };
}

export function getPipelineRanges(text: string): Map<string, { start: number; end: number }> {
  const parser = new Parser(text);
  parser.parseProgram();
  return parser.getPipelineRanges();
}

export function getVariableRanges(text: string): Map<string, { start: number; end: number }> {
  const parser = new Parser(text);
  parser.parseProgram();
  return parser.getVariableRanges();
}

class ParseFailure extends Error {
  constructor(message: string, public at: number) {
    super(message);
  }
}

export function printRoute(route: Route): string {
  const lines: string[] = [];
  const routeLine = `${route.method} ${route.path}`;
  if (route.inlineComment) {
    lines.push(`${routeLine} ${printComment(route.inlineComment)}`);
  } else {
    lines.push(routeLine);
  }
  const pipelineLines = formatPipelineRef(route.pipeline);
  pipelineLines.forEach(line => lines.push(line));
  return lines.join('\n');
}

export function printConfig(config: Config): string {
  const lines: string[] = [];
  const configLine = `config ${config.name} {`;
  if (config.inlineComment) {
    lines.push(`${configLine} ${printComment(config.inlineComment)}`);
  } else {
    lines.push(configLine);
  }
  config.properties.forEach(prop => {
    const value = formatConfigValue(prop.value);
    lines.push(`  ${prop.key}: ${value}`);
  });
  lines.push('}');
  return lines.join('\n');
}

export function printPipeline(pipeline: NamedPipeline): string {
  const lines: string[] = [];
  const pipelineLine = `pipeline ${pipeline.name} =`;
  if (pipeline.inlineComment) {
    lines.push(`${pipelineLine} ${printComment(pipeline.inlineComment)}`);
  } else {
    lines.push(pipelineLine);
  }
  pipeline.pipeline.steps.forEach(step => {
    lines.push(formatPipelineStep(step));
  });
  return lines.join('\n');
}

export function printVariable(variable: Variable): string {
  const variableLine = `${variable.varType} ${variable.name} = \`${variable.value}\``;
  if (variable.inlineComment) {
    return `${variableLine} ${printComment(variable.inlineComment)}`;
  }
  return variableLine;
}

export function printMock(mock: Mock, indent: string = '  '): string {
  return `${indent}with mock ${mock.target} returning \`${mock.returnValue}\``;
}

export function printCondition(condition: Condition, indent: string = '    '): string {
  const condType = condition.conditionType.toLowerCase();
  const jqPart = condition.jqExpr ? ` \`${condition.jqExpr}\`` : '';
  const value = condition.value.startsWith('`') ? condition.value : 
               (condition.value.includes('\n') || condition.value.includes('{') || condition.value.includes('[')) ? `\`${condition.value}\`` :
               condition.value;
  return `${indent}${condType} ${condition.field}${jqPart} ${condition.comparison} ${value}`;
}

export function printTest(test: It): string {
  const lines: string[] = [];
  lines.push(`  it "${test.name}"`);
  test.mocks.forEach(mock => {
    lines.push(printMock(mock, '    '));
  });
  lines.push(`    when ${formatWhen(test.when)}`);
  if (test.input) {
    lines.push(`    with input \`${test.input}\``);
  }
  test.conditions.forEach(condition => {
    lines.push(printCondition(condition));
  });
  return lines.join('\n');
}

export function printComment(comment: Comment): string {
  // For # comments, if text starts with # (like "# Blog article"), don't add space
  // For // comments, if text is empty or starts with space, don't add extra space
  if (comment.style === '#' && comment.text.startsWith('#')) {
    return `${comment.style}${comment.text}`;
  }
  if (comment.text === '' || comment.text.startsWith(' ')) {
    return `${comment.style}${comment.text}`;
  }
  return `${comment.style} ${comment.text}`;
}

export function printDescribe(describe: Describe): string {
  const lines: string[] = [];
  const describeLine = `describe "${describe.name}"`;
  if (describe.inlineComment) {
    lines.push(`${describeLine} ${printComment(describe.inlineComment)}`);
  } else {
    lines.push(describeLine);
  }
  describe.mocks.forEach(mock => {
    lines.push(printMock(mock));
  });
  if (describe.mocks.length > 0) {
    lines.push('');
  }
  
  describe.tests.forEach(test => {
    lines.push(printTest(test));
    lines.push('');
  });
  
  return lines.join('\n').replace(/\n\n$/, '\n');
}

export function prettyPrint(program: Program): string {
  const lines: string[] = [];

  // Collect all items with their line numbers and types
  const allItems: { type: string; item: any; lineNumber: number }[] = [];
  
  program.configs.forEach(config => {
    allItems.push({ type: 'config', item: config, lineNumber: config.lineNumber || 0 });
  });
  
  program.routes.forEach(route => {
    allItems.push({ type: 'route', item: route, lineNumber: route.lineNumber || 0 });
  });
  
  program.pipelines.forEach(pipeline => {
    allItems.push({ type: 'pipeline', item: pipeline, lineNumber: pipeline.lineNumber || 0 });
  });
  
  program.variables.forEach(variable => {
    allItems.push({ type: 'variable', item: variable, lineNumber: variable.lineNumber || 0 });
  });
  
  program.describes.forEach(describe => {
    allItems.push({ type: 'describe', item: describe, lineNumber: describe.lineNumber || 0 });
  });
  
  program.comments.forEach(comment => {
    allItems.push({ type: 'comment', item: comment, lineNumber: comment.lineNumber || 0 });
  });

  // Sort by line number to maintain original order
  allItems.sort((a, b) => a.lineNumber - b.lineNumber);

  // Group configs and add header if needed
  let hasConfigs = false;
  
  allItems.forEach((entry, index) => {
    if (entry.type === 'config' && !hasConfigs) {
      lines.push('## Config');
      hasConfigs = true;
    }
    
    switch (entry.type) {
      case 'comment':
        lines.push(printComment(entry.item));
        break;
      case 'config':
        lines.push(printConfig(entry.item));
        lines.push('');
        break;
      case 'route':
        lines.push(printRoute(entry.item));
        lines.push('');
        break;
      case 'pipeline':
        lines.push(printPipeline(entry.item));
        lines.push('');
        break;
      case 'variable':
        lines.push(printVariable(entry.item));
        // Only add empty line if there are more items after this variable
        const nextNonVariable = allItems.slice(index + 1).find(item => item.type !== 'variable');
        if (nextNonVariable) lines.push('');
        break;
      case 'describe':
        lines.push(printDescribe(entry.item));
        lines.push('');
        break;
    }
  });

  return lines.join('\n').trim() + '\n';
}

export function formatConfigValue(value: ConfigValue): string {
  switch (value.kind) {
    case 'String':
      return `"${value.value}"`;
    case 'EnvVar':
      return value.default ? `$${value.var} || "${value.default}"` : `$${value.var}`;
    case 'Boolean':
      return value.value.toString();
    case 'Number':
      return value.value.toString();
  }
}

export function formatPipelineStep(step: PipelineStep, indent: string = '  '): string {
  if (step.kind === 'Regular') {
    return `${indent}|> ${step.name}: ${formatStepConfig(step.config, step.configType)}`;
  } else {
    const lines: string[] = [`${indent}|> result`];
    step.branches.forEach(branch => {
      const branchName = branch.branchType.kind === 'Ok' ? 'ok' :
                        branch.branchType.kind === 'Default' ? 'default' :
                        branch.branchType.name;
      lines.push(`${indent}  ${branchName}(${branch.statusCode}):`);
      branch.pipeline.steps.forEach(branchStep => {
        lines.push(formatPipelineStep(branchStep, indent + '    '));
      });
    });
    return lines.join('\n');
  }
}

export function formatStepConfig(config: string, configType: ConfigType): string {
  switch (configType) {
    case 'backtick':
      return `\`${config}\``;
    case 'quoted':
      return `"${config}"`;
    case 'identifier':
      return config;
  }
}

export function formatPipelineRef(ref: PipelineRef): string[] {
  if (ref.kind === 'Named') {
    return [`  |> pipeline: ${ref.name}`];
  } else {
    const lines: string[] = [];
    ref.pipeline.steps.forEach(step => {
      lines.push(formatPipelineStep(step));
    });
    return lines;
  }
}

export function formatWhen(when: When): string {
  switch (when.kind) {
    case 'CallingRoute':
      return `calling ${when.method} ${when.path}`;
    case 'ExecutingPipeline':
      return `executing pipeline ${when.name}`;
    case 'ExecutingVariable':
      return `executing variable ${when.varType} ${when.name}`;
  }
}
