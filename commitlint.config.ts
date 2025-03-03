import type { UserConfig } from '@commitlint/types';
import { RuleConfigSeverity } from '@commitlint/types';

const Configuration: UserConfig = {

    extends: ['@commitlint/config-conventional'],
    parserPreset: 'conventional-changelog-atom',
    formatter: '@commitlint/format',
    rules: {
        'type-enum': [
            RuleConfigSeverity.Error,
            'always',
            [
                'docs',
                'feat',
                'fix',
                'perf',
                'refactor',
                'revert',
                'style',
                'test',
                'release',
                'license',
            ],
        ],
        'scope-case': [RuleConfigSeverity.Error, 'always', 'lower-case'],
        'subject-max-length': [RuleConfigSeverity.Error, 'always', 100],
        'validate-scope': [RuleConfigSeverity.Error, 'always'],
    },
    plugins: [
        {
            rules: {
                'validate-scope': c => {
                    // Allow empty scopes for CI and Release types
                    if (!c.scope) return [['release', 'license'].includes(c.type), 'scope must be provided']

                    const allowedScopes = ['arkitect', 'demohouse/*'];
                
                    // 正则校验：arkitect 或 demohouse/ 开头
                    const isValid = /^(arkitect|demohouse\/.+)$/.test(c.scope);
                    return [isValid, `Scope must be one of ${allowedScopes.join(', ')}`];
                },
            }
        }
    ],
    helpUrl: 'https://github.com/volcengine/ai-app-lab/blob/main/docs/commitlint.md',
};

export default Configuration;
