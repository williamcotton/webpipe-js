export interface Program {
    configs: Config[];
    pipelines: NamedPipeline[];
    variables: Variable[];
    routes: Route[];
    describes: Describe[];
}
export interface Config {
    name: string;
    properties: ConfigProperty[];
}
export interface ConfigProperty {
    key: string;
    value: ConfigValue;
}
export type ConfigValue = {
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
export interface NamedPipeline {
    name: string;
    pipeline: Pipeline;
}
export interface Variable {
    varType: string;
    name: string;
    value: string;
}
export interface Route {
    method: string;
    path: string;
    pipeline: PipelineRef;
}
export type PipelineRef = {
    kind: 'Inline';
    pipeline: Pipeline;
} | {
    kind: 'Named';
    name: string;
};
export interface Pipeline {
    steps: PipelineStep[];
}
export type PipelineStep = {
    kind: 'Regular';
    name: string;
    config: string;
} | {
    kind: 'Result';
    branches: ResultBranch[];
};
export interface ResultBranch {
    branchType: ResultBranchType;
    statusCode: number;
    pipeline: Pipeline;
}
export type ResultBranchType = {
    kind: 'Ok';
} | {
    kind: 'Custom';
    name: string;
} | {
    kind: 'Default';
};
export interface Describe {
    name: string;
    mocks: Mock[];
    tests: It[];
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
export type When = {
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
export declare function parseProgram(text: string): Program;
export declare function parseProgramWithDiagnostics(text: string): {
    program: Program;
    diagnostics: ParseDiagnostic[];
};
export declare function getPipelineRanges(text: string): Map<string, {
    start: number;
    end: number;
}>;
export declare function getVariableRanges(text: string): Map<string, {
    start: number;
    end: number;
}>;
