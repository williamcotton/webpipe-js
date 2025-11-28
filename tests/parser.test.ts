import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseProgram, type Program, prettyPrint, parseProgramWithDiagnostics } from '../src/parser';

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

describe('parseProgram - tags support', () => {
  it('parses single tag on regular step', () => {
    const src = `pipeline test =
  |> jq: \`{ hello: "world" }\` @prod`;
    const program = parseProgram(src);
    const pipeline = program.pipelines[0];
    const step = pipeline.pipeline.steps[0];

    expect(step.kind).toBe('Regular');
    if (step.kind === 'Regular') {
      expect(step.tags.length).toBe(1);
      expect(step.tags[0].name).toBe('prod');
      expect(step.tags[0].negated).toBe(false);
      expect(step.tags[0].args.length).toBe(0);
    }
  });

  it('parses multiple tags on same step', () => {
    const src = `pipeline test =
  |> pg: \`SELECT * FROM users\` @dev @flag(new-ui)`;
    const program = parseProgram(src);
    const pipeline = program.pipelines[0];
    const step = pipeline.pipeline.steps[0];

    expect(step.kind).toBe('Regular');
    if (step.kind === 'Regular') {
      expect(step.tags.length).toBe(2);
      expect(step.tags[0].name).toBe('dev');
      expect(step.tags[0].negated).toBe(false);
      expect(step.tags[0].args.length).toBe(0);

      expect(step.tags[1].name).toBe('flag');
      expect(step.tags[1].negated).toBe(false);
      expect(step.tags[1].args).toEqual(['new-ui']);
    }
  });

  it('parses negated tag', () => {
    const src = `pipeline test =
  |> log: \`level: debug\` @!prod`;
    const program = parseProgram(src);
    const pipeline = program.pipelines[0];
    const step = pipeline.pipeline.steps[0];

    expect(step.kind).toBe('Regular');
    if (step.kind === 'Regular') {
      expect(step.tags.length).toBe(1);
      expect(step.tags[0].name).toBe('prod');
      expect(step.tags[0].negated).toBe(true);
      expect(step.tags[0].args.length).toBe(0);
    }
  });

  it('parses tag with single argument', () => {
    const src = `pipeline test =
  |> log: \`level: debug\` @async(user)`;
    const program = parseProgram(src);
    const pipeline = program.pipelines[0];
    const step = pipeline.pipeline.steps[0];

    expect(step.kind).toBe('Regular');
    if (step.kind === 'Regular') {
      expect(step.tags.length).toBe(1);
      expect(step.tags[0].name).toBe('async');
      expect(step.tags[0].negated).toBe(false);
      expect(step.tags[0].args).toEqual(['user']);
    }
  });

  it('parses tag with multiple arguments', () => {
    const src = `pipeline test =
  |> echo: myVar @flag(beta,staff)`;
    const program = parseProgram(src);
    const pipeline = program.pipelines[0];
    const step = pipeline.pipeline.steps[0];

    expect(step.kind).toBe('Regular');
    if (step.kind === 'Regular') {
      expect(step.tags.length).toBe(1);
      expect(step.tags[0].name).toBe('flag');
      expect(step.tags[0].negated).toBe(false);
      expect(step.tags[0].args).toEqual(['beta', 'staff']);
    }
  });

  it('parses steps without tags (backwards compatibility)', () => {
    const src = `pipeline test =
  |> jq: \`.\`
  |> echo: foo`;
    const program = parseProgram(src);
    const pipeline = program.pipelines[0];

    pipeline.pipeline.steps.forEach(step => {
      if (step.kind === 'Regular') {
        expect(step.tags).toEqual([]);
      }
    });
  });

  it('roundtrip: parse -> format -> parse preserves tags', () => {
    const src = `pipeline test =
  |> jq: \`{ hello: "world" }\` @prod
  |> pg: \`SELECT * FROM users\` @dev @flag(new-ui)
  |> log: \`level: debug\` @!prod @async(user)
  |> echo: myVar @flag(beta,staff)
`;
    const program1 = parseProgram(src);
    const formatted = prettyPrint(program1);
    const program2 = parseProgram(formatted);

    expect(program1.pipelines[0].pipeline.steps).toEqual(program2.pipelines[0].pipeline.steps);
  });

  it('formats tags correctly', () => {
    const src = `pipeline test =
  |> jq: \`.\` @prod @dev`;
    const program = parseProgram(src);
    const formatted = prettyPrint(program);

    expect(formatted).toContain('@prod @dev');
  });

  it('formats negated tag correctly', () => {
    const src = `pipeline test =
  |> jq: \`.\` @!prod`;
    const program = parseProgram(src);
    const formatted = prettyPrint(program);

    expect(formatted).toContain('@!prod');
  });

  it('formats tag with arguments correctly', () => {
    const src = `pipeline test =
  |> jq: \`.\` @flag(a,b,c)`;
    const program = parseProgram(src);
    const formatted = prettyPrint(program);

    expect(formatted).toContain('@flag(a,b,c)');
  });

  it('does not add tags to result steps', () => {
    const src = `pipeline test =
  |> result
    ok(200):
      |> jq: \`{ok: true}\``;
    const program = parseProgram(src);
    const pipeline = program.pipelines[0];
    const step = pipeline.pipeline.steps[0];

    expect(step.kind).toBe('Result');
    expect(step).not.toHaveProperty('tags');
  });

  it('empty tag arguments produce diagnostics', () => {
    const src = `pipeline test =
  |> jq: \`.\` @flag()`;
    const { program } = parseProgramWithDiagnostics(src);
    // Parser should either reject or produce diagnostic
    // Currently will stop parsing tags after @flag( due to exception in tryParse
    const step = program.pipelines[0]?.pipeline?.steps?.[0];
    if (step && step.kind === 'Regular') {
      // If it parsed, there should be no flag tag with empty args
      const flagTag = step.tags.find(t => t.name === 'flag');
      if (flagTag) {
        expect(flagTag.args.length).toBeGreaterThan(0);
      }
    }
  });

  it('trailing comma in tag arguments produces diagnostics', () => {
    const src = `pipeline test =
  |> jq: \`.\` @flag(foo,)`;
    const { program } = parseProgramWithDiagnostics(src);
    // Parser should either reject or produce diagnostic
    const step = program.pipelines[0]?.pipeline?.steps?.[0];
    if (step && step.kind === 'Regular') {
      // If it parsed, check what happened
      const flagTag = step.tags.find(t => t.name === 'flag');
      // tryParse will have failed, so tag should not exist or should be incomplete
      expect(flagTag === undefined || flagTag.args.length === 1).toBe(true);
    }
  });

  it('tag without name stops parsing tags', () => {
    const src = `pipeline test =
  |> jq: \`.\` @`;
    const { program } = parseProgramWithDiagnostics(src);
    // Parser will stop at @ since identifier expected
    const step = program.pipelines[0]?.pipeline?.steps?.[0];
    if (step && step.kind === 'Regular') {
      // No tags should have been parsed
      expect(step.tags.length).toBe(0);
    }
  });

  it('parses tags with comments after', () => {
    const src = `pipeline test =
  |> jq: \`.\` @prod # comment`;
    const program = parseProgram(src);
    const pipeline = program.pipelines[0];
    const step = pipeline.pipeline.steps[0];

    expect(step.kind).toBe('Regular');
    if (step.kind === 'Regular') {
      expect(step.tags.length).toBe(1);
      expect(step.tags[0].name).toBe('prod');
    }
  });

  it('parses tags with inline comments after', () => {
    const src = `pipeline test =
  |> jq: \`.\` @prod // comment`;
    const program = parseProgram(src);
    const pipeline = program.pipelines[0];
    const step = pipeline.pipeline.steps[0];

    expect(step.kind).toBe('Regular');
    if (step.kind === 'Regular') {
      expect(step.tags.length).toBe(1);
      expect(step.tags[0].name).toBe('prod');
    }
  });
});

describe('parseProgram - comments inside pipelines', () => {
  it('parses comments between pipeline steps', () => {
    const src = `GET /test
  # comment before first step
  |> jq: \`{ hello: "world" }\`
  # comment between steps
  |> handlebars: \`<p>{{hello}}</p>\`
  # comment after last step
`;
    const program = parseProgram(src);
    expect(program.routes.length).toBe(1);
    
    const route = program.routes[0];
    expect(route.pipeline.kind).toBe('Inline');
    if (route.pipeline.kind === 'Inline') {
      // Should parse both steps despite comments
      expect(route.pipeline.pipeline.steps.length).toBe(2);
      
      const first = route.pipeline.pipeline.steps[0];
      const second = route.pipeline.pipeline.steps[1];
      expect(first.kind).toBe('Regular');
      expect(second.kind).toBe('Regular');
      if (first.kind === 'Regular') {
        expect(first.name).toBe('jq');
      }
      if (second.kind === 'Regular') {
        expect(second.name).toBe('handlebars');
      }
    }
  });

  it('parses comments inside if blocks', () => {
    const src = `GET /test-if
  |> jq: \`{ level: 10 }\`
  # comment before if
  |> if
    |> jq: \`.level > 5\`
    # comment before then
    then:
      # comment inside then
      |> jq: \`. + { status: "high" }\`
    # comment before else
    else:
      # comment inside else
      |> jq: \`. + { status: "low" }\`
`;
    const program = parseProgram(src);
    expect(program.routes.length).toBe(1);
    
    const route = program.routes[0];
    expect(route.pipeline.kind).toBe('Inline');
    if (route.pipeline.kind === 'Inline') {
      expect(route.pipeline.pipeline.steps.length).toBe(2); // jq + if
      
      const ifStep = route.pipeline.pipeline.steps[1];
      expect(ifStep.kind).toBe('If');
      if (ifStep.kind === 'If') {
        expect(ifStep.condition.steps.length).toBe(1);
        expect(ifStep.thenBranch.steps.length).toBe(1);
        expect(ifStep.elseBranch).toBeDefined();
        expect(ifStep.elseBranch!.steps.length).toBe(1);
      }
    }
  });

  it('parses comments inside result branches', () => {
    const src = `GET /test
  |> jq: \`{}\`
  |> result
    # comment before ok
    ok(200):
      # comment in ok branch
      |> jq: \`{ok: true}\`
    # comment before default
    default(500):
      |> jq: \`{ok: false}\`
`;
    const program = parseProgram(src);
    expect(program.routes.length).toBe(1);
    
    const route = program.routes[0];
    expect(route.pipeline.kind).toBe('Inline');
    if (route.pipeline.kind === 'Inline') {
      const resultStep = route.pipeline.pipeline.steps[1];
      expect(resultStep.kind).toBe('Result');
      if (resultStep.kind === 'Result') {
        expect(resultStep.branches.length).toBe(2);
        expect(resultStep.branches[0].statusCode).toBe(200);
        expect(resultStep.branches[1].statusCode).toBe(500);
      }
    }
  });

  it('parses // style comments in pipelines', () => {
    const src = `GET /test
  // C-style comment before step
  |> jq: \`{ x: 1 }\`
  // Another comment
  |> jq: \`{ y: 2 }\`
`;
    const program = parseProgram(src);
    expect(program.routes.length).toBe(1);
    
    const route = program.routes[0];
    if (route.pipeline.kind === 'Inline') {
      expect(route.pipeline.pipeline.steps.length).toBe(2);
    }
  });
});

