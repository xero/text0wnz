import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import html from "@html-eslint/eslint-plugin";
import parser from '@html-eslint/parser';

export default [
	js.configs.recommended,
	{
		plugins: {
			'@stylistic': stylistic,
		},
		files: [
			'src/*.js',
			'src/js/**/*.js',
			'tests/**/*.js',
		],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				// Unrecognized browser environment / APIs
				AbortController: 'readonly',
				Blob: 'readonly',
				CustomEvent: 'readonly',
				File: 'readonly',
				FileReader: 'readonly',
				Image: 'readonly',
				MouseEvent: 'readonly',
				Notification: 'readonly',
				Request: 'readonly',
				Response: 'readonly',
				TextEncoder: 'readonly',
				URL: 'readonly',
				Uint16Array: 'readonly',
				Uint32Array: 'readonly',
				Uint8Array: 'readonly',
				WebSocket: 'readonly',
				Worker: 'readonly',
				alert: 'readonly',
				atob: 'readonly',
				btoa: 'readonly',
				caches: 'readonly',
				cancelAnimationFrame: 'readonly',
				clearInterval: 'readonly',
				clearTimeout: 'readonly',
				confirm: 'readonly',
				console: 'readonly',
				crypto: 'readonly',
				document: 'readonly',
				existsSync: 'readonly',
				indexedDB: 'readonly',
				localStorage: 'readonly',
				mkdirSync: 'readonly',
				navigator: 'readonly',
				performance: 'readonly',
				process: 'readonly',
				requestAnimationFrame: 'readonly',
				requestIdleCallback: 'readonly',
				self: 'readonly',
				setInterval: 'readonly',
				setTimeout: 'readonly',
				window: 'readonly',
				// vitest / jsdom
				Buffer: 'readonly',
				beforeEach: 'readonly',
				Event: 'readonly',
				global: 'readonly',
				HTMLElement: 'readonly',
				KeyboardEvent: 'readonly',
			}
		},
		rules: {
			// Modernization Rules
			'prefer-const': 'warn',
			'no-var': 'warn',
			'prefer-arrow-callback': ['error'],

			// Code Quality
			'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
			'no-console': 'off',
			'no-undef': 'error',
			'no-redeclare': 'error',
			'no-unreachable': 'error',

			// Best Practices
			'eqeqeq': ['error', 'always'],
			'curly': ['error', 'all'],
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error',

			// Style
			'@stylistic/quotes': ['error', 'single', {
				'allowTemplateLiterals': 'always',
			}],
			'@stylistic/indent': ['error', 'tab', {
				'VariableDeclarator': { 'var': 2, 'let': 2, 'const': 3, 'using': 'first' },
				'FunctionDeclaration': { 'body': 1, 'parameters': 2, 'returnType': 1 },
				'CallExpression': { 'arguments': 'first' },
				'ArrayExpression': 'first',
				'ObjectExpression': 'first',
				'ImportDeclaration': 'first',
				'offsetTernaryExpressions': true,
				'assignmentOperator': 1,
				'StaticBlock': { 'body': 1 },
				'ignoreComments': true,
				'SwitchCase': 1,
				'outerIIFEBody': 'off',
				'MemberExpression': 1,
			}],
			'@stylistic/array-bracket-newline': ['error', {
				'multiline': true,
			}],
			'@stylistic/array-bracket-spacing': ['error', 'never'],
			'@stylistic/arrow-parens': [2, 'as-needed'],
			'@stylistic/arrow-spacing': ['error', {
				'before': true,
				'after': true,
			}],
			'@stylistic/comma-dangle': ['error', 'always-multiline'],
			'@stylistic/comma-spacing': ['error', {
				'before': false,
				'after': true,
			}],
			'@stylistic/comma-style': ['error', 'last'],
			'@stylistic/computed-property-spacing': ['error', 'never', {
				'enforceForClassMembers': true,
			}],
			'@stylistic/eol-last': ['error', 'always'],
			'@stylistic/function-call-spacing': ['error', 'never'],
			'@stylistic/function-paren-newline': ['error', 'multiline-arguments'],
			'@stylistic/indent-binary-ops': ['error', 2],
			'@stylistic/key-spacing': [2, {
				'singleLine': {
					'beforeColon': false,
					'afterColon': true
				},
				'multiLine': {
					'beforeColon': false,
					'afterColon': true,
				}
			}],
			'@stylistic/keyword-spacing': ['error', { 'before': true }],
			'@stylistic/linebreak-style': ['error', 'unix'],
			'@stylistic/lines-between-class-members': ['error', 'always', {
				'exceptAfterOverload': true,
			}],
			'@stylistic/member-delimiter-style': 'error',
			'@stylistic/new-parens': 'error',
			'@stylistic/newline-per-chained-call': ['error', {
				'ignoreChainWithDepth': 3,
			}],
			'@stylistic/no-confusing-arrow': ['error', {
				'onlyOneSimpleParam': true,
			}],
			'@stylistic/no-extra-parens': ['error', 'functions'],
			'@stylistic/no-extra-semi': 'error',
			'@stylistic/no-floating-decimal': 'error',
			'@stylistic/no-mixed-spaces-and-tabs': ['error', "smart-tabs"],
			'@stylistic/no-multi-spaces': ['error', {
				exceptions: { 'VariableDeclarator': true, },
				ignoreEOLComments: true,
			}],
			'@stylistic/no-multiple-empty-lines': 'error',
			'@stylistic/no-trailing-spaces': 'error',
			'@stylistic/no-whitespace-before-property': 'error',
			'@stylistic/nonblock-statement-body-position': ['error', 'beside'],
			'@stylistic/object-curly-newline': ['error', {
				'multiline': true,
			}],
			'@stylistic/object-curly-spacing': ['error', 'always', {
				'arraysInObjects': false,
			}],
			'@stylistic/object-property-newline': ['error', {
				'allowAllPropertiesOnSameLine': true,
			}],
			'@stylistic/one-var-declaration-per-line': ['error', 'initializations'],
			'@stylistic/padded-blocks': ['error', 'never'],
			'@stylistic/quote-props': ['error', 'consistent-as-needed'],
			'@stylistic/rest-spread-spacing': ['error', 'never'],
			'@stylistic/semi': ['error', 'always', {
				'omitLastInOneLineClassBody': true,
			}],
			'@stylistic/semi-spacing': ['error', {
				'before': false,
				'after': true,
			}],
			'@stylistic/semi-style': ['error', 'last'],
			'@stylistic/space-before-blocks': 'error',
			'@stylistic/space-before-function-paren': ['error', {
				"anonymous": "always",
				"asyncArrow": "always",
				"named": "never"
			}],
			'@stylistic/space-in-parens': ['error', 'never'],
			'@stylistic/space-infix-ops': ['error', {
				'ignoreTypes': true,
			}],
			'@stylistic/space-unary-ops': ['error', {
				'words': true,
				'nonwords': false,
			}],
			'@stylistic/spaced-comment': ['error', 'always', {
				'exceptions': ['-', '*'],
			}],
			'@stylistic/switch-colon-spacing': ['error', {
				'after': true,
				'before': false,
			}],
			'@stylistic/template-curly-spacing': 'error',
			'@stylistic/template-tag-spacing': ['error', 'always'],
			'@stylistic/wrap-iife': ['error', 'inside'],
			'@stylistic/wrap-regex': 'error',
			'@stylistic/yield-star-spacing': ['error', 'after'],

			//typescript
			'@stylistic/type-annotation-spacing': 'error',
			'@stylistic/type-generic-spacing': ['error'],
			'@stylistic/type-named-tuple-spacing': ['error'],
		}
	},
	{
		files: ["src/*.html"],
		plugins: {
			html,
		},
		languageOptions: {
			parser: parser,
		},
		rules: {
			...html.configs.recommended.rules,
			"html/use-baseline": "off",
			"html/attrs-newline": "off",
			"html/element-newline": ["error", {
				"inline": ["$inline", 'canvas']
			}],
			"html/no-duplicate-class": "error",
			"html/no-duplicate-attrs": "error",
			"html/no-duplicate-id": "error",
			"html/no-inline-styles": "error",
			"html/no-obsolete-tags": "error",
			"html/indent": ["error", "tab"],
			"html/lowercase": "error",
			"html/no-extra-spacing-attrs": "error",
			"html/quotes": ["error", "double"],
			"html/no-trailing-spaces": "error",
			"html/require-closing-tags": ["error", {
				"selfClosing": "always",
				"selfClosingCustomPatterns": ['meta', 'link'],
			}],
			"html/sort-attrs": ["error", {
				"priority": [
					"id",
					"class",
					"rel",
					"type",
					"http-equiv",
					"title",
					"alt",
					"name",
					'aria-label',
					'property',
					"content",
					"size",
					"sizes",
					"cols",
					"row",
					"value",
					"href",
				]
			}],
		}
	},
	{
		// Skip linting entirely for dist files
		files: ['dist/**/*.*'],
		rules: {
			'no-console': 'off',
			'no-unused-vars': 'off',
			'no-undef': 'off'
		}
	}
];
