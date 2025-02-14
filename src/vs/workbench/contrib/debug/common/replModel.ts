/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import severity from 'vs/base/common/severity';
import { isObject, isString } from 'vs/base/common/types';
import { generateUuid } from 'vs/base/common/uuid';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDebugConfiguration, IDebugSession, IExpression, IReplElement, IReplElementSource, IStackFrame } from 'vs/workbench/contrib/debug/common/debug';
import { ExpressionContainer } from 'vs/workbench/contrib/debug/common/debugModel';

const MAX_REPL_LENGTH = 10000;
let topReplElementCounter = 0;
const getUniqueId = () => `topReplElement:${topReplElementCounter++}`;

export class SimpleReplElement implements IReplElement {

	private _count = 1;
	private _onDidChangeCount = new Emitter<void>();

	constructor(
		public session: IDebugSession,
		private id: string,
		public value: string,
		public severity: severity,
		public sourceData?: IReplElementSource,
	) { }

	toString(includeSource = false): string {
		let valueRespectCount = this.value;
		for (let i = 1; i < this.count; i++) {
			valueRespectCount += (valueRespectCount.endsWith('\n') ? '' : '\n') + this.value;
		}
		const sourceStr = (this.sourceData && includeSource) ? ` ${this.sourceData.source.name}` : '';
		return valueRespectCount + sourceStr;
	}

	getId(): string {
		return this.id;
	}

	set count(value: number) {
		this._count = value;
		this._onDidChangeCount.fire();
	}

	get count(): number {
		return this._count;
	}

	get onDidChangeCount(): Event<void> {
		return this._onDidChangeCount.event;
	}
}

export class RawObjectReplElement implements IExpression {

	private static readonly MAX_CHILDREN = 1000; // upper bound of children per value

	constructor(private id: string, public name: string, public valueObj: any, public sourceData?: IReplElementSource, public annotation?: string) { }

	getId(): string {
		return this.id;
	}

	get value(): string {
		if (this.valueObj === null) {
			return 'null';
		} else if (Array.isArray(this.valueObj)) {
			return `Array[${this.valueObj.length}]`;
		} else if (isObject(this.valueObj)) {
			return 'Object';
		} else if (isString(this.valueObj)) {
			return `"${this.valueObj}"`;
		}

		return String(this.valueObj) || '';
	}

	get hasChildren(): boolean {
		return (Array.isArray(this.valueObj) && this.valueObj.length > 0) || (isObject(this.valueObj) && Object.getOwnPropertyNames(this.valueObj).length > 0);
	}

	evaluateLazy(): Promise<void> {
		throw new Error('Method not implemented.');
	}

	getChildren(): Promise<IExpression[]> {
		let result: IExpression[] = [];
		if (Array.isArray(this.valueObj)) {
			result = (<any[]>this.valueObj).slice(0, RawObjectReplElement.MAX_CHILDREN)
				.map((v, index) => new RawObjectReplElement(`${this.id}:${index}`, String(index), v));
		} else if (isObject(this.valueObj)) {
			result = Object.getOwnPropertyNames(this.valueObj).slice(0, RawObjectReplElement.MAX_CHILDREN)
				.map((key, index) => new RawObjectReplElement(`${this.id}:${index}`, key, this.valueObj[key]));
		}

		return Promise.resolve(result);
	}

	toString(): string {
		return `${this.name}\n${this.value}`;
	}
}

export class ReplEvaluationInput implements IReplElement {
	private id: string;

	constructor(public value: string) {
		this.id = generateUuid();
	}

	toString(): string {
		return this.value;
	}

	getId(): string {
		return this.id;
	}
}

export class ReplEvaluationResult extends ExpressionContainer implements IReplElement {
	private _available = true;

	get available(): boolean {
		return this._available;
	}

	constructor() {
		super(undefined, undefined, 0, generateUuid());
	}

	override async evaluateExpression(expression: string, session: IDebugSession | undefined, stackFrame: IStackFrame | undefined, context: string): Promise<boolean> {
		const result = await super.evaluateExpression(expression, session, stackFrame, context);
		this._available = result;

		return result;
	}

	override toString(): string {
		return `${this.value}`;
	}
}

export class ReplGroup implements IReplElement {

	private children: IReplElement[] = [];
	private id: string;
	private ended = false;
	static COUNTER = 0;

	constructor(
		public name: string,
		public autoExpand: boolean,
		public sourceData?: IReplElementSource
	) {
		this.id = `replGroup:${ReplGroup.COUNTER++}`;
	}

	get hasChildren() {
		return true;
	}

	getId(): string {
		return this.id;
	}

	toString(includeSource = false): string {
		const sourceStr = (includeSource && this.sourceData) ? ` ${this.sourceData.source.name}` : '';
		return this.name + sourceStr;
	}

	addChild(child: IReplElement): void {
		const lastElement = this.children.length ? this.children[this.children.length - 1] : undefined;
		if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
			lastElement.addChild(child);
		} else {
			this.children.push(child);
		}
	}

	getChildren(): IReplElement[] {
		return this.children;
	}

	end(): void {
		const lastElement = this.children.length ? this.children[this.children.length - 1] : undefined;
		if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
			lastElement.end();
		} else {
			this.ended = true;
		}
	}

	get hasEnded(): boolean {
		return this.ended;
	}
}

function areSourcesEqual(first: IReplElementSource | undefined, second: IReplElementSource | undefined): boolean {
	if (!first && !second) {
		return true;
	}
	if (first && second) {
		return first.column === second.column && first.lineNumber === second.lineNumber && first.source.uri.toString() === second.source.uri.toString();
	}

	return false;
}

export class ReplModel {
	private replElements: IReplElement[] = [];
	private readonly _onDidChangeElements = new Emitter<void>();
	readonly onDidChangeElements = this._onDidChangeElements.event;

	constructor(private readonly configurationService: IConfigurationService) { }

	getReplElements(): IReplElement[] {
		return this.replElements;
	}

	async addReplExpression(session: IDebugSession, stackFrame: IStackFrame | undefined, name: string): Promise<void> {
		this.addReplElement(new ReplEvaluationInput(name));
		const result = new ReplEvaluationResult();
		await result.evaluateExpression(name, session, stackFrame, 'repl');
		this.addReplElement(result);
	}

	appendToRepl(session: IDebugSession, data: string | IExpression, sev: severity, source?: IReplElementSource): void {
		const clearAnsiSequence = '\u001b[2J';
		if (typeof data === 'string' && data.indexOf(clearAnsiSequence) >= 0) {
			// [2J is the ansi escape sequence for clearing the display http://ascii-table.com/ansi-escape-sequences.php
			this.removeReplExpressions();
			this.appendToRepl(session, nls.localize('consoleCleared', "Console was cleared"), severity.Ignore);
			data = data.substring(data.lastIndexOf(clearAnsiSequence) + clearAnsiSequence.length);
		}

		if (typeof data === 'string') {
			const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;
			if (previousElement instanceof SimpleReplElement && previousElement.severity === sev) {
				const config = this.configurationService.getValue<IDebugConfiguration>('debug');
				if (previousElement.value === data && areSourcesEqual(previousElement.sourceData, source) && config.console.collapseIdenticalLines) {
					previousElement.count++;
					// No need to fire an event, just the count updates and badge will adjust automatically
					return;
				}
				if (!previousElement.value.endsWith('\n') && !previousElement.value.endsWith('\r\n') && previousElement.count === 1) {
					this.replElements[this.replElements.length - 1] = new SimpleReplElement(
						session, getUniqueId(), previousElement.value + data, sev, source);
					this._onDidChangeElements.fire();
					return;
				}
			}

			const element = new SimpleReplElement(session, getUniqueId(), data, sev, source);
			this.addReplElement(element);
		} else {
			// TODO@Isidor hack, we should introduce a new type which is an output that can fetch children like an expression
			(<any>data).severity = sev;
			(<any>data).sourceData = source;
			this.addReplElement(data);
		}
	}

	startGroup(name: string, autoExpand: boolean, sourceData?: IReplElementSource): void {
		const group = new ReplGroup(name, autoExpand, sourceData);
		this.addReplElement(group);
	}

	endGroup(): void {
		const lastElement = this.replElements[this.replElements.length - 1];
		if (lastElement instanceof ReplGroup) {
			lastElement.end();
		}
	}

	private addReplElement(newElement: IReplElement): void {
		const lastElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;
		if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
			lastElement.addChild(newElement);
		} else {
			this.replElements.push(newElement);
			if (this.replElements.length > MAX_REPL_LENGTH) {
				this.replElements.splice(0, this.replElements.length - MAX_REPL_LENGTH);
			}
		}

		this._onDidChangeElements.fire();
	}

	removeReplExpressions(): void {
		if (this.replElements.length > 0) {
			this.replElements = [];
			this._onDidChangeElements.fire();
		}
	}
}
