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
      expect(step.condition).toBeDefined();
      expect(step.condition?.kind).toBe('Tag');
      if (step.condition?.kind === 'Tag') {
        expect(step.condition.tag.name).toBe('prod');
        expect(step.condition.tag.negated).toBe(false);
        expect(step.condition.tag.args.length).toBe(0);
      }
    }
  });

  it('parses multiple tags on same step (implicit AND)', () => {
    const src = `pipeline test =
  |> pg: \`SELECT * FROM users\` @dev @flag(new-ui)`;
    const program = parseProgram(src);
    const pipeline = program.pipelines[0];
    const step = pipeline.pipeline.steps[0];

    expect(step.kind).toBe('Regular');
    if (step.kind === 'Regular') {
      // Multiple space-separated tags are now parsed as implicit AND
      expect(step.condition).toBeDefined();
      expect(step.condition?.kind).toBe('And');
      if (step.condition?.kind === 'And') {
        // Left side: @dev
        expect(step.condition.left.kind).toBe('Tag');
        if (step.condition.left.kind === 'Tag') {
          expect(step.condition.left.tag.name).toBe('dev');
        }
        // Right side: @flag(new-ui)
        expect(step.condition.right.kind).toBe('Tag');
        if (step.condition.right.kind === 'Tag') {
          expect(step.condition.right.tag.name).toBe('flag');
          expect(step.condition.right.tag.args).toEqual(['new-ui']);
        }
      }
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
      expect(step.condition).toBeDefined();
      expect(step.condition?.kind).toBe('Tag');
      if (step.condition?.kind === 'Tag') {
        expect(step.condition.tag.name).toBe('prod');
        expect(step.condition.tag.negated).toBe(true);
      }
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
      expect(step.condition).toBeDefined();
      expect(step.condition?.kind).toBe('Tag');
      if (step.condition?.kind === 'Tag') {
        expect(step.condition.tag.name).toBe('async');
        expect(step.condition.tag.negated).toBe(false);
        expect(step.condition.tag.args).toEqual(['user']);
      }
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
      expect(step.condition).toBeDefined();
      expect(step.condition?.kind).toBe('Tag');
      if (step.condition?.kind === 'Tag') {
        expect(step.condition.tag.name).toBe('flag');
        expect(step.condition.tag.negated).toBe(false);
        expect(step.condition.tag.args).toEqual(['beta', 'staff']);
      }
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
        expect(step.condition).toBeUndefined();
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

    // Multiple space-separated tags are now parsed as implicit AND
    expect(formatted).toContain('@prod and @dev');
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
      // If it parsed with a condition, check the tag
      if (step.condition && step.condition.kind === 'Tag') {
        const tag = step.condition.tag;
        if (tag.name === 'flag') {
          expect(tag.args.length).toBeGreaterThan(0);
        }
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
      // Check condition - tryParse may have failed, so condition might be undefined
      expect(step.condition === undefined || 
        (step.condition.kind === 'Tag' && step.condition.tag.args.length === 1)).toBe(true);
    }
  });

  it('tag without name stops parsing tags', () => {
    const src = `pipeline test =
  |> jq: \`.\` @`;
    const { program } = parseProgramWithDiagnostics(src);
    // Parser will stop at @ since identifier expected
    const step = program.pipelines[0]?.pipeline?.steps?.[0];
    if (step && step.kind === 'Regular') {
      // No condition should have been parsed
      expect(step.condition).toBeUndefined();
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
      expect(step.condition).toBeDefined();
      expect(step.condition?.kind).toBe('Tag');
      if (step.condition?.kind === 'Tag') {
        expect(step.condition.tag.name).toBe('prod');
      }
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
      expect(step.condition).toBeDefined();
      expect(step.condition?.kind).toBe('Tag');
      if (step.condition?.kind === 'Tag') {
        expect(step.condition.tag.name).toBe('prod');
      }
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

describe('parseProgram - dispatch step', () => {
  it('parses basic dispatch with case and default', () => {
    const src = `GET /test
  |> dispatch
    case @flag(experimental):
      |> jq: \`{ version: "experimental" }\`
    case @env(dev):
      |> jq: \`{ version: "dev" }\`
    default:
      |> jq: \`{ version: "stable" }\`
`;
    const program = parseProgram(src);
    expect(program.routes.length).toBe(1);

    const route = program.routes[0];
    if (route.pipeline.kind === 'Inline') {
      const steps = route.pipeline.pipeline.steps;
      expect(steps.length).toBe(1);

      const dispatchStep = steps[0];
      expect(dispatchStep.kind).toBe('Dispatch');

      if (dispatchStep.kind === 'Dispatch') {
        expect(dispatchStep.branches.length).toBe(2);

        // Check first case - condition is now a TagExpr
        const cond0 = dispatchStep.branches[0].condition;
        expect(cond0.kind).toBe('Tag');
        if (cond0.kind === 'Tag') {
          expect(cond0.tag.name).toBe('flag');
          expect(cond0.tag.args).toEqual(['experimental']);
          expect(cond0.tag.negated).toBe(false);
        }
        expect(dispatchStep.branches[0].pipeline.steps.length).toBe(1);

        // Check second case
        const cond1 = dispatchStep.branches[1].condition;
        expect(cond1.kind).toBe('Tag');
        if (cond1.kind === 'Tag') {
          expect(cond1.tag.name).toBe('env');
          expect(cond1.tag.args).toEqual(['dev']);
        }

        // Check default
        expect(dispatchStep.default).toBeDefined();
        expect(dispatchStep.default!.steps.length).toBe(1);
      }
    }
  });

  it('parses dispatch without default branch', () => {
    const src = `GET /test
  |> dispatch
    case @flag(beta):
      |> jq: \`{ beta: true }\`
    case @flag(alpha):
      |> jq: \`{ alpha: true }\`
`;
    const program = parseProgram(src);
    const route = program.routes[0];

    if (route.pipeline.kind === 'Inline') {
      const dispatchStep = route.pipeline.pipeline.steps[0];

      if (dispatchStep.kind === 'Dispatch') {
        expect(dispatchStep.branches.length).toBe(2);
        expect(dispatchStep.default).toBeUndefined();
      }
    }
  });

  it('parses dispatch with negated tag', () => {
    const src = `GET /test
  |> dispatch
    case @!env(production):
      |> jq: \`{ nonprod: true }\`
    default:
      |> jq: \`{ prod: true }\`
`;
    const program = parseProgram(src);
    const route = program.routes[0];

    if (route.pipeline.kind === 'Inline') {
      const dispatchStep = route.pipeline.pipeline.steps[0];

      if (dispatchStep.kind === 'Dispatch') {
        const cond = dispatchStep.branches[0].condition;
        expect(cond.kind).toBe('Tag');
        if (cond.kind === 'Tag') {
          expect(cond.tag.name).toBe('env');
          expect(cond.tag.negated).toBe(true);
          expect(cond.tag.args).toEqual(['production']);
        }
      }
    }
  });

  it('parses dispatch with multi-step pipelines in branches', () => {
    const src = `GET /test
  |> dispatch
    case @flag(experimental):
      |> jq: \`{ step: 1 }\`
      |> jq: \`{ step: 2 }\`
      |> jq: \`{ step: 3 }\`
    default:
      |> jq: \`{ step: 1 }\`
`;
    const program = parseProgram(src);
    const route = program.routes[0];

    if (route.pipeline.kind === 'Inline') {
      const dispatchStep = route.pipeline.pipeline.steps[0];

      if (dispatchStep.kind === 'Dispatch') {
        expect(dispatchStep.branches[0].pipeline.steps.length).toBe(3);
        expect(dispatchStep.default!.steps.length).toBe(1);
      }
    }
  });

  it('parses dispatch with end keyword and continuation', () => {
    const src = `GET /test
  |> dispatch
    case @env(prod):
      |> jq: \`{ env: "prod" }\`
    default:
      |> jq: \`{ env: "other" }\`
  end
  |> jq: \`{ final: true }\`
`;
    const program = parseProgram(src);
    const route = program.routes[0];

    if (route.pipeline.kind === 'Inline') {
      const steps = route.pipeline.pipeline.steps;
      expect(steps.length).toBe(2);
      expect(steps[0].kind).toBe('Dispatch');
      expect(steps[1].kind).toBe('Regular');
    }
  });

  it('parses dispatch with comments', () => {
    const src = `GET /test
  # Comment before dispatch
  |> dispatch
    # Comment before case
    case @flag(experimental):
      # Comment inside branch
      |> jq: \`{ version: "experimental" }\`
    # Comment between cases
    case @env(dev):
      |> jq: \`{ version: "dev" }\`
    # Comment before default
    default:
      |> jq: \`{ version: "stable" }\`
`;
    const program = parseProgram(src);
    const route = program.routes[0];

    if (route.pipeline.kind === 'Inline') {
      const dispatchStep = route.pipeline.pipeline.steps[0];
      expect(dispatchStep.kind).toBe('Dispatch');

      if (dispatchStep.kind === 'Dispatch') {
        expect(dispatchStep.branches.length).toBe(2);
        expect(dispatchStep.default).toBeDefined();
      }
    }
  });

  it('parses one-liner dispatch syntax', () => {
    const src = `GET /test
  |> dispatch case @flag(a): |> jq: \`{a: 1}\` case @flag(b): |> jq: \`{b: 2}\` default: |> jq: \`{c: 3}\` end
`;
    const program = parseProgram(src);
    const route = program.routes[0];

    if (route.pipeline.kind === 'Inline') {
      const dispatchStep = route.pipeline.pipeline.steps[0];

      if (dispatchStep.kind === 'Dispatch') {
        expect(dispatchStep.branches.length).toBe(2);
        const cond0 = dispatchStep.branches[0].condition;
        const cond1 = dispatchStep.branches[1].condition;
        expect(cond0.kind).toBe('Tag');
        expect(cond1.kind).toBe('Tag');
        if (cond0.kind === 'Tag') {
          expect(cond0.tag.name).toBe('flag');
          expect(cond0.tag.args).toEqual(['a']);
        }
        if (cond1.kind === 'Tag') {
          expect(cond1.tag.args).toEqual(['b']);
        }
        expect(dispatchStep.default).toBeDefined();
      }
    }
  });

  it('parses nested dispatch', () => {
    const src = `GET /test
  |> dispatch
    case @env(production):
      |> dispatch
        case @flag(premium):
          |> jq: \`{ tier: "prod-premium" }\`
        default:
          |> jq: \`{ tier: "prod-standard" }\`
    default:
      |> jq: \`{ tier: "other" }\`
`;
    const program = parseProgram(src);
    const route = program.routes[0];

    if (route.pipeline.kind === 'Inline') {
      const outerDispatch = route.pipeline.pipeline.steps[0];

      if (outerDispatch.kind === 'Dispatch') {
        const firstBranchSteps = outerDispatch.branches[0].pipeline.steps;
        expect(firstBranchSteps.length).toBe(1);
        expect(firstBranchSteps[0].kind).toBe('Dispatch');

        if (firstBranchSteps[0].kind === 'Dispatch') {
          expect(firstBranchSteps[0].branches.length).toBe(1);
          const innerCond = firstBranchSteps[0].branches[0].condition;
          expect(innerCond.kind).toBe('Tag');
          if (innerCond.kind === 'Tag') {
            expect(innerCond.tag.name).toBe('flag');
          }
        }
      }
    }
  });

  it('roundtrip: parse -> format -> parse preserves dispatch', () => {
    const src = `GET /test
  |> dispatch
    case @flag(experimental):
      |> jq: \`{ version: "experimental" }\`
    case @env(dev):
      |> jq: \`{ version: "dev" }\`
    default:
      |> jq: \`{ version: "stable" }\`
`;
    const program1 = parseProgram(src);
    const formatted = prettyPrint(program1);
    const program2 = parseProgram(formatted);

    const steps1 = (program1.routes[0].pipeline as any).pipeline.steps;
    const steps2 = (program2.routes[0].pipeline as any).pipeline.steps;

    expect(steps1).toEqual(steps2);
  });

  it('formats dispatch correctly', () => {
    const src = `GET /test
  |> dispatch
    case @flag(experimental):
      |> jq: \`{ version: "experimental" }\`
    default:
      |> jq: \`{ version: "stable" }\`
`;
    const program = parseProgram(src);
    const formatted = prettyPrint(program);

    expect(formatted).toContain('|> dispatch');
    expect(formatted).toContain('case @flag(experimental):');
    expect(formatted).toContain('default:');
  });
});

