import { App } from 'obsidian';
import JsEnginePlugin from '../main';
import { ExecutionArgument, ExecutionContext } from '../ArgumentManager';
import { MessageType, MessageWrapper } from '../messages/MessageManager';
import { API } from '../api/API';
import { InstanceId, InstanceType } from '../api/InstanceId';

const AsyncFunction = async function (): Promise<void> {}.constructor;

export class JsExecution {
	readonly app: App;
	readonly plugin: JsEnginePlugin;

	uuid: string;
	code: string;
	args: ExecutionArgument[];
	context: ExecutionContext | undefined;
	apiInstance: API;

	func: ((...args: any[]) => Promise<unknown>) | undefined;
	result: unknown | undefined;

	functionBuildError: Error | undefined;
	functionRunError: Error | undefined;

	functionBuildTime: number | undefined;
	functionRunTime: number | undefined;

	constructor(app: App, plugin: JsEnginePlugin, code: string, args: ExecutionArgument[], context?: ExecutionContext) {
		this.app = app;
		this.plugin = plugin;

		this.code = code;
		this.context = context;

		this.uuid = self.crypto.randomUUID();
		this.apiInstance = new API(this.app, this.plugin, new InstanceId(InstanceType.JS_EXECUTION, this.uuid));

		this.func = undefined;

		this.args = [
			{
				key: 'app',
				value: this.app,
			},
			{
				key: 'engine',
				value: this.apiInstance,
			},
			{
				key: 'context',
				value: this.context,
			},
			...args,
		];
	}

	buildFunction(): void {
		const startTime = performance.now();

		try {
			this.func = AsyncFunction(...this.args.map(x => x.key), this.code);
		} catch (e) {
			if (e instanceof Error) {
				this.functionBuildError = e;

				this.result = this.plugin.api?.message.createMessage(MessageType.ERROR, 'Failed to parse JS', `Failed to parse JS during execution "${this.uuid}"`, e.stack);
			}
		}

		this.functionBuildTime = performance.now() - startTime;
	}

	async runFunction(): Promise<void> {
		if (this.functionBuildError) {
			throw new Error('can not run function, function construction failed');
		}

		if (!this.func) {
			throw new Error('can not run function, function has not been constructed yet');
		}

		const startTime = performance.now();

		try {
			this.result = await Promise.resolve(this.func(...this.args.map(x => x.value)));
		} catch (e) {
			if (e instanceof Error) {
				this.functionRunError = e;

				this.result = this.apiInstance.message.createMessage(MessageType.ERROR, 'Failed to execute JS', `Failed to execute JS during execution "${this.uuid}"`, e.stack);
			}
		}

		this.functionRunTime = performance.now() - startTime;
	}

	isSuccessful(): boolean {
		return !this.functionBuildError && !this.functionRunError;
	}

	getMessages(): MessageWrapper[] {
		return this.plugin.messageManager.getMessagesFromSource(this.apiInstance.instanceId);
	}

	openStatsModal(): void {
		this.plugin.jsEngine.openExecutionStatsModal(this);
	}
}
