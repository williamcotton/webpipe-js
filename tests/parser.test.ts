import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseProgram, type Program, prettyPrint } from '../src/parser';

function loadFixture(name: string): string {
  const file = resolve(process.cwd(), name);
  return readFileSync(file, 'utf8');
}

describe('parseProgram - comprehensive_test.wp', () => {
  let program: Program;

  beforeAll(() => {
    const src = loadFixture('comprehensive_test.wp');
    program = parseProgram(src);
  });

  it('parses at least one route', () => {
    expect(program.routes.length).toBeGreaterThan(0);
    const hello = program.routes.find(r => r.path.startsWith('/hello'));
    expect(hello).toBeTruthy();
    expect(hello!.method).toBe('GET');
    // First step should be jq with config string
    if (hello!.pipeline.kind === 'Inline') {
      const first = hello!.pipeline.pipeline.steps[0];
      expect(first.kind).toBe('Regular');
      if (first.kind === 'Regular') {
        expect(first.name).toBe('jq');
        expect(typeof first.config).toBe('string');
      }
    }
  });

  it('parses configs', () => {
    expect(program.configs.length).toBeGreaterThan(0);
    const pg = program.configs.find(c => c.name === 'pg');
    expect(pg).toBeTruthy();
    expect(pg!.properties.length).toBeGreaterThan(3);
    const host = pg!.properties.find(p => p.key === 'host');
    expect(host).toBeTruthy();
    expect(host!.value.kind === 'EnvVar' || host!.value.kind === 'String').toBe(true);
  });

  it('parses named pipelines and references', () => {
    const np = program.pipelines.find(p => p.name === 'getTeams');
    expect(np).toBeTruthy();
    const route = program.routes.find(r => r.path.startsWith('/page/'));
    expect(route).toBeTruthy();
    expect(route!.pipeline.kind).toBe('Inline');
    if (route!.pipeline.kind === 'Inline') {
      const step = route!.pipeline.pipeline.steps[0];
      expect(step.kind).toBe('Regular');
      if (step.kind === 'Regular') {
        expect(step.name).toBe('pipeline');
        expect(step.config).toBe('getTeams');
      }
    }
  });

  it('parses variables', () => {
    expect(program.variables.length).toBeGreaterThan(0);
    const teamsQuery = program.variables.find(v => v.name === 'teamsQuery');
    expect(teamsQuery).toBeTruthy();
    expect(teamsQuery!.varType).toBe('pg');
    expect(typeof teamsQuery!.value).toBe('string');
  });

  it('parses describes and tests with conditions', () => {
    expect(program.describes.length).toBeGreaterThan(0);
    const d = program.describes.find(dd => dd.name.includes('hello'))!;
    expect(d).toBeTruthy();
    expect(d.tests.length).toBeGreaterThan(0);
    const t0 = d.tests[0];
    expect(t0.when).toBeTruthy();
    expect(t0.conditions.length).toBeGreaterThan(0);
  });
});

describe('parseProgram - focused samples', () => {
  it('parses result branches', () => {
    const src = `GET /test\n  |> jq: \`{message: "x"}\`\n  |> result\n    ok(200):\n      |> jq: \`{ok: true}\`\n    default(500):\n      |> jq: \`{ok: false}\``;
    const program = parseProgram(src);
    expect(program.routes.length).toBe(1);
    const steps = (program.routes[0].pipeline as any).pipeline.steps as any[];
    const res = steps.find(s => s.kind === 'Result');
    expect(res).toBeTruthy();
    expect(res.branches.length).toBe(2);
    expect(res.branches[0].statusCode).toBe(200);
    expect(res.branches[1].statusCode).toBe(500);
  });

  it('parses POST with body conversion pipeline', () => {
    const src = `POST /users\n  |> jq: \`{ name: .body.name }\``;
    const program = parseProgram(src);
    expect(program.routes[0].method).toBe('POST');
    const first = (program.routes[0].pipeline as any).pipeline.steps[0];
    expect(first.name).toBe('jq');
  });

  it('parses inline and named pipeline refs', () => {
    const src = `pipeline p =\n  |> jq: \`{x:1}\`\n\nGET /a\n  |> pipeline: p`;
    const program = parseProgram(src);
    const p = program.pipelines.find(pp => pp.name === 'p');
    expect(p).toBeTruthy();
    const route = program.routes[0];
    expect(route.pipeline.kind).toBe('Inline');
    if (route.pipeline.kind === 'Inline') {
      const step = route.pipeline.pipeline.steps[0];
      expect(step.kind).toBe('Regular');
      if (step.kind === 'Regular') {
        expect(step.name).toBe('pipeline');
        expect(step.config).toBe('p');
      }
    }
  });
});

describe('prettyPrint formatting', () => {
  it('should add quotes around auth step configs', () => {
    const src = `DELETE /todos/:id
  |> auth: "required"
  |> result`;
    
    const program = parseProgram(src);
    const prettyPrinted = prettyPrint(program);
    
    // Should preserve quotes around "required"
    expect(prettyPrinted).toContain('|> auth: "required"');
    // Should not have unquoted required
    expect(prettyPrinted).not.toContain('|> auth: required');
  });
});


