interface Program {
    configs: Config[];
    pipelines: NamedPipeline[];
    variables: Variable[];
    routes: Route[];
    describes: Describe[];
}
interface Config {
    name: string;
    properties: ConfigProperty[];
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
}
interface Variable {
    varType: string;
    name: string;
    value: string;
}
interface Route {
    method: string;
    path: string;
    pipeline: PipelineRef;
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
type PipelineStep = {
    kind: 'Regular';
    name: string;
    config: string;
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

export { type Condition, type Config, type ConfigProperty, type ConfigValue, type Describe, type DiagnosticSeverity, type It, type Mock, type NamedPipeline, type ParseDiagnostic, type Pipeline, type PipelineRef, type PipelineStep, type Program, type ResultBranch, type ResultBranchType, type Route, type Variable, type When, getPipelineRanges, getVariableRanges, parseProgram, parseProgramWithDiagnostics };
