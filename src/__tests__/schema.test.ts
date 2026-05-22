import { describe, expect, it, vi } from 'vitest';
import { ensureSchema } from '../schema.js';

describe('ensureSchema', () => {
	it('runs schema initialization only once per database instance', async () => {
		const run = vi.fn(async () => undefined);
		const prepare = vi.fn(() => ({ run }));
		const db = { prepare } as unknown as D1Database;

		await Promise.all([
			ensureSchema(db),
			ensureSchema(db),
			ensureSchema(db),
		]);

		const prepareCallsAfterFirstInit = prepare.mock.calls.length;
		expect(prepareCallsAfterFirstInit).toBeGreaterThan(0);

		await ensureSchema(db);

		expect(prepare).toHaveBeenCalledTimes(prepareCallsAfterFirstInit);
	});

	it('retries initialization after a failure', async () => {
		let fail = true;
		const run = vi.fn(async () => {
			if (fail) {
				fail = false;
				throw new Error('boom');
			}
		});
		const prepare = vi.fn(() => ({ run }));
		const db = { prepare } as unknown as D1Database;

		await expect(ensureSchema(db)).rejects.toThrow('boom');

		const prepareCallsAfterFailure = prepare.mock.calls.length;

		await ensureSchema(db);

		expect(prepare.mock.calls.length).toBeGreaterThan(prepareCallsAfterFailure);
	});
});
