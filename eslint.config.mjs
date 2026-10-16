import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import accessibility from 'eslint-plugin-jsx-a11y';
export default tseslint.config(
 {ignores:['.next/**','node_modules/**','.p0-local/**','.superpowers/**','coverage/**','next-env.d.ts']},
 ...tseslint.configs.recommended,
 {files:['**/*.tsx'],plugins:{'react-hooks':hooks,'jsx-a11y':accessibility},
  rules:{'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn',...accessibility.configs.recommended.rules}},
 {rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}]}},
 {files:['**/*.mjs'],rules:{'@typescript-eslint/no-require-imports':'off'}}
);
