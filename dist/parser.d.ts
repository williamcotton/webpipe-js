export type Program = {
    configs: Config[];
    pipelines: NamedPipeline[];
    variables: Variable[];
    routes: Route[];
    describes: Describe[];
};
export type Config = {
    name: string;
    properties: ConfigProperty[];
};
export type ConfigProperty = {
    key: string;
    value: ConfigValue;
};
export type ConfigValue = {
    kind: "String";
    value: string;
} | {
    kind: "EnvVar";
    var: string;
    default?: string;
} | {
    kind: "Boolean";
    value: boolean;
} | {
    kind: "Number";
    value: number;
};
export type NamedPipeline = {
    name: string;
    pipeline: Pipeline;
};
export type Variable = {
    var_type: string;
    name: string;
    value: string;
};
export type Route = {
    method: string;
    path: string;
    pipeline: PipelineRef;
};
export type PipelineRef = {
    type: "Inline";
    pipeline: Pipeline;
} | {
    type: "Named";
    name: string;
};
export type Pipeline = {
    steps: PipelineStep[];
};
export type PipelineStep = {
    type: "Regular";
    name: string;
    config: string;
} | {
    type: "Result";
    branches: ResultBranch[];
};
export type ResultBranch = {
    branch_type: ResultBranchType;
    status_code: number;
    pipeline: Pipeline;
};
export type ResultBranchType = {
    type: "Ok";
} | {
    type: "Custom";
    name: string;
} | {
    type: "Default";
};
export type Describe = {
    name: string;
    mocks: Mock[];
    tests: It[];
};
export type Mock = {
    target: string;
    return_value: string;
};
export type It = {
    name: string;
    mocks: Mock[];
    when: When;
    input?: string;
    conditions: Condition[];
};
export type When = {
    type: "CallingRoute";
    method: string;
    path: string;
} | {
    type: "ExecutingPipeline";
    name: string;
} | {
    type: "ExecutingVariable";
    var_type: string;
    name: string;
};
export type Condition = {
    condition_type: "then" | "and";
    field: string;
    jq_expr?: string;
    comparison: string;
    value: string;
};
export declare function parseProgram(src: string): Program;
