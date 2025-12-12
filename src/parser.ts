export interface Program {
  configs: Config[];
  pipelines: NamedPipeline[];
  variables: Variable[];
  routes: Route[];
  describes: Describe[];
  comments: Comment[];
  graphqlSchema?: GraphQLSchema;
  queries: QueryResolver[];
  mutations: MutationResolver[];
  resolvers: TypeResolver[];
  featureFlags?: Pipeline;
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
  start: number;
  end: number;
}

export interface ConfigProperty {
  key: string;
  value: ConfigValue;
  start: number;
  end: number;
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
  start: number;
  end: number;
}

export interface Variable {
  varType: string;
  name: string;
  value: string;
  lineNumber?: number;
  inlineComment?: Comment;
  start: number;
  end: number;
}

export interface GraphQLSchema {
  sdl: string;
  lineNumber?: number;
  inlineComment?: Comment;
  start: number;
  end: number;
}

export interface QueryResolver {
  name: string;
  pipeline: Pipeline;
  lineNumber?: number;
  inlineComment?: Comment;
  start: number;
  end: number;
}

export interface MutationResolver {
  name: string;
  pipeline: Pipeline;
  lineNumber?: number;
  inlineComment?: Comment;
  start: number;
  end: number;
}

export interface TypeResolver {
  typeName: string;
  fieldName: string;
  pipeline: Pipeline;
  lineNumber?: number;
  inlineComment?: Comment;
  start: number;
  end: number;
}

export interface Route {
  method: string;
  path: string;
  pipeline: PipelineRef;
  lineNumber?: number;
  inlineComment?: Comment;
  start: number;
  end: number;
}

export type PipelineRef =
  | { kind: 'Inline'; pipeline: Pipeline; start: number; end: number }
  | { kind: 'Named'; name: string; start: number; end: number };

export interface Pipeline {
  steps: PipelineStep[];
  start: number;
  end: number;
}

export type ConfigType = 'backtick' | 'quoted' | 'identifier';

export type LetValueFormat = 'quoted' | 'backtick' | 'bare';

export interface LetVariable {
  name: string;
  value: string;
  format: LetValueFormat;
  start: number; // Start of the name identifier (for Definition)
  end: number;   // End of the name identifier
  fullStart: number; // Start of 'let' (optional, useful for folding)
  fullEnd: number;   // End of the value
}

export interface Tag {
  name: string;      // e.g. "prod", "async", "flag"
  negated: boolean;  // true for @!prod
  args: string[];    // ["new-ui", "beta"] for @flag(new-ui,beta)
  start: number;
  end: number;
}

/** A boolean expression of tags for dispatch routing */
export type TagExpr =
  | { kind: 'Tag'; tag: Tag }
  | { kind: 'And'; left: TagExpr; right: TagExpr }
  | { kind: 'Or'; left: TagExpr; right: TagExpr };

export type PipelineStep =
  | { kind: 'Regular'; name: string; args: string[]; config: string; configType: ConfigType; configStart?: number; configEnd?: number; condition?: TagExpr; parsedJoinTargets?: string[]; start: number; end: number }
  | { kind: 'Result'; branches: ResultBranch[]; start: number; end: number }
  | { kind: 'If'; condition: Pipeline; thenBranch: Pipeline; elseBranch?: Pipeline; start: number; end: number }
  | { kind: 'Dispatch'; branches: DispatchBranch[]; default?: Pipeline; start: number; end: number }
  | { kind: 'Foreach'; selector: string; pipeline: Pipeline; start: number; end: number };

export interface DispatchBranch {
  condition: TagExpr;
  pipeline: Pipeline;
  start: number;
  end: number;
}

export interface ResultBranch {
  branchType: ResultBranchType;
  statusCode: number;
  pipeline: Pipeline;
  start: number;
  end: number;
}

export type ResultBranchType =
  | { kind: 'Ok' }
  | { kind: 'Custom'; name: string }
  | { kind: 'Default' };

export interface Describe {
  name: string;
  variables: LetVariable[];
  mocks: Mock[];
  tests: It[];
  lineNumber?: number;
  inlineComment?: Comment;
  start: number; // Start offset of the describe block
  end: number;   // End offset of the describe block
}

export interface Mock {
  target: string;
  returnValue: string;
  start: number;
  end: number;
}

export interface It {
  name: string;
  mocks: Mock[];
  when: When;
  variables?: LetVariable[];
  input?: string;
  body?: string;
  headers?: string;
  cookies?: string;
  conditions: Condition[];
  start: number; // Start offset of the test block
  end: number;   // End offset of the test block
}

export type When =
  | { kind: 'CallingRoute'; method: string; path: string; start: number; end: number }
  | { kind: 'ExecutingPipeline'; name: string; start: number; end: number }
  | { kind: 'ExecutingVariable'; varType: string; name: string; start: number; end: number };

export type DomAssertType =
  | { kind: 'Exists' }
  | { kind: 'Text' }
  | { kind: 'Count' }
  | { kind: 'Attribute'; name: string };

export interface Condition {
  conditionType: 'Then' | 'And';
  field: string;
  headerName?: string;
  jqExpr?: string;
  comparison: string;
  value: string;
  isCallAssertion?: boolean;
  callTarget?: string;
  selector?: string;
  domAssert?: DomAssertType;
  start: number;
  end: number;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';
export interface ParseDiagnostic {
  message: string;
  start: number;
  end: number;
  severity: DiagnosticSeverity;
}

export interface TestLetVariable {
  name: string;
  describeName: string;
  testName?: string;
  start: number;
  end: number;
}

class Parser {
  private readonly text: string;
  private readonly len: number;
  private pos: number = 0;
  private diagnostics: ParseDiagnostic[] = [];
  private readonly pipelineRanges: Map<string, { start: number; end: number }> = new Map();
  private readonly variableRanges: Map<string, { start: number; end: number }> = new Map();
  private readonly testLetVariables: TestLetVariable[] = [];
  private currentDescribeName: string | null = null;
  private currentTestName: string | null = null;

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

  getTestLetVariables(): TestLetVariable[] {
    return [...this.testLetVariables];
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
    let graphqlSchema: GraphQLSchema | undefined;
    const queries: QueryResolver[] = [];
    const mutations: MutationResolver[] = [];
    const resolvers: TypeResolver[] = [];
    let featureFlags: Pipeline | undefined;

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

    return { configs, pipelines, variables, routes, describes, comments, graphqlSchema, queries, mutations, resolvers, featureFlags };
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
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
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

  private parseTag(): Tag {
    // Current position should be at '@'
    const start = this.pos;
    this.expect('@');

    // Check for negation
    const negated = this.cur() === '!';
    if (negated) this.pos++;

    // Parse tag name
    const name = this.parseIdentifier();

    // Parse optional arguments
    let args: string[] = [];
    if (this.cur() === '(') {
      args = this.parseTagArgs();
    }

    const end = this.pos;
    return { name, negated, args, start, end };
  }

  private parseTagArgs(): string[] {
    this.expect('(');
    const args: string[] = [];

    // Empty parentheses not allowed
    this.skipInlineSpaces();
    if (this.cur() === ')') {
      throw new ParseFailure('empty tag arguments not allowed', this.pos);
    }

    // Parse first arg - can be identifier or backtick string
    args.push(this.parseTagArgument());
    this.skipInlineSpaces();

    // Parse remaining args (comma-separated)
    while (this.cur() === ',') {
      this.pos++; // consume comma
      this.skipInlineSpaces();

      // No trailing comma allowed
      if (this.cur() === ')') {
        throw new ParseFailure('trailing comma in tag arguments', this.pos);
      }

      args.push(this.parseTagArgument());
      this.skipInlineSpaces();
    }

    this.expect(')');
    return args;
  }

  private parseTagArgument(): string {
    // Try backtick string first (for @guard JQ expressions)
    const bt = this.tryParse(() => this.parseBacktickString());
    if (bt !== null) return bt;

    // Otherwise parse as identifier
    return this.parseIdentifier();
  }

  private parseTags(): Tag[] {
    const tags: Tag[] = [];

    // Keep parsing tags until we hit EOL or EOF
    while (!this.eof()) {
      this.skipInlineSpaces();

      // Check for EOL or EOF
      const ch = this.cur();
      if (ch === '\n' || ch === '\r' || ch === '#' || this.text.startsWith('//', this.pos)) {
        break;
      }

      // If we see '@', parse a tag
      if (ch === '@') {
        tags.push(this.parseTag());
      } else {
        // Unexpected character after step config
        break;
      }
    }

    return tags;
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
    const start = this.pos;
    const key = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect(':');
    this.skipInlineSpaces();
    const value = this.parseConfigValue();
    const end = this.pos;
    return { key, value, start, end };
  }

  private parseConfig(): Config {
    const start = this.pos;
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
    const end = this.pos;
    return { name, properties, inlineComment: inlineComment || undefined, start, end };
  }

  private parsePipelineStep(): PipelineStep {
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

  private parseForeachStep(): PipelineStep {
    this.skipWhitespaceOnly();
    const start = this.pos;
    this.expect('|>');
    this.skipInlineSpaces();
    this.expect('foreach');

    // Must have at least one space after 'foreach'
    if (this.cur() !== ' ' && this.cur() !== '\t') {
      throw new ParseFailure('space after foreach', this.pos);
    }
    this.skipInlineSpaces();

    // Parse selector: consume until newline or comment
    const selector = this.consumeWhile((c) => c !== '\n' && c !== '#').trim();
    if (selector.length === 0) {
      throw new ParseFailure('foreach selector', this.pos);
    }
    this.skipSpaces();

    // Parse inner pipeline (stops when it sees 'end')
    const pipeline = this.parseIfPipeline('end');
    this.skipSpaces();

    // Expect 'end' keyword
    this.expect('end');

    const end = this.pos;
    return { kind: 'Foreach', selector, pipeline, start, end };
  }

  private parseRegularStep(): PipelineStep {
    this.skipWhitespaceOnly();
    const start = this.pos;
    this.expect('|>');
    this.skipInlineSpaces();
    const name = this.parseIdentifier();

    // Parse optional inline arguments: middleware(arg1, arg2) or middleware[arg1, arg2]
    const args = this.parseInlineArgs();

    this.skipInlineSpaces();

    let config = '';
    let configType: ConfigType = 'quoted'; // Default config type for empty/missing config
    let configStart: number | undefined = undefined;
    let configEnd: number | undefined = undefined;

    // Check for optional config starting with ':'
    if (this.cur() === ':') {
      this.pos++; // consume ':'
      this.skipInlineSpaces();
      configStart = this.pos; // Capture position before parsing config
      const res = this.parseStepConfig();
      config = res.config;
      configType = res.configType;
      configEnd = this.pos; // Capture position after parsing config
    }

    // Parse optional condition (tag expression)
    const condition = this.parseStepCondition();

    // Pre-parse join targets for join middleware (compile-time optimization)
    const parsedJoinTargets = name === 'join' ? this.parseJoinTaskNames(config) : undefined;

    this.skipWhitespaceOnly();
    const end = this.pos;
    return { kind: 'Regular', name, args, config, configType, configStart, configEnd, condition, parsedJoinTargets, start, end };
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
  private parseStepCondition(): TagExpr | undefined {
    this.skipInlineSpaces();
    
    // Check if there's a tag expression starting (@ for tags, ( for grouped expressions)
    const ch = this.cur();
    if (ch !== '@' && ch !== '(') {
      return undefined;
    }
    
    // Parse the first tag expression (which may include and/or)
    let expr = this.parseTagExpr();
    
    // Check for additional space-separated tags (implicit AND for backwards compatibility)
    // This handles: @dev @flag(x) which was valid in the old Vec<Tag> format
    while (true) {
      this.skipInlineSpaces();
      
      // Check for EOL or comment
      const ch = this.cur();
      if (ch === '\n' || ch === '\r' || ch === '#' || this.text.startsWith('//', this.pos)) {
        break;
      }
      
      // Check if there's another tag starting (without and/or keyword)
      if (ch !== '@') {
        break;
      }
      
      // Parse the next tag (just a single tag, not a full expression)
      const nextTag = this.parseTag();
      expr = { kind: 'And', left: expr, right: { kind: 'Tag', tag: nextTag } };
    }
    
    return expr;
  }

  /**
   * Pre-parse join config into task names at parse time.
   * This avoids repeated parsing in the hot path during execution.
   */
  private parseJoinTaskNames(config: string): string[] | undefined {
    const trimmed = config.trim();

    // Try parsing as JSON array first
    if (trimmed.startsWith('[')) {
      try {
        const names = JSON.parse(trimmed);
        if (Array.isArray(names) && names.every(n => typeof n === 'string')) {
          return names;
        }
      } catch {
        return undefined; // Invalid JSON, will error at runtime
      }
    }

    // Otherwise parse as comma-separated list
    const names = trimmed
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (names.length === 0) {
      return undefined; // Will error at runtime
    }

    return names;
  }

  /**
   * Split argument content by commas while respecting nesting depth and strings
   * Example: `"url", {a:1, b:2}` -> [`"url"`, `{a:1, b:2}`]
   */
  private splitBalancedArgs(content: string): string[] {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let escapeNext = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];

      if (escapeNext) {
        current += ch;
        escapeNext = false;
        continue;
      }

      if (ch === '\\' && inString) {
        current += ch;
        escapeNext = true;
        continue;
      }

      if ((ch === '"' || ch === '`') && !inString) {
        inString = true;
        stringChar = ch;
        current += ch;
        continue;
      }

      if (ch === stringChar && inString) {
        inString = false;
        stringChar = '';
        current += ch;
        continue;
      }

      if (inString) {
        current += ch;
        continue;
      }

      // Track nesting depth for brackets, braces, parentheses
      if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
        current += ch;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth--;
        current += ch;
      } else if (ch === ',' && depth === 0) {
        // Split on comma at depth 0
        args.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }

    // Add the last argument
    if (current.trim().length > 0) {
      args.push(current.trim());
    }

    return args;
  }

  /**
   * Parse inline arguments: middleware(arg1, arg2) or middleware[arg1, arg2]
   * Returns the array of argument strings and advances position past the closing bracket
   */
  private parseInlineArgs(): string[] {
    const trimmedStart = this.pos;
    this.skipInlineSpaces();

    // Check if we have '(' or '['
    const ch = this.cur();
    if (ch !== '(' && ch !== '[') {
      this.pos = trimmedStart;
      return [];
    }

    const openChar = ch;
    const closeChar = openChar === '(' ? ')' : ']';
    this.pos++; // consume opening bracket

    // Find the balanced closing bracket
    let depth = 1;
    let inString = false;
    let stringChar = '';
    let escapeNext = false;
    const contentStart = this.pos;

    while (!this.eof() && depth > 0) {
      const c = this.cur();

      if (escapeNext) {
        this.pos++;
        escapeNext = false;
        continue;
      }

      if (c === '\\' && inString) {
        this.pos++;
        escapeNext = true;
        continue;
      }

      if ((c === '"' || c === '`') && !inString) {
        inString = true;
        stringChar = c;
        this.pos++;
        continue;
      }

      if (c === stringChar && inString) {
        inString = false;
        stringChar = '';
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

    // Extract the content between the brackets
    const argsContent = this.text.slice(contentStart, this.pos);
    this.pos++; // consume closing bracket

    // Split by commas while respecting nesting
    if (argsContent.trim().length === 0) {
      return [];
    }

    return this.splitBalancedArgs(argsContent);
  }

  private parseResultStep(): PipelineStep {
    this.skipWhitespaceOnly();
    const start = this.pos;
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
    const end = this.pos;
    return { kind: 'Result', branches, start, end };
  }

  private parseResultBranch(): ResultBranch {
    this.skipSpaces();
    const start = this.pos;
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
    const end = this.pos;
    return { branchType, statusCode, pipeline, start, end };
  }

  private parseIfStep(): PipelineStep {
    this.skipWhitespaceOnly();
    const start = this.pos;
    this.expect('|>');
    this.skipInlineSpaces();
    this.expect('if');
    this.skipSpaces();

    // Parse condition pipeline (stops when it sees 'then:')
    const condition = this.parseIfPipeline('then:');

    this.skipSpaces();
    this.expect('then:');
    this.skipSpaces();

    // Parse then branch (stops when it sees 'else:' or 'end' or non-pipeline content)
    const thenBranch = this.parseIfPipeline('else:', 'end');

    this.skipSpaces();

    // Check for optional else branch
    const elseBranch = this.tryParse(() => {
      this.expect('else:');
      this.skipSpaces();
      return this.parseIfPipeline('end');
    });

    this.skipSpaces();

    // Check for optional 'end' keyword
    this.tryParse(() => {
      this.expect('end');
      return true;
    });

    const end = this.pos;
    return { kind: 'If', condition, thenBranch, elseBranch: elseBranch || undefined, start, end };
  }

  private parseDispatchStep(): PipelineStep {
    this.skipWhitespaceOnly();
    const start = this.pos;
    this.expect('|>');
    this.skipInlineSpaces();
    this.expect('dispatch');
    this.skipSpaces();

    // Parse case branches
    const branches: DispatchBranch[] = [];
    while (true) {
      const branch = this.tryParse(() => this.parseDispatchBranch());
      if (!branch) break;
      branches.push(branch);
      this.skipSpaces();
    }

    // Parse optional default branch
    const defaultBranch = this.tryParse(() => {
      this.expect('default:');
      this.skipSpaces();
      return this.parseIfPipeline('end');
    });

    this.skipSpaces();

    // Check for optional 'end' keyword
    this.tryParse(() => {
      this.expect('end');
      return true;
    });

    const end = this.pos;
    return { kind: 'Dispatch', branches, default: defaultBranch || undefined, start, end };
  }

  private parseDispatchBranch(): DispatchBranch {
    this.skipSpaces();
    const start = this.pos;
    this.expect('case');
    this.skipInlineSpaces();
    const condition = this.parseTagExpr();
    this.skipInlineSpaces();
    this.expect(':');
    this.skipSpaces();
    // Parse pipeline (stops when it sees 'case', 'default', 'end', or non-pipeline content)
    const pipeline = this.parseIfPipeline('case', 'default:', 'end');
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
  private parseTagExpr(): TagExpr {
    return this.parseOrExpr();
  }

  private parseOrExpr(): TagExpr {
    let left = this.parseAndExpr();
    
    while (true) {
      const saved = this.pos;
      this.skipInlineSpaces();
      if (this.text.startsWith('or', this.pos) && !this.isIdentCont(this.text[this.pos + 2] || '')) {
        this.pos += 2;
        this.skipInlineSpaces();
        const right = this.parseAndExpr();
        left = { kind: 'Or', left, right };
      } else {
        this.pos = saved;
        break;
      }
    }
    
    return left;
  }

  private parseAndExpr(): TagExpr {
    let left = this.parseTagPrimary();
    
    while (true) {
      const saved = this.pos;
      this.skipInlineSpaces();
      if (this.text.startsWith('and', this.pos) && !this.isIdentCont(this.text[this.pos + 3] || '')) {
        this.pos += 3;
        this.skipInlineSpaces();
        const right = this.parseTagPrimary();
        left = { kind: 'And', left, right };
      } else {
        this.pos = saved;
        break;
      }
    }
    
    return left;
  }

  private parseTagPrimary(): TagExpr {
    // Try grouped expression first: ( expr )
    if (this.cur() === '(') {
      this.pos++; // consume '('
      this.skipInlineSpaces();
      const expr = this.parseTagExpr();
      this.skipInlineSpaces();
      this.expect(')');
      return expr;
    }
    
    // Single tag
    const tag = this.parseTag();
    return { kind: 'Tag', tag };
  }

  private parseIfPipeline(...stopKeywords: string[]): Pipeline {
    const start = this.pos;
    const steps: PipelineStep[] = [];
    while (true) {
      const save = this.pos;
      this.skipSpaces(); // Skip whitespace AND comments

      // Check if we've hit any of the stop keywords
      for (const keyword of stopKeywords) {
        if (this.text.startsWith(keyword, this.pos)) {
          this.pos = save;
          const end = this.pos;
          return { steps, start, end };
        }
      }

      // Check if this is a pipeline step
      if (!this.text.startsWith('|>', this.pos)) {
        this.pos = save;
        break;
      }

      const step = this.parsePipelineStep();
      steps.push(step);
    }
    const end = this.pos;
    return { steps, start, end };
  }

  private parsePipeline(): Pipeline {
    const start = this.pos;
    const steps: PipelineStep[] = [];
    while (true) {
      const save = this.pos;
      this.skipSpaces(); // Skip whitespace AND comments
      if (!this.text.startsWith('|>', this.pos)) {
        this.pos = save;
        break;
      }
      const step = this.parsePipelineStep();
      steps.push(step);
    }
    const end = this.pos;
    return { steps, start, end };
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
    const pipeline = this.parsePipeline();
    const end = this.pos;
    this.pipelineRanges.set(name, { start, end });
    this.skipWhitespaceOnly();
    return { name, pipeline, inlineComment: inlineComment || undefined, start, end };
  }

  private parsePipelineRef(): PipelineRef {
    const inline = this.tryParse(() => this.parsePipeline());
    if (inline && inline.steps.length > 0) {
      return { kind: 'Inline', pipeline: inline, start: inline.start, end: inline.end };
    }

    const named = this.tryParse(() => {
      this.skipWhitespaceOnly();
      const start = this.pos;
      this.expect('|>');
      this.skipInlineSpaces();
      this.expect('pipeline:');
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      const end = this.pos;
      return { kind: 'Named', name, start, end } as PipelineRef;
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
    return { varType, name, value, inlineComment: inlineComment || undefined, start, end };
  }

  private parseGraphQLSchema(): GraphQLSchema {
    const start = this.pos;
    this.expect('graphqlSchema');
    this.skipInlineSpaces();
    this.expect('=');
    const inlineComment = this.parseInlineComment();
    this.skipInlineSpaces();
    const sdl = this.parseBacktickString();
    const end = this.pos;
    this.skipWhitespaceOnly();
    return { sdl, inlineComment: inlineComment || undefined, start, end };
  }

  private parseQueryResolver(): QueryResolver {
    const start = this.pos;
    this.expect('query');
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect('=');
    const inlineComment = this.parseInlineComment();
    this.skipWhitespaceOnly();
    const pipeline = this.parsePipeline();
    const end = this.pos;
    this.skipWhitespaceOnly();
    return { name, pipeline, inlineComment: inlineComment || undefined, start, end };
  }

  private parseMutationResolver(): MutationResolver {
    const start = this.pos;
    this.expect('mutation');
    this.skipInlineSpaces();
    const name = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect('=');
    const inlineComment = this.parseInlineComment();
    this.skipWhitespaceOnly();
    const pipeline = this.parsePipeline();
    const end = this.pos;
    this.skipWhitespaceOnly();
    return { name, pipeline, inlineComment: inlineComment || undefined, start, end };
  }

  private parseTypeResolver(): TypeResolver {
    const start = this.pos;
    this.expect('resolver');
    this.skipInlineSpaces();
    const typeName = this.parseIdentifier();
    this.expect('.');
    const fieldName = this.parseIdentifier();
    this.skipInlineSpaces();
    this.expect('=');
    const inlineComment = this.parseInlineComment();
    this.skipWhitespaceOnly();
    const pipeline = this.parsePipeline();
    const end = this.pos;
    this.skipWhitespaceOnly();
    return { typeName, fieldName, pipeline, inlineComment: inlineComment || undefined, start, end };
  }

  private parseFeatureFlags(): Pipeline {
    this.expect('featureFlags');
    this.skipInlineSpaces();
    this.expect('=');
    this.skipWhitespaceOnly();
    const pipeline = this.parsePipeline();
    this.skipWhitespaceOnly();
    return pipeline;
  }

  private parseRoute(): Route {
    const start = this.pos;
    const method = this.parseMethod();
    this.skipInlineSpaces();
    const path = this.consumeWhile((c) => c !== ' ' && c !== '\n' && c !== '#');
    const inlineComment = this.parseInlineComment();
    this.skipSpaces();
    const pipeline = this.parsePipelineRef();
    const end = this.pos;
    this.skipWhitespaceOnly();
    return { method, path, pipeline, inlineComment: inlineComment || undefined, start, end };
  }

  private parseWhen(): When {
    const calling = this.tryParse(() => {
      const start = this.pos;
      this.expect('calling');
      this.skipInlineSpaces();
      const method = this.parseMethod();
      this.skipInlineSpaces();
      const path = this.consumeWhile((c) => c !== '\n');
      const end = this.pos;
      return { kind: 'CallingRoute', method, path, start, end } as When;
    });
    if (calling) return calling;

    const executingPipeline = this.tryParse(() => {
      const start = this.pos;
      this.expect('executing');
      this.skipInlineSpaces();
      this.expect('pipeline');
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      const end = this.pos;
      return { kind: 'ExecutingPipeline', name, start, end } as When;
    });
    if (executingPipeline) return executingPipeline;

    const executingVariable = this.tryParse(() => {
      const start = this.pos;
      this.expect('executing');
      this.skipInlineSpaces();
      this.expect('variable');
      this.skipInlineSpaces();
      const varType = this.parseIdentifier();
      this.skipInlineSpaces();
      const name = this.parseIdentifier();
      const end = this.pos;
      return { kind: 'ExecutingVariable', varType, name, start, end } as When;
    });
    if (executingVariable) return executingVariable;

    throw new ParseFailure('when', this.pos);
  }

  private parseCondition(): Condition {
    this.skipSpaces();
    const start = this.pos;
    const ct = (() => {
      if (this.match('then')) return 'Then' as const;
      if (this.match('and')) return 'And' as const;
      throw new Error('condition-type');
    })();
    this.skipInlineSpaces();
    const field = this.consumeWhile((c) => c !== ' ' && c !== '\n' && c !== '`');
    this.skipInlineSpaces();

    // Check if this is a call assertion: "then call query users with ..."
    if (field === 'call') {
      // Parse call target: "query users" or "mutation createTodo"
      const callType = this.consumeWhile((c) => c !== ' '); // "query" or "mutation"
      this.skipInlineSpaces();
      const callName = this.consumeWhile((c) => c !== ' ' && c !== '\n');
      const callTarget = `${callType}.${callName}`;
      this.skipInlineSpaces();

      // Parse comparison (typically "with" or "with arguments")
      let comparison: string;
      if (this.text.startsWith('with arguments', this.pos)) {
        this.pos += 14; // length of "with arguments"
        comparison = 'with arguments';
      } else if (this.text.startsWith('with', this.pos)) {
        this.pos += 4; // length of "with"
        comparison = 'with';
      } else {
        throw new Error('expected "with" or "with arguments"');
      }
      this.skipInlineSpaces();

      // Parse value (expected arguments)
      const value = (() => {
        const v1 = this.tryParse(() => this.parseBacktickString());
        if (v1 !== null) return v1;
        const v2 = this.tryParse(() => this.parseQuotedString());
        if (v2 !== null) return v2;
        return this.consumeWhile((c) => c !== '\n');
      })();

      const end = this.pos;
      return {
        conditionType: ct,
        field: 'call',
        comparison,
        value,
        isCallAssertion: true,
        callTarget,
        start,
        end,
      };
    }

    // Check if field is "selector" - if so, parse DOM selector assertion
    if (field === 'selector') {
      // Parse quoted selector string
      const selectorStr = (() => {
        const bt = this.tryParse(() => this.parseBacktickString());
        if (bt !== null) return bt;
        const qt = this.tryParse(() => this.parseQuotedString());
        if (qt !== null) return qt;
        throw new Error('selector requires quoted string');
      })();

      this.skipInlineSpaces();

      // Parse operation
      const operation = this.consumeWhile((c) => c !== ' ' && c !== '\n');
      this.skipInlineSpaces();

      let domAssert: DomAssertType;
      let comparison: string;
      let value: string;

      if (operation === 'exists') {
        domAssert = { kind: 'Exists' };
        comparison = 'exists';
        value = 'true';
      } else if (operation === 'does') {
        // Parse "does not exist"
        this.expect('not');
        this.skipInlineSpaces();
        this.expect('exist');
        domAssert = { kind: 'Exists' };
        comparison = 'does_not_exist';
        value = 'false';
      } else if (operation === 'text') {
        domAssert = { kind: 'Text' };
        this.skipInlineSpaces();
        comparison = this.consumeWhile((c) => c !== ' ' && c !== '\n');
        this.skipInlineSpaces();
        value = (() => {
          const v1 = this.tryParse(() => this.parseBacktickString());
          if (v1 !== null) return v1;
          const v2 = this.tryParse(() => this.parseQuotedString());
          if (v2 !== null) return v2;
          return this.consumeWhile((c) => c !== '\n');
        })();
      } else if (operation === 'count') {
        domAssert = { kind: 'Count' };
        // Parse comparison (equals | is greater than | is less than)
        let compParts = '';
        while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
          const c = this.text[this.pos];
          if (/\d/.test(c)) break; // Stop at first digit
          compParts += c;
          this.pos++;
        }
        comparison = compParts.trim();
        value = this.consumeWhile((c) => c !== '\n').trim();
      } else if (operation === 'attribute') {
        // Parse attribute name
        const attrName = (() => {
          const bt = this.tryParse(() => this.parseBacktickString());
          if (bt !== null) return bt;
          const qt = this.tryParse(() => this.parseQuotedString());
          if (qt !== null) return qt;
          throw new Error('attribute requires quoted name');
        })();

        this.skipInlineSpaces();
        comparison = this.consumeWhile((c) => c !== ' ' && c !== '\n');
        this.skipInlineSpaces();
        value = (() => {
          const v1 = this.tryParse(() => this.parseBacktickString());
          if (v1 !== null) return v1;
          const v2 = this.tryParse(() => this.parseQuotedString());
          if (v2 !== null) return v2;
          return this.consumeWhile((c) => c !== '\n');
        })();

        domAssert = { kind: 'Attribute', name: attrName };
      } else {
        throw new Error(`Unknown selector operation: ${operation}`);
      }

      const end = this.pos;
      return {
        conditionType: ct,
        field: 'selector',
        comparison,
        value,
        selector: selectorStr,
        domAssert,
        start,
        end,
      };
    }

    // Check if field is "header" - if so, parse header name
    let headerName: string | undefined;
    if (field === 'header') {
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

    // Optional jq expression (not for header assertions)
    const jqExpr = headerName === undefined ? this.tryParse(() => this.parseBacktickString()) : null;
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
    const end = this.pos;
    return { conditionType: ct, field, headerName: headerName ?? undefined, jqExpr: jqExpr ?? undefined, comparison, value, start, end };
  }

  private parseMockHead(prefixWord: 'with' | 'and'): Mock {
    this.skipSpaces();
    const start = this.pos;
    this.expect(prefixWord);
    this.skipInlineSpaces();
    this.expect('mock');
    this.skipInlineSpaces();

    // Support "query <name>" or "mutation <name>" or single identifier
    let target: string;
    if (this.text.startsWith('query ', this.pos) || this.text.startsWith('mutation ', this.pos)) {
      const type = this.consumeWhile((c) => c !== ' ');
      this.skipInlineSpaces();
      const name = this.consumeWhile((c) => c !== ' ' && c !== '\n');
      target = `${type}.${name}`;
    } else {
      target = this.consumeWhile((c) => c !== ' ' && c !== '\n');
    }

    this.skipInlineSpaces();
    this.expect('returning');
    this.skipInlineSpaces();
    const returnValue = this.parseBacktickString();
    this.skipSpaces();
    const end = this.pos;
    return { target, returnValue, start, end };
  }

  private parseMock(): Mock {
    return this.parseMockHead('with');
  }
  private parseAndMock(): Mock {
    return this.parseMockHead('and');
  }

  private parseLetBinding(): LetVariable {
    const fullStart = this.pos;
    this.expect('let');
    this.skipInlineSpaces();
    const nameStart = this.pos;
    const name = this.parseIdentifier();
    const nameEnd = this.pos;
    // Track the position of this let variable with scope information
    if (this.currentDescribeName !== null) {
      this.testLetVariables.push({
        name,
        describeName: this.currentDescribeName,
        testName: this.currentTestName || undefined,
        start: nameStart,
        end: nameEnd
      });
    }
    this.skipInlineSpaces();
    this.expect('=');
    this.skipInlineSpaces();

    // Parse value: supports backtick strings, quoted strings, numbers (int/float), booleans, and null
    let format: LetValueFormat;
    const value = (() => {
      // Try backtick string
      const bt = this.tryParse(() => this.parseBacktickString());
      if (bt !== null) {
        format = 'backtick';
        return bt;
      }

      // Try quoted string
      const qt = this.tryParse(() => this.parseQuotedString());
      if (qt !== null) {
        format = 'quoted';
        return qt;
      }

      // Try null
      if (this.text.startsWith('null', this.pos)) {
        this.pos += 4;
        format = 'bare';
        return 'null';
      }

      // Try boolean
      if (this.text.startsWith('true', this.pos)) {
        this.pos += 4;
        format = 'bare';
        return 'true';
      }
      if (this.text.startsWith('false', this.pos)) {
        this.pos += 5;
        format = 'bare';
        return 'false';
      }

      // Try number (integer or float)
      const num = this.tryParse(() => {
        const digits = this.consumeWhile((c) => /[0-9]/.test(c));
        if (digits.length === 0) throw new Error('number');

        // Check for decimal point (float)
        if (this.cur() === '.') {
          this.pos++;
          const decimals = this.consumeWhile((c) => /[0-9]/.test(c));
          if (decimals.length === 0) throw new Error('Expected digits after decimal point');
          return digits + '.' + decimals;
        }

        return digits;
      });
      if (num !== null) {
        format = 'bare';
        return num;
      }

      throw new Error('let value');
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

  private parseIt(): It {
    const start = this.pos;
    this.skipSpaces();
    this.expect('it');
    this.skipInlineSpaces();
    this.expect('"');
    const name = this.consumeWhile((c) => c !== '"');
    this.expect('"');
    this.skipSpaces();

    // Set the current test context for let variable tracking
    this.currentTestName = name;

    const mocks: Mock[] = [];
    while (true) {
      const m = this.tryParse(() => this.parseMock());
      if (!m) break;
      mocks.push(m);
    }

    // Parse optional let bindings (before when clause)
    const variables: LetVariable[] = [];
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

    this.expect('when');
    this.skipInlineSpaces();
    const when = this.parseWhen();
    this.skipSpaces();

    // Parse optional with clauses
    let input: string | undefined;
    let body: string | undefined;
    let headers: string | undefined;
    let cookies: string | undefined;
    let firstWithClause = true;

    while (true) {
      // Try parsing a with clause
      const parsed = this.tryParse(() => {
        if (firstWithClause) {
          this.expect('with');
        } else {
          this.expect('and');
          this.skipInlineSpaces();
          this.expect('with');
        }
        this.skipInlineSpaces();

        // Try each type
        if (this.text.startsWith('input', this.pos)) {
          this.expect('input');
          this.skipInlineSpaces();
          const v = this.parseBacktickString();
          this.skipSpaces();
          return { type: 'input', value: v };
        } else if (this.text.startsWith('body', this.pos)) {
          this.expect('body');
          this.skipInlineSpaces();
          const v = this.parseBacktickString();
          this.skipSpaces();
          return { type: 'body', value: v };
        } else if (this.text.startsWith('headers', this.pos)) {
          this.expect('headers');
          this.skipInlineSpaces();
          const v = this.parseBacktickString();
          this.skipSpaces();
          return { type: 'headers', value: v };
        } else if (this.text.startsWith('cookies', this.pos)) {
          this.expect('cookies');
          this.skipInlineSpaces();
          const v = this.parseBacktickString();
          this.skipSpaces();
          return { type: 'cookies', value: v };
        } else if (this.text.startsWith('mock', this.pos)) {
          // This is a mock, not a with clause we handle here
          throw new Error('mock');
        } else {
          throw new Error('unknown with clause');
        }
      });

      if (!parsed) break;

      // Assign to appropriate variable
      if (parsed.type === 'input') input = parsed.value;
      else if (parsed.type === 'body') body = parsed.value;
      else if (parsed.type === 'headers') headers = parsed.value;
      else if (parsed.type === 'cookies') cookies = parsed.value;

      firstWithClause = false;
    }

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

    // Clear the test context
    this.currentTestName = null;

    const end = this.pos;

    return {
      name,
      mocks: [...mocks, ...extraMocks],
      when,
      variables: variables.length > 0 ? variables : undefined,
      input,
      body,
      headers,
      cookies,
      conditions,
      start,
      end
    };
  }

  private parseDescribe(): Describe {
    const start = this.pos;
    this.skipSpaces();
    this.expect('describe');
    this.skipInlineSpaces();
    this.expect('"');
    const name = this.consumeWhile((c) => c !== '"');
    this.expect('"');
    const inlineComment = this.parseInlineComment();
    this.skipSpaces();

    // Set the current describe context for let variable tracking
    this.currentDescribeName = name;

    // Parse let bindings, mocks, and tests in any order
    const variables: LetVariable[] = [];
    const mocks: Mock[] = [];
    const tests: It[] = [];

    while (true) {
      this.skipSpaces();

      // Try to parse a let binding
      const letBinding = this.tryParse(() => this.parseLetBinding());
      if (letBinding) {
        variables.push(letBinding);
        continue;
      }

      // Try to parse a mock (with mock)
      const withMock = this.tryParse(() => this.parseMock());
      if (withMock) {
        mocks.push(withMock);
        continue;
      }

      // Try to parse a mock (and mock)
      const andMock = this.tryParse(() => this.parseAndMock());
      if (andMock) {
        mocks.push(andMock);
        continue;
      }

      // Try to parse an it block
      const it = this.tryParse(() => this.parseIt());
      if (it) {
        tests.push(it);
        continue;
      }

      // Nothing more to parse
      break;
    }

    // Clear the describe context
    this.currentDescribeName = null;

    const end = this.pos;

    return { name, variables, mocks, tests, inlineComment: inlineComment || undefined, start, end };
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

export function getTestLetVariables(text: string): TestLetVariable[] {
  const parser = new Parser(text);
  parser.parseProgram();
  return parser.getTestLetVariables();
}

// Deprecated: Use getTestLetVariables() instead
export function getTestLetVariableRanges(text: string): Map<string, { start: number; end: number }> {
  const parser = new Parser(text);
  parser.parseProgram();
  const variables = parser.getTestLetVariables();
  const map = new Map<string, { start: number; end: number }>();
  for (const v of variables) {
    // For backward compatibility, use just the name as key (last one wins if duplicates)
    map.set(v.name, { start: v.start, end: v.end });
  }
  return map;
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

export function printGraphQLSchema(schema: GraphQLSchema): string {
  const schemaLine = `graphql schema = \`${schema.sdl}\``;
  if (schema.inlineComment) {
    return `${schemaLine} ${printComment(schema.inlineComment)}`;
  }
  return schemaLine;
}

export function printQueryResolver(query: QueryResolver): string {
  const lines: string[] = [];
  const queryLine = `query ${query.name} =`;
  if (query.inlineComment) {
    lines.push(`${queryLine} ${printComment(query.inlineComment)}`);
  } else {
    lines.push(queryLine);
  }
  query.pipeline.steps.forEach(step => {
    lines.push(formatPipelineStep(step));
  });
  return lines.join('\n');
}

export function printMutationResolver(mutation: MutationResolver): string {
  const lines: string[] = [];
  const mutationLine = `mutation ${mutation.name} =`;
  if (mutation.inlineComment) {
    lines.push(`${mutationLine} ${printComment(mutation.inlineComment)}`);
  } else {
    lines.push(mutationLine);
  }
  mutation.pipeline.steps.forEach(step => {
    lines.push(formatPipelineStep(step));
  });
  return lines.join('\n');
}

export function printTypeResolver(resolver: TypeResolver): string {
  const lines: string[] = [];
  const resolverLine = `resolver ${resolver.typeName}.${resolver.fieldName} =`;
  if (resolver.inlineComment) {
    lines.push(`${resolverLine} ${printComment(resolver.inlineComment)}`);
  } else {
    lines.push(resolverLine);
  }
  resolver.pipeline.steps.forEach(step => {
    lines.push(formatPipelineStep(step));
  });
  return lines.join('\n');
}

export function printMock(mock: Mock, indent: string = '  '): string {
  return `${indent}with mock ${mock.target} returning \`${mock.returnValue}\``;
}

export function printCondition(condition: Condition, indent: string = '    '): string {
  const condType = condition.conditionType.toLowerCase();

  // Handle selector conditions
  if (condition.field === 'selector' && condition.selector && condition.domAssert) {
    const selector = condition.selector;
    const formatValue = (val: string): string => {
      if (val.startsWith('`') || val.startsWith('"')) return val;
      if (val.includes('\n') || val.includes('{') || val.includes('[')) return `\`${val}\``;
      return `"${val}"`;
    };

    if (condition.domAssert.kind === 'Exists') {
      const operation = condition.comparison === 'exists' ? 'exists' : 'does not exist';
      return `${indent}${condType} selector "${selector}" ${operation}`;
    } else if (condition.domAssert.kind === 'Text') {
      return `${indent}${condType} selector "${selector}" text ${condition.comparison} ${formatValue(condition.value)}`;
    } else if (condition.domAssert.kind === 'Count') {
      return `${indent}${condType} selector "${selector}" count ${condition.comparison} ${condition.value}`;
    } else if (condition.domAssert.kind === 'Attribute') {
      return `${indent}${condType} selector "${selector}" attribute "${condition.domAssert.name}" ${condition.comparison} ${formatValue(condition.value)}`;
    }
  }

  // Handle regular conditions
  const fieldPart = condition.headerName
    ? `${condition.field} "${condition.headerName}"`
    : condition.jqExpr
      ? `${condition.field} \`${condition.jqExpr}\``
      : condition.field;
  const value = condition.value.startsWith('`') ? condition.value :
               (condition.value.includes('\n') || condition.value.includes('{') || condition.value.includes('[')) ? `\`${condition.value}\`` :
               condition.value;
  return `${indent}${condType} ${fieldPart} ${condition.comparison} ${value}`;
}

export function printTest(test: It): string {
  const lines: string[] = [];
  lines.push(`  it "${test.name}"`);
  test.mocks.forEach(mock => {
    lines.push(printMock(mock, '    '));
  });
  lines.push(`    when ${formatWhen(test.when)}`);

  // Print let bindings before with clauses
  if (test.variables) {
    test.variables.forEach((variable) => {
      // Format the value based on stored format
      const formattedValue = variable.format === 'quoted'
        ? `"${variable.value}"`
        : variable.format === 'backtick'
        ? `\`${variable.value}\``
        : variable.value;
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

  // Print describe-level let bindings
  if (describe.variables && describe.variables.length > 0) {
    describe.variables.forEach((variable) => {
      const formattedValue = variable.format === 'quoted'
        ? `"${variable.value}"`
        : variable.format === 'backtick'
        ? `\`${variable.value}\``
        : variable.value;
      lines.push(`  let ${variable.name} = ${formattedValue}`);
    });
    lines.push('');
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

  if (program.graphqlSchema) {
    allItems.push({ type: 'graphqlSchema', item: program.graphqlSchema, lineNumber: program.graphqlSchema.lineNumber || 0 });
  }

  program.queries.forEach(query => {
    allItems.push({ type: 'query', item: query, lineNumber: query.lineNumber || 0 });
  });

  program.mutations.forEach(mutation => {
    allItems.push({ type: 'mutation', item: mutation, lineNumber: mutation.lineNumber || 0 });
  });

  program.resolvers.forEach(resolver => {
    allItems.push({ type: 'resolver', item: resolver, lineNumber: resolver.lineNumber || 0 });
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

  allItems.forEach((entry, index) => {
    switch (entry.type) {
      case 'comment':
        lines.push(printComment(entry.item));
        break;
      case 'config':
        lines.push(printConfig(entry.item));
        lines.push('');
        break;
      case 'graphqlSchema':
        lines.push(printGraphQLSchema(entry.item));
        lines.push('');
        break;
      case 'query':
        lines.push(printQueryResolver(entry.item));
        lines.push('');
        break;
      case 'mutation':
        lines.push(printMutationResolver(entry.item));
        lines.push('');
        break;
      case 'resolver':
        lines.push(printTypeResolver(entry.item));
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
    const argsPart = step.args.length > 0 ? `(${step.args.join(', ')})` : '';
    const configPart = formatStepConfig(step.config, step.configType);
    const conditionPart = step.condition ? ' ' + formatTagExpr(step.condition) : '';
    return `${indent}|> ${step.name}${argsPart}: ${configPart}${conditionPart}`;
  } else if (step.kind === 'Result') {
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
  } else if (step.kind === 'If') {
    const lines: string[] = [`${indent}|> if`];
    // Format condition pipeline
    step.condition.steps.forEach(condStep => {
      lines.push(formatPipelineStep(condStep, indent + '  '));
    });
    // Format then branch
    lines.push(`${indent}  then:`);
    step.thenBranch.steps.forEach(thenStep => {
      lines.push(formatPipelineStep(thenStep, indent + '    '));
    });
    // Format else branch if present
    if (step.elseBranch) {
      lines.push(`${indent}  else:`);
      step.elseBranch.steps.forEach(elseStep => {
        lines.push(formatPipelineStep(elseStep, indent + '    '));
      });
    }
    return lines.join('\n');
  } else if (step.kind === 'Dispatch') {
    // Dispatch step
    const lines: string[] = [`${indent}|> dispatch`];
    // Format case branches
    step.branches.forEach(branch => {
      lines.push(`${indent}  case ${formatTagExpr(branch.condition)}:`);
      branch.pipeline.steps.forEach(branchStep => {
        lines.push(formatPipelineStep(branchStep, indent + '    '));
      });
    });
    // Format default branch if present
    if (step.default) {
      lines.push(`${indent}  default:`);
      step.default.steps.forEach(defaultStep => {
        lines.push(formatPipelineStep(defaultStep, indent + '    '));
      });
    }
    return lines.join('\n');
  } else {
    // Foreach step
    const lines: string[] = [`${indent}|> foreach ${step.selector}`];
    // Format inner pipeline
    step.pipeline.steps.forEach(innerStep => {
      lines.push(formatPipelineStep(innerStep, indent + '  '));
    });
    lines.push(`${indent}end`);
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

export function formatTags(tags: Tag[]): string {
  return tags.map(formatTag).join(' ');
}

export function formatTag(tag: Tag): string {
  const negation = tag.negated ? '!' : '';
  // Format arguments - wrap in backticks if they contain special characters
  const formattedArgs = tag.args.map(arg => {
    // If arg contains special characters, wrap in backticks
    if (/[^a-zA-Z0-9_-]/.test(arg)) {
      return `\`${arg}\``;
    }
    return arg;
  });
  const args = tag.args.length > 0 ? `(${formattedArgs.join(',')})` : '';
  return `@${negation}${tag.name}${args}`;
}

export function formatTagExpr(expr: TagExpr): string {
  switch (expr.kind) {
    case 'Tag':
      return formatTag(expr.tag);
    case 'And': {
      // Add parentheses around OR expressions inside AND for clarity
      const leftStr = expr.left.kind === 'Or' ? `(${formatTagExpr(expr.left)})` : formatTagExpr(expr.left);
      const rightStr = expr.right.kind === 'Or' ? `(${formatTagExpr(expr.right)})` : formatTagExpr(expr.right);
      return `${leftStr} and ${rightStr}`;
    }
    case 'Or':
      return `${formatTagExpr(expr.left)} or ${formatTagExpr(expr.right)}`;
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
