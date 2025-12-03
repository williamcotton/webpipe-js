interface Program {
    configs: Config[];
    pipelines: NamedPipeline[];
    variables: Variable[];
    routes: Route[];
    describes: Describe[];
    comments: Comment[];
    graphqlSchema?: GraphQLSchema;
    queries: QueryResolver[];
    mutations: MutationResolver[];
    featureFlags?: Pipeline;
}
interface Comment {
    type: 'standalone' | 'inline';
    text: string;
    style: '#' | '//';
    lineNumber?: number;
}
interface Config {
    name: string;
    properties: ConfigProperty[];
    lineNumber?: number;
    inlineComment?: Comment;
}
interface ConfigProperty {
    key: string;
    value: ConfigValue;
}
type ConfigValue = {
    kind: 'String';
    value: string;
} | {
    kind: 'EnvVar';
    var: string;
    default?: string;
} | {
    kind: 'Boolean';
    value: boolean;
} | {
    kind: 'Number';
    value: number;
};
interface NamedPipeline {
    name: string;
    pipeline: Pipeline;
    lineNumber?: number;
    inlineComment?: Comment;
}
interface Variable {
    varType: string;
    name: string;
    value: string;
    lineNumber?: number;
    inlineComment?: Comment;
}
interface GraphQLSchema {
    sdl: string;
    lineNumber?: number;
    inlineComment?: Comment;
}
interface QueryResolver {
    name: string;
    pipeline: Pipeline;
    lineNumber?: number;
    inlineComment?: Comment;
}
interface MutationResolver {
    name: string;
    pipeline: Pipeline;
    lineNumber?: number;
    inlineComment?: Comment;
}
interface Route {
    method: string;
    path: string;
    pipeline: PipelineRef;
    lineNumber?: number;
    inlineComment?: Comment;
}
type PipelineRef = {
    kind: 'Inline';
    pipeline: Pipeline;
} | {
    kind: 'Named';
    name: string;
};
interface Pipeline {
    steps: PipelineStep[];
}
type ConfigType = 'backtick' | 'quoted' | 'identifier';
interface Tag {
    name: string;
    negated: boolean;
    args: string[];
}
/** A boolean expression of tags for dispatch routing */
type TagExpr = {
    kind: 'Tag';
    tag: Tag;
} | {
    kind: 'And';
    left: TagExpr;
    right: TagExpr;
} | {
    kind: 'Or';
    left: TagExpr;
    right: TagExpr;
};
type PipelineStep = {
    kind: 'Regular';
    name: string;
    config: string;
    configType: ConfigType;
    condition?: TagExpr;
    parsedJoinTargets?: string[];
} | {
    kind: 'Result';
    branches: ResultBranch[];
} | {
    kind: 'If';
    condition: Pipeline;
    thenBranch: Pipeline;
    elseBranch?: Pipeline;
} | {
    kind: 'Dispatch';
    branches: DispatchBranch[];
    default?: Pipeline;
} | {
    kind: 'Foreach';
    selector: string;
    pipeline: Pipeline;
};
interface DispatchBranch {
    condition: TagExpr;
    pipeline: Pipeline;
}
interface ResultBranch {
    branchType: ResultBranchType;
    statusCode: number;
    pipeline: Pipeline;
}
type ResultBranchType = {
    kind: 'Ok';
} | {
    kind: 'Custom';
    name: string;
} | {
    kind: 'Default';
};
interface Describe {
    name: string;
    mocks: Mock[];
    tests: It[];
    lineNumber?: number;
    inlineComment?: Comment;
}
interface Mock {
    target: string;
    returnValue: string;
}
interface It {
    name: string;
    mocks: Mock[];
    when: When;
    input?: string;
    body?: string;
    headers?: string;
    cookies?: string;
    conditions: Condition[];
}
type When = {
    kind: 'CallingRoute';
    method: string;
    path: string;
} | {
    kind: 'ExecutingPipeline';
    name: string;
} | {
    kind: 'ExecutingVariable';
    varType: string;
    name: string;
};
type DomAssertType = {
    kind: 'Exists';
} | {
    kind: 'Text';
} | {
    kind: 'Count';
} | {
    kind: 'Attribute';
    name: string;
};
interface Condition {
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
}
type DiagnosticSeverity = 'error' | 'warning' | 'info';
interface ParseDiagnostic {
    message: string;
    start: number;
    end: number;
    severity: DiagnosticSeverity;
}
declare function parseProgram(text: string): Program;
declare function parseProgramWithDiagnostics(text: string): {
    program: Program;
    diagnostics: ParseDiagnostic[];
};
declare function getPipelineRanges(text: string): Map<string, {
    start: number;
    end: number;
}>;
declare function getVariableRanges(text: string): Map<string, {
    start: number;
    end: number;
}>;
declare function printRoute(route: Route): string;
declare function printConfig(config: Config): string;
declare function printPipeline(pipeline: NamedPipeline): string;
declare function printVariable(variable: Variable): string;
declare function printGraphQLSchema(schema: GraphQLSchema): string;
declare function printQueryResolver(query: QueryResolver): string;
declare function printMutationResolver(mutation: MutationResolver): string;
declare function printMock(mock: Mock, indent?: string): string;
declare function printCondition(condition: Condition, indent?: string): string;
declare function printTest(test: It): string;
declare function printComment(comment: Comment): string;
declare function printDescribe(describe: Describe): string;
declare function prettyPrint(program: Program): string;
declare function formatConfigValue(value: ConfigValue): string;
declare function formatPipelineStep(step: PipelineStep, indent?: string): string;
declare function formatStepConfig(config: string, configType: ConfigType): string;
declare function formatTags(tags: Tag[]): string;
declare function formatTag(tag: Tag): string;
declare function formatTagExpr(expr: TagExpr): string;
declare function formatPipelineRef(ref: PipelineRef): string[];
declare function formatWhen(when: When): string;

export { type Comment, type Condition, type Config, type ConfigProperty, type ConfigType, type ConfigValue, type Describe, type DiagnosticSeverity, type DispatchBranch, type DomAssertType, type GraphQLSchema, type It, type Mock, type MutationResolver, type NamedPipeline, type ParseDiagnostic, type Pipeline, type PipelineRef, type PipelineStep, type Program, type QueryResolver, type ResultBranch, type ResultBranchType, type Route, type Tag, type TagExpr, type Variable, type When, formatConfigValue, formatPipelineRef, formatPipelineStep, formatStepConfig, formatTag, formatTagExpr, formatTags, formatWhen, getPipelineRanges, getVariableRanges, parseProgram, parseProgramWithDiagnostics, prettyPrint, printComment, printCondition, printConfig, printDescribe, printGraphQLSchema, printMock, printMutationResolver, printPipeline, printQueryResolver, printRoute, printTest, printVariable };
