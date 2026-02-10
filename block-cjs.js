const Module = require('module');
const originalLoad = Module._load;
const ALLOWED_MODULES = new Set(['worker_threads','events']);
Module._load = function (request, parent, isMain) {
	if (isMain || ALLOWED_MODULES.has(request)) return originalLoad.apply(this, arguments);
	throw new Error("require() is forbidden");
};