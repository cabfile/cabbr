const ALLOWED_IMPORTS = new Set([
	'worker_threads',
	'node:worker_threads',
	'events',
	'node:events'
]);
export function resolve(specifier, context, nextResolve) {
	if (context.parentURL !== undefined) {
		if(ALLOWED_IMPORTS.has(specifier)) return nextResolve(specifier, context, nextResolve);
		throw new Error("import() is forbidden");
	}
	return nextResolve(specifier, context, nextResolve);
}