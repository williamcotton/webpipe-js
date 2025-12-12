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
    resolvers: TypeResolver[];
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
    start: number;
    end: number;
}
interface ConfigProperty {
    key: string;
    value: ConfigValue;
    start: number;
    end: number;
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
    start: number;
    end: number;
}
interface Variable {
    varType: string;
    name: string;
    value: string;
    lineNumber?: number;
    inlineComment?: Comment;
    start: number;
    end: number;
}
interface GraphQLSchema {
    sdl: string;
    lineNumber?: number;
    inlineComment?: Comment;
    start: number;
    end: number;
}
interface QueryResolver {
    name: string;
    pipeline: Pipeline;
    lineNumber?: number;
    inlineComment?: Comment;
    start: number;
    end: number;
}
interface MutationResolver {
    name: string;
    pipeline: Pipeline;
    lineNumber?: number;
    inlineComment?: Comment;
    start: number;
    end: number;
}
interface TypeResolver {
    typeName: string;
    fieldName: string;
    pipeline: Pipeline;
    lineNumber?: number;
    inlineComment?: Comment;
    start: number;
    end: number;
}
interface Route {
    method: string;
    path: string;
    pipeline: PipelineRef;
    lineNumber?: number;
    inlineComment?: Comment;
    start: number;
    end: number;
}
type PipelineRef = {
    kind: 'Inline';
    pipeline: Pipeline;
    start: number;
    end: number;
} | {
    kind: 'Named';
    name: string;
    start: number;
    end: number;
};
interface Pipeline {
    steps: PipelineStep[];
    start: number;
    end: number;
}
type ConfigType = 'backtick' | 'quoted' | 'identifier';
type LetValueFormat = 'quoted' | 'backtick' | 'bare';
interface LetVariable {
    name: string;
    value: string;
    format: LetValueFormat;
    start: number;
    end: number;
    fullStart: number;
    fullEnd: number;
}
interface Tag {
    name: string;
    negated: boolean;
    args: string[];
    start: number;
    end: number;
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
    args: string[];
    config: string;
    configType: ConfigType;
    configStart?: number;
    configEnd?: number;
    condition?: TagExpr;
    parsedJoinTargets?: string[];
    start: number;
    end: number;
} | {
    kind: 'Result';
    branches: ResultBranch[];
    start: number;
    end: number;
} | {
    kind: 'If';
    condition: Pipeline;
    thenBranch: Pipeline;
    elseBranch?: Pipeline;
    start: number;
    end: number;
} | {
    kind: 'Dispatch';
    branches: DispatchBranch[];
    default?: Pipeline;
    start: number;
    end: number;
} | {
    kind: 'Foreach';
    selector: string;
    pipeline: Pipeline;
    start: number;
    end: number;
};
interface DispatchBranch {
    condition: TagExpr;
    pipeline: Pipeline;
    start: number;
    end: number;
}
interface ResultBranch {
    branchType: ResultBranchType;
    statusCode: number;
    pipeline: Pipeline;
    start: number;
    end: number;
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
    variables: LetVariable[];
    mocks: Mock[];
    tests: It[];
    lineNumber?: number;
    inlineComment?: Comment;
    start: number;
    end: number;
}
interface Mock {
    target: string;
    returnValue: string;
    start: number;
    end: number;
}
interface It {
    name: string;
    mocks: Mock[];
    when: When;
    variables?: LetVariable[];
    input?: string;
    body?: string;
    headers?: string;
    cookies?: string;
    conditions: Condition[];
    start: number;
    end: number;
}
type When = {
    kind: 'CallingRoute';
    method: string;
    path: string;
    start: number;
    end: number;
} | {
    kind: 'ExecutingPipeline';
    name: string;
    start: number;
    end: number;
} | {
    kind: 'ExecutingVariable';
    varType: string;
    name: string;
    start: number;
    end: number;
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
    start: number;
    end: number;
}
type DiagnosticSeverity = 'error' | 'warning' | 'info';
interface ParseDiagnostic {
    message: string;
    start: number;
    end: number;
    severity: DiagnosticSeverity;
}
interface TestLetVariable {
    name: string;
    describeName: string;
    testName?: string;
    start: number;
    end: number;
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
declare function getTestLetVariables(text: string): TestLetVariable[];
declare function getTestLetVariableRanges(text: string): Map<string, {
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
declare function printTypeResolver(resolver: TypeResolver): string;
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

export { type Comment, type Condition, type Config, type ConfigProperty, type ConfigType, type ConfigValue, type Describe, type DiagnosticSeverity, type DispatchBranch, type DomAssertType, type GraphQLSchema, type It, type LetValueFormat, type LetVariable, type Mock, type MutationResolver, type NamedPipeline, type ParseDiagnostic, type Pipeline, type PipelineRef, type PipelineStep, type Program, type QueryResolver, type ResultBranch, type ResultBranchType, type Route, type Tag, type TagExpr, type TestLetVariable, type TypeResolver, type Variable, type When, formatConfigValue, formatPipelineRef, formatPipelineStep, formatStepConfig, formatTag, formatTagExpr, formatTags, formatWhen, getPipelineRanges, getTestLetVariableRanges, getTestLetVariables, getVariableRanges, parseProgram, parseProgramWithDiagnostics, prettyPrint, printComment, printCondition, printConfig, printDescribe, printGraphQLSchema, printMock, printMutationResolver, printPipeline, printQueryResolver, printRoute, printTest, printTypeResolver, printVariable };
