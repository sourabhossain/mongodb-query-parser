module.exports = {
    env: {
        node: true
    },
    extends: [
        'eslint:recommended',
        'plugin:node/recommended'
    ],
    plugins: ['node'],
    parserOptions: {
        ecmaVersion: 12
    },
    rules: {
        'node/no-missing-import': 'off'
    }
};
