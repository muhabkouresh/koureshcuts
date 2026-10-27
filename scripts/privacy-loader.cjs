/* eslint-disable @typescript-eslint/no-require-imports -- Standalone maintenance/test loader; server-only is a Next build-time guard. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
module.exports = function privacyLoader(root = path.resolve(__dirname, '..'), mocks = {}) {
  const native = createRequire(path.join(root, 'package.json'));
  const ts = native('typescript'); const cache = new Map();
  function load(file) {
    if (!path.extname(file)) file += '.ts';
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    new vm.Script(output, { filename: file }).runInNewContext({ module: mod, exports: mod.exports, process, Buffer, console, URL, URLSearchParams, Request, Response, AbortController, setTimeout, clearTimeout,
      require: name => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name === 'server-only') return {};
        if (name.startsWith('@/')) return load(path.join('src', name.slice(2)));
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
        return native(name);
      },
    }); return mod.exports;
  }
  return load;
};
