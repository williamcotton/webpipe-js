// WebPipe TypeScript parser mirroring the Rust nom grammar in src/ast/mod.rs
// High-level approach: a small hand-written recursive-descent parser with
// combinator-like helpers. Produces an AST analogous to the Rust structs.
// ===== Lexer helpers =====
class Cursor {
    src;
    i;
    constructor(src, i = 0) {
        this.src = src;
        this.i = i;
    }
    peek(n = 0) {
        return this.src[this.i + n];
    }
    eof() {
        return this.i >= this.src.length;
    }
    rest() {
        return this.src.slice(this.i);
    }
    advance(n) {
        this.i += n;
    }
    matchPrefix(prefix) {
        return this.src.startsWith(prefix, this.i);
    }
    tryConsume(prefix) {
        if (this.matchPrefix(prefix)) {
            this.i += prefix.length;
            return true;
        }
        return false;
    }
    skipSpaces() {
        while (!this.eof()) {
            const ch = this.peek();
            if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n')
                this.i++;
            else
                break;
        }
    }
}
function isAlphaNumUnderscoreDash(ch) {
    return /[A-Za-z0-9_-]/.test(ch);
}
function parseIdentifier(cur) {
    const start = cur.i;
    const ch0 = cur.peek();
    if (!ch0 || !/[A-Za-z0-9_]/.test(ch0))
        return null;
    cur.advance(1);
    while (!cur.eof()) {
        const ch = cur.peek();
        if (isAlphaNumUnderscoreDash(ch))
            cur.advance(1);
        else
            break;
    }
    return cur.src.slice(start, cur.i);
}
function parseQuoted(cur, quote) {
    if (cur.peek() !== quote)
        return null;
    cur.advance(1);
    const start = cur.i;
    while (!cur.eof()) {
        const ch = cur.peek();
        if (ch === quote) {
            const s = cur.src.slice(start, cur.i);
            cur.advance(1);
            return s;
        }
        cur.advance(1);
    }
    return null; // unclosed
}
function parseDigits(cur) {
    const start = cur.i;
    let saw = false;
    while (!cur.eof() && /[0-9]/.test(cur.peek())) {
        cur.advance(1);
        saw = true;
    }
    return saw ? cur.src.slice(start, cur.i) : null;
}
function parseMethod(cur) {
    for (const m of ["GET", "POST", "PUT", "DELETE"]) {
        if (cur.matchPrefix(m)) {
            cur.advance(m.length);
            return m;
        }
    }
    return null;
}
function parseTakeTillNewline(cur) {
    const start = cur.i;
    while (!cur.eof() && cur.peek() !== '\n')
        cur.advance(1);
    return cur.src.slice(start, cur.i);
}
function expect(cur, token) {
    if (cur.tryConsume(token))
        return true;
    return false;
}
// ===== Value helpers =====
function parseMultiOrQuotedOrIdentifier(cur) {
    const bt = parseQuoted(cur, '`');
    if (bt !== null)
        return bt;
    const dq = parseQuoted(cur, '"');
    if (dq !== null)
        return dq;
    const ident = parseIdentifier(cur);
    if (ident !== null)
        return ident;
    return null;
}
function parseConfigValue(cur) {
    // $VAR || "default" | $VAR | "str" | true | false | number
    if (cur.peek() === '$') {
        cur.advance(1);
        const name = parseIdentifier(cur);
        if (!name)
            return null;
        cur.skipSpaces();
        if (cur.tryConsume("||")) {
            cur.skipSpaces();
            const d = parseQuoted(cur, '"');
            if (d === null)
                return null;
            return { kind: "EnvVar", var: name, default: d };
        }
        return { kind: "EnvVar", var: name };
    }
    const dq = parseQuoted(cur, '"');
    if (dq !== null)
        return { kind: "String", value: dq };
    if (cur.matchPrefix("true")) {
        cur.advance(4);
        return { kind: "Boolean", value: true };
    }
    if (cur.matchPrefix("false")) {
        cur.advance(5);
        return { kind: "Boolean", value: false };
    }
    const digits = parseDigits(cur);
    if (digits !== null)
        return { kind: "Number", value: Number(digits) };
    return null;
}
function parseConfigProperty(cur) {
    const save = cur.i;
    cur.skipSpaces();
    const key = parseIdentifier(cur);
    if (!key) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    if (!expect(cur, ":")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const value = parseConfigValue(cur);
    if (!value) {
        cur.i = save;
        return null;
    }
    return { key, value };
}
function parseConfig(cur) {
    const save = cur.i;
    if (!cur.tryConsume("config")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const name = parseIdentifier(cur);
    if (!name) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    if (!expect(cur, "{")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const properties = [];
    while (true) {
        const prop = parseConfigProperty(cur);
        if (!prop)
            break;
        properties.push(prop);
        cur.skipSpaces();
    }
    if (!expect(cur, "}")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    return { name, properties };
}
// ===== Pipeline parsing =====
function parseStepConfig(cur) {
    return parseMultiOrQuotedOrIdentifier(cur);
}
function parseRegularStep(cur) {
    const save = cur.i;
    cur.skipSpaces();
    if (!cur.tryConsume("|>")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const name = parseIdentifier(cur);
    if (!name) {
        cur.i = save;
        return null;
    }
    if (!expect(cur, ":")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const config = parseStepConfig(cur);
    if (config === null) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    return { type: "Regular", name, config };
}
function parseResultBranch(cur) {
    const save = cur.i;
    cur.skipSpaces();
    const bt = parseIdentifier(cur);
    if (!bt) {
        cur.i = save;
        return null;
    }
    const branch_type = bt === "ok" ? { type: "Ok" } : bt === "default" ? { type: "Default" } : { type: "Custom", name: bt };
    if (!expect(cur, "(")) {
        cur.i = save;
        return null;
    }
    const digits = parseDigits(cur);
    if (!digits) {
        cur.i = save;
        return null;
    }
    const status_code = Number(digits);
    if (!expect(cur, ")")) {
        cur.i = save;
        return null;
    }
    if (!expect(cur, ":")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const pipeline = parsePipeline(cur);
    if (!pipeline) {
        cur.i = save;
        return null;
    }
    return { branch_type, status_code, pipeline };
}
function parseResultStep(cur) {
    const save = cur.i;
    cur.skipSpaces();
    if (!cur.tryConsume("|>")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    if (!cur.tryConsume("result")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const branches = [];
    while (true) {
        const b = parseResultBranch(cur);
        if (!b)
            break;
        branches.push(b);
    }
    return { type: "Result", branches };
}
function parsePipelineStep(cur) {
    return parseResultStep(cur) ?? parseRegularStep(cur);
}
function parsePipeline(cur) {
    const steps = [];
    while (true) {
        const save = cur.i;
        const step = parsePipelineStep(cur);
        if (!step) {
            cur.i = save;
            break;
        }
        steps.push(step);
        cur.skipSpaces();
    }
    return { steps };
}
function parseNamedPipeline(cur) {
    const save = cur.i;
    if (!cur.tryConsume("pipeline")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const name = parseIdentifier(cur);
    if (!name) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    if (!expect(cur, "=")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const pipeline = parsePipeline(cur);
    if (!pipeline) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    return { name, pipeline };
}
function parsePipelineRef(cur) {
    // Try inline first
    const saveInline = cur.i;
    const inline = parsePipeline(cur);
    if (inline)
        return { type: "Inline", pipeline: inline };
    cur.i = saveInline;
    // |> pipeline: NAME
    const save = cur.i;
    cur.skipSpaces();
    if (!cur.tryConsume("|>")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    if (!cur.tryConsume("pipeline:")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const name = parseIdentifier(cur);
    if (!name) {
        cur.i = save;
        return null;
    }
    return { type: "Named", name };
}
// ===== Variable parsing =====
function parseVariable(cur) {
    const save = cur.i;
    const var_type = parseIdentifier(cur);
    if (!var_type) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const name = parseIdentifier(cur);
    if (!name) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    if (!expect(cur, "=")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const value = parseQuoted(cur, '`');
    if (value === null) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    return { var_type, name, value };
}
// ===== Route parsing =====
function parseRoute(cur) {
    const save = cur.i;
    const method = parseMethod(cur);
    if (!method) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const path = parseTakeTillNewline(cur);
    if (path === null) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const pipeline = parsePipelineRef(cur);
    if (!pipeline) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    return { method, path: path.trim(), pipeline };
}
// ===== Test parsing =====
function parseWhen(cur) {
    const save = cur.i;
    // calling METHOD PATH
    if (cur.tryConsume("calling")) {
        cur.skipSpaces();
        const method = parseMethod(cur);
        if (!method) {
            cur.i = save;
            return null;
        }
        cur.skipSpaces();
        const path = parseTakeTillNewline(cur) ?? "";
        return { type: "CallingRoute", method, path: path.trim() };
    }
    cur.i = save;
    if (cur.tryConsume("executing")) {
        cur.skipSpaces();
        if (cur.tryConsume("pipeline")) {
            cur.skipSpaces();
            const name = parseIdentifier(cur);
            if (!name) {
                cur.i = save;
                return null;
            }
            return { type: "ExecutingPipeline", name };
        }
        if (cur.tryConsume("variable")) {
            cur.skipSpaces();
            const var_type = parseIdentifier(cur);
            if (!var_type) {
                cur.i = save;
                return null;
            }
            cur.skipSpaces();
            const name = parseIdentifier(cur);
            if (!name) {
                cur.i = save;
                return null;
            }
            return { type: "ExecutingVariable", var_type, name };
        }
    }
    cur.i = save;
    return null;
}
function parseCondition(cur) {
    const save = cur.i;
    cur.skipSpaces();
    let condition_type;
    if (cur.tryConsume("then"))
        condition_type = "then";
    else if (cur.tryConsume("and"))
        condition_type = "and";
    else {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    // field
    const fieldStart = cur.i;
    while (!cur.eof() && cur.peek() !== ' ' && cur.peek() !== '\n')
        cur.advance(1);
    const field = cur.src.slice(fieldStart, cur.i);
    if (!field) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    // optional backticked jq
    const jq_expr = parseQuoted(cur, '`') ?? undefined;
    cur.skipSpaces();
    // comparison
    const compStart = cur.i;
    while (!cur.eof() && cur.peek() !== ' ' && cur.peek() !== '\n')
        cur.advance(1);
    const comparison = cur.src.slice(compStart, cur.i);
    if (!comparison) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    // value: backtick | quoted | rest of line
    let value = parseQuoted(cur, '`');
    if (value === null)
        value = parseQuoted(cur, '"');
    if (value === null) {
        value = parseTakeTillNewline(cur) ?? null;
    }
    if (value === null) {
        cur.i = save;
        return null;
    }
    return { condition_type, field, jq_expr, comparison, value: value };
}
function parseMock(cur) {
    const save = cur.i;
    cur.skipSpaces();
    if (!cur.tryConsume("with")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    if (!cur.tryConsume("mock")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const targetStart = cur.i;
    while (!cur.eof() && cur.peek() !== ' ')
        cur.advance(1);
    const target = cur.src.slice(targetStart, cur.i);
    cur.skipSpaces();
    if (!cur.tryConsume("returning")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const return_value = parseQuoted(cur, '`');
    if (return_value === null) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    return { target, return_value };
}
function parseAndMock(cur) {
    const save = cur.i;
    cur.skipSpaces();
    if (!cur.tryConsume("and")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    if (!cur.tryConsume("mock")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const targetStart = cur.i;
    while (!cur.eof() && cur.peek() !== ' ')
        cur.advance(1);
    const target = cur.src.slice(targetStart, cur.i);
    cur.skipSpaces();
    if (!cur.tryConsume("returning")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const return_value = parseQuoted(cur, '`');
    if (return_value === null) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    return { target, return_value };
}
function parseIt(cur) {
    const save = cur.i;
    cur.skipSpaces();
    if (!cur.tryConsume("it")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const name = parseQuoted(cur, '"');
    if (name === null) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const mocks = [];
    while (true) {
        const m = parseMock(cur);
        if (!m)
            break;
        mocks.push(m);
    }
    if (!cur.tryConsume("when")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const when = parseWhen(cur);
    if (!when) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    // optional input
    let input;
    const saveInput = cur.i;
    if (cur.tryConsume("with")) {
        cur.skipSpaces();
        if (cur.tryConsume("input")) {
            cur.skipSpaces();
            const v = parseQuoted(cur, '`');
            if (v !== null)
                input = v;
            else {
                cur.i = saveInput;
            }
        }
        else {
            cur.i = saveInput;
        }
    }
    cur.skipSpaces();
    // additional mocks
    while (true) {
        const m = parseAndMock(cur);
        if (!m)
            break;
        mocks.push(m);
    }
    cur.skipSpaces();
    const conditions = [];
    while (true) {
        const c = parseCondition(cur);
        if (!c)
            break;
        conditions.push(c);
    }
    return { name, mocks, when, input, conditions };
}
function parseDescribe(cur) {
    const save = cur.i;
    cur.skipSpaces();
    if (!cur.tryConsume("describe")) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const name = parseQuoted(cur, '"');
    if (name === null) {
        cur.i = save;
        return null;
    }
    cur.skipSpaces();
    const mocks = [];
    while (true) {
        const m = parseMock(cur);
        if (!m)
            break;
        mocks.push(m);
    }
    cur.skipSpaces();
    const tests = [];
    while (true) {
        const it = parseIt(cur);
        if (!it)
            break;
        tests.push(it);
    }
    return { name, mocks, tests };
}
// ===== Top-level program =====
export function parseProgram(src) {
    const cur = new Cursor(src);
    cur.skipSpaces();
    const configs = [];
    const pipelines = [];
    const variables = [];
    const routes = [];
    const describes = [];
    while (!cur.eof()) {
        // consume incidental space/newlines between items
        cur.skipSpaces();
        if (cur.eof())
            break;
        const save = cur.i;
        const c = parseConfig(cur);
        if (c) {
            configs.push(c);
            continue;
        }
        cur.i = save;
        const np = parseNamedPipeline(cur);
        if (np) {
            pipelines.push(np);
            continue;
        }
        cur.i = save;
        const v = parseVariable(cur);
        if (v) {
            variables.push(v);
            continue;
        }
        cur.i = save;
        const r = parseRoute(cur);
        if (r) {
            routes.push(r);
            continue;
        }
        cur.i = save;
        const d = parseDescribe(cur);
        if (d) {
            describes.push(d);
            continue;
        }
        // Skip to next newline if unrecognized
        while (!cur.eof() && cur.peek() !== '\n')
            cur.advance(1);
        if (!cur.eof() && cur.peek() === '\n')
            cur.advance(1);
    }
    return { configs, pipelines, variables, routes, describes };
}
// Small CLI helper for quick manual testing
if (import.meta.url === `file://${process.argv[1]}`) {
    const fs = await import('node:fs/promises');
    const path = process.argv[2];
    if (!path) {
        console.error('Usage: node dist/parser.js <file.wp>');
        process.exit(1);
    }
    const src = await fs.readFile(path, 'utf8');
    const program = parseProgram(src);
    console.log(JSON.stringify(program, null, 2));
}
