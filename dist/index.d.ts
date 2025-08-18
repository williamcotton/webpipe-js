interface Program {
    configs: Config[];
    pipelines: NamedPipeline[];
    variables: Variable[];
    routes: Route[];
    describes: Describe[];
    comments: Comment[];
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
type PipelineStep = {
    kind: 'Regular';
    name: string;
    config: string;
    configType: ConfigType;
} | {
    kind: 'Result';
    branches: ResultBranch[];
};
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
interface Condition {
    conditionType: 'Then' | 'And';
    field: string;
    jqExpr?: string;
    comparison: string;
    value: string;
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
declare function printMock(mock: Mock, indent?: string): string;
declare function printCondition(condition: Condition, indent?: string): string;
declare function printTest(test: It): string;
declare function printComment(comment: Comment): string;
declare function printDescribe(describe: Describe): string;
declare function prettyPrint(program: Program): string;
declare function formatConfigValue(value: ConfigValue): string;
declare function formatPipelineStep(step: PipelineStep, indent?: string): string;
declare function formatStepConfig(config: string, configType: ConfigType): string;
declare function formatPipelineRef(ref: PipelineRef): string[];
declare function formatWhen(when: When): string;

export { type Comment, type Condition, type Config, type ConfigProperty, type ConfigType, type ConfigValue, type Describe, type DiagnosticSeverity, type It, type Mock, type NamedPipeline, type ParseDiagnostic, type Pipeline, type PipelineRef, type PipelineStep, type Program, type ResultBranch, type ResultBranchType, type Route, type Variable, type When, formatConfigValue, formatPipelineRef, formatPipelineStep, formatStepConfig, formatWhen, getPipelineRanges, getVariableRanges, parseProgram, parseProgramWithDiagnostics, prettyPrint, printComment, printCondition, printConfig, printDescribe, printMock, printPipeline, printRoute, printTest, printVariable };
